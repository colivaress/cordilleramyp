"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChecklistItemRow,
  respuestaVacia,
  type RespuestaEditable,
} from "@/components/ChecklistItemRow";
import { SignaturePad } from "@/components/SignaturePad";
import { createClient } from "@/lib/supabase/client";
import {
  iniciarInspeccion,
  iniciarReinspeccion,
  finalizarInspeccion,
  finalizarReinspeccion,
  guardarRespuestaItem,
  guardarFirmaRevision,
} from "@/app/(app)/tickets/actions";
import type { ChecklistItem, ItemEstado } from "@/lib/tipos";

type Cabecera = {
  transporte: string;
  conductor: string;
  fecha: string; // datetime-local
  fechaVencimiento: string; // datetime-local
  procedencia: string;
  tipo_camion: string;
  patente_camion: string;
  patente_rampla: string;
};

const cabeceraVacia = (): Cabecera => ({
  transporte: "",
  conductor: "",
  // §1: la fecha/hora de inspección NO es editable — se fija al abrir el
  // formulario. `fechaVencimiento` se precarga como fecha + 10 días (editable).
  fecha: aDatetimeLocal(new Date()),
  fechaVencimiento: vencimientoPorDefecto(),
  procedencia: "",
  tipo_camion: "",
  patente_camion: "",
  patente_rampla: "",
});

// §2.7: campos obligatorios de "Datos de Inspección" (validación de cliente).
// §1: `fecha` NO va acá — no es un input, se carga sola y siempre tiene valor.
const CAMPOS_CABECERA: { key: keyof Cabecera; label: string; type?: string }[] = [
  { key: "transporte", label: "Transporte" },
  { key: "conductor", label: "Conductor" },
  {
    key: "fechaVencimiento",
    label: "Fecha de vencimiento de la corrección",
    type: "datetime-local",
  },
  { key: "procedencia", label: "Procedencia" },
  { key: "tipo_camion", label: "Tipo de camión" },
  { key: "patente_camion", label: "Patente camión" },
  { key: "patente_rampla", label: "Patente rampla" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const aDatetimeLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
const isoADatetimeLocal = (iso: string | null | undefined) =>
  iso ? aDatetimeLocal(new Date(iso)) : "";
/** datetime-local + N días → datetime-local. */
function sumarDias(datetimeLocal: string, dias: number): string {
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + dias);
  return aDatetimeLocal(d);
}
const vencimientoPorDefecto = () => sumarDias(aDatetimeLocal(new Date()), 10);

async function subirArchivo(
  bucket: string,
  path: string,
  file: Blob,
  contentType: string,
) {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Error subiendo ${path}: ${error.message}`);
  return path;
}

const dataUrlABlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

/** Nombre de archivo único para la foto de una falla (fuera del render). */
function nombreFoto(ext: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/**
 * §4.1: comprime/redimensiona la foto ANTES de subirla al bucket `fallas`
 * (máx. 1600px de ancho, JPEG ~80%). Una foto de celular sin comprimir pesa
 * varios MB y hace lento tanto el informe por correo como el lightbox del
 * detalle. Si el navegador no puede decodificar el formato (p. ej. HEIC en
 * Android/Chrome), se sube el archivo original sin tocar.
 */
async function comprimirImagen(
  file: File,
  maxAncho = 1600,
  calidad = 0.8,
): Promise<{ blob: Blob; ext: string }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const escala = Math.min(1, maxAncho / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", calidad),
    );
    if (!blob) throw new Error("toBlob devolvió null");
    return { blob, ext: "jpg" };
  } catch {
    return {
      blob: file,
      ext: file.name.split(".").pop()?.toLowerCase() || "jpg",
    };
  }
}

export function InspeccionForm({
  modo,
  items,
  ticketId: ticketIdProp,
  numeroRevision = 1,
  numeroInspeccion = null,
  conductorInicial = "",
  fechaVencimientoInicial = null,
}: {
  modo: "nueva" | "reinspeccion";
  items: ChecklistItem[];
  ticketId?: string;
  numeroRevision?: number;
  /** §2.6: correlativo legible del ticket (solo lectura). Null en inspección nueva sin guardar. */
  numeroInspeccion?: number | null;
  conductorInicial?: string;
  fechaVencimientoInicial?: string | null;
}) {
  const router = useRouter();

  // §2.8: el id del ticket y el nro de revisión se fijan al montar, así cada
  // firma/foto/respuesta se guarda con una ruta estable ANTES de "Finalizar
  // revisión".
  const [ticketId] = useState(() => ticketIdProp ?? crypto.randomUUID());
  const rev = modo === "nueva" ? 1 : numeroRevision;

  const [paso, setPaso] = useState<1 | 2>(1);
  // El paso 2 se monta una sola vez y NO se desmonta al volver atrás (§2.8) — se
  // oculta con CSS para que el <canvas> de las firmas conserve su contenido.
  const [pasoMaxVisto, setPasoMaxVisto] = useState<1 | 2>(1);
  const [iniciando, setIniciando] = useState(false);
  // §2.6: en inspección nueva el numero_inspeccion se conoce recién al crear el
  // ticket (al pasar de la cabecera al checklist). En re-inspección viene por prop.
  const [numInsp, setNumInsp] = useState<number | null>(numeroInspeccion);

  const [cabecera, setCabecera] = useState<Cabecera>(cabeceraVacia);

  // §2.6: conductor de ESTA revisión (solo re-inspección), prellenado con el de
  // la revisión anterior. §2.7: la fecha de vencimiento también es por revisión.
  const [conductorRevision, setConductorRevision] = useState(conductorInicial);
  const [vencRevision, setVencRevision] = useState(
    () => isoADatetimeLocal(fechaVencimientoInicial) || vencimientoPorDefecto(),
  );

  const [respuestas, setRespuestas] = useState<Record<string, RespuestaEditable>>(
    () => Object.fromEntries(items.map((i) => [i.key, respuestaVacia()])),
  );
  // Espejo para leer el estado más reciente dentro de callbacks async.
  const respuestasRef = useRef(respuestas);
  useEffect(() => {
    respuestasRef.current = respuestas;
  }, [respuestas]);

  const [enviando, setEnviando] = useState(false);

  // §2.8: firmas persistidas en el estado del formulario (sobreviven a navegar
  // entre pasos) + subidas a Storage y a ticket_revisiones apenas se capturan.
  const [firmaConductorUrl, setFirmaConductorUrl] = useState<string | null>(null);
  const [firmaFiscalizadorUrl, setFirmaFiscalizadorUrl] = useState<string | null>(
    null,
  );

  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = obsTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const rutaFirma = (quien: "conductor" | "fiscalizador") =>
    `${ticketId}/${rev}/${quien}.png`;

  const patchResp = useCallback(
    (key: string, patch: Partial<RespuestaEditable>) => {
      setRespuestas((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    [],
  );

  async function persistirFirma(
    quien: "conductor" | "fiscalizador",
    dataUrl: string | null,
  ) {
    if (quien === "conductor") setFirmaConductorUrl(dataUrl);
    else setFirmaFiscalizadorUrl(dataUrl);

    try {
      let path: string | null = null;
      if (dataUrl) {
        path = await subirArchivo(
          "firmas",
          rutaFirma(quien),
          await dataUrlABlob(dataUrl),
          "image/png",
        );
      } else {
        const supabase = createClient();
        await supabase.storage.from("firmas").remove([rutaFirma(quien)]);
      }
      // §2.8: la ruta queda en ticket_revisiones al instante — sobrevive a una
      // falla de "Finalizar revisión".
      await guardarFirmaRevision({
        ticketId,
        revisionNumero: rev,
        quien,
        path,
      });
    } catch {
      // Subida diferida: se reintenta sí o sí en onSubmit antes de cerrar.
      toast.warning(
        "No se pudo guardar la firma todavía; se reintentará al finalizar.",
      );
    }
  }

  // §2.7: validación de cliente real — todos los campos deben estar completos.
  const cabeceraCompleta = useMemo(
    () => CAMPOS_CABECERA.every((c) => cabecera[c.key].trim() !== ""),
    [cabecera],
  );
  const datosRevisionCompletos =
    conductorRevision.trim() !== "" && vencRevision.trim() !== "";
  const puedeAvanzar =
    modo === "nueva" ? cabeceraCompleta : datosRevisionCompletos;

  const noConformes = useMemo(
    () => Object.values(respuestas).filter((r) => r.estado === "no_conforme"),
    [respuestas],
  );

  function setCampoCabecera(key: keyof Cabecera, value: string) {
    setCabecera((prev) => ({ ...prev, [key]: value }));
  }

  async function irAlChecklist() {
    if (!puedeAvanzar || iniciando) return;
    setIniciando(true);
    try {
      if (modo === "nueva") {
        // §2.6/§2.8: crea la fila en `tickets`, la revisión #1 y siembra las 18
        // respuestas — así numero_inspeccion existe y se puede guardar por ítem.
        const res = await iniciarInspeccion({
          ticketId,
          cabecera: {
            transporte: cabecera.transporte,
            conductor: cabecera.conductor,
            fecha: new Date(cabecera.fecha).toISOString(),
            procedencia: cabecera.procedencia,
            tipo_camion: cabecera.tipo_camion,
            patente_camion: cabecera.patente_camion,
            patente_rampla: cabecera.patente_rampla,
          },
          fechaVencimientoISO: new Date(
            cabecera.fechaVencimiento,
          ).toISOString(),
        });
        setNumInsp(res.numeroInspeccion);
      } else {
        await iniciarReinspeccion({
          ticketId,
          conductor: conductorRevision.trim(),
          fechaVencimientoISO: new Date(vencRevision).toISOString(),
        });
      }
      setPaso(2);
      setPasoMaxVisto(2);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo iniciar la revisión.",
      );
    } finally {
      setIniciando(false);
    }
  }

  // §2.8: cada respuesta se guarda apenas se marca — no todas juntas al final.
  async function onEstadoItem(key: string, estado: ItemEstado) {
    patchResp(key, { estado });
    const actual = respuestasRef.current[key];
    try {
      const res = await guardarRespuestaItem({
        ticketId,
        revisionNumero: rev,
        itemKey: key,
        estado,
        observacion: actual.observacion,
        fotoPath: actual.fotoPath,
      });
      patchResp(key, { guardado: res.guardado });
    } catch (e) {
      patchResp(key, { guardado: false });
      toast.error(
        e instanceof Error ? e.message : "No se pudo guardar el elemento.",
      );
    }
  }

  function onObservacionItem(key: string, texto: string) {
    patchResp(key, { observacion: texto, guardado: false });
    clearTimeout(obsTimers.current[key]);
    obsTimers.current[key] = setTimeout(async () => {
      const r = respuestasRef.current[key];
      // Solo se persiste si el ítem es no_conforme y ya tiene foto (constraint).
      if (r.estado !== "no_conforme" || !r.fotoPath) return;
      try {
        await guardarRespuestaItem({
          ticketId,
          revisionNumero: rev,
          itemKey: key,
          estado: r.estado,
          observacion: texto,
          fotoPath: r.fotoPath,
        });
        patchResp(key, { guardado: true });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar la observación.",
        );
      }
    }, 700);
  }

  async function onFotoItem(key: string, file: File | null) {
    if (!file) return;
    // §2.8: solo imágenes fotográficas (rechaza PDF, video, etc.).
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (JPG, PNG, WEBP o HEIC).");
      return;
    }
    patchResp(key, { subiendoFoto: true });
    try {
      const { blob, ext } = await comprimirImagen(file);
      const path = await subirArchivo(
        "fallas",
        `${ticketId}/${key}/${nombreFoto(ext)}`,
        blob,
        blob.type || "image/jpeg",
      );
      const previewUrl = URL.createObjectURL(blob);
      patchResp(key, {
        fotoPath: path,
        fotoNombre: file.name,
        fotoPreviewUrl: previewUrl,
        subiendoFoto: false,
      });
      // Ya con foto, la fila no_conforme completa se puede persistir.
      const r = respuestasRef.current[key];
      await guardarRespuestaItem({
        ticketId,
        revisionNumero: rev,
        itemKey: key,
        estado: "no_conforme",
        observacion: r.observacion,
        fotoPath: path,
      });
      patchResp(key, { guardado: true });
    } catch (e) {
      patchResp(key, { subiendoFoto: false });
      toast.error(
        e instanceof Error ? e.message : "No se pudo subir la foto.",
      );
    }
  }

  async function onQuitarFotoItem(key: string) {
    const r = respuestasRef.current[key];
    if (r.fotoPreviewUrl) URL.revokeObjectURL(r.fotoPreviewUrl);
    if (r.fotoPath) {
      const supabase = createClient();
      await supabase.storage
        .from("fallas")
        .remove([r.fotoPath])
        .catch(() => {});
    }
    patchResp(key, {
      fotoPath: null,
      fotoNombre: null,
      fotoPreviewUrl: null,
      guardado: false,
    });
    // Sin foto, la fila no_conforme deja de ser válida: se borra en la BD.
    try {
      await guardarRespuestaItem({
        ticketId,
        revisionNumero: rev,
        itemKey: key,
        estado: "no_conforme",
        observacion: r.observacion,
        fotoPath: null,
      });
    } catch {
      /* no bloquea: "Finalizar revisión" vuelve a validar */
    }
  }

  function validarChecklist(): string | null {
    for (const item of items) {
      const r = respuestas[item.key];
      if (r.estado === "no_conforme") {
        if (!r.observacion.trim())
          return `Falta la observación en "${item.nombre}".`;
        if (!r.fotoPath) return `Falta la foto de la falla en "${item.nombre}".`;
      }
    }
    if (!firmaConductorUrl) return "Falta la firma del conductor.";
    if (!firmaFiscalizadorUrl)
      return "Falta la firma del fiscalizador/supervisor.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validarChecklist();
    if (err) {
      toast.error(err);
      return;
    }
    setEnviando(true);
    try {
      // §2.8: las firmas ya se subieron al capturarse; acá se re-suben con el
      // trazo actual y se re-guarda la ruta, para dejar todo consistente sí o sí
      // antes de cerrar.
      const firmaConductorPath = await subirArchivo(
        "firmas",
        rutaFirma("conductor"),
        await dataUrlABlob(firmaConductorUrl as string),
        "image/png",
      );
      const firmaFiscalizadorPath = await subirArchivo(
        "firmas",
        rutaFirma("fiscalizador"),
        await dataUrlABlob(firmaFiscalizadorUrl as string),
        "image/png",
      );
      await guardarFirmaRevision({
        ticketId,
        revisionNumero: rev,
        quien: "conductor",
        path: firmaConductorPath,
      });
      await guardarFirmaRevision({
        ticketId,
        revisionNumero: rev,
        quien: "fiscalizador",
        path: firmaFiscalizadorPath,
      });

      // §2.8: "Finalizar revisión" solo CIERRA sobre datos ya guardados.
      if (modo === "nueva") {
        const res = await finalizarInspeccion({ ticketId });
        toast.success(
          `Inspección guardada (Nro ${res.numeroInspeccion}). Generar y enviar el informe.`,
        );
        router.push(`/tickets/${res.ticketId}/report`);
      } else {
        const res = await finalizarReinspeccion({
          ticketId,
          revisionNumero: rev,
        });
        toast.success("Revisión guardada. Generar y enviar el informe.");
        router.push(`/tickets/${res.ticketId}/report`);
      }
      router.refresh();
    } catch (error) {
      setEnviando(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al cerrar la revisión. El checklist ya quedó guardado; se puede reintentar desde el ticket.",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card className={cn(paso === 2 && "hidden")}>
        <CardHeader>
          <CardTitle>
            {modo === "nueva" ? "1. Datos de Inspección" : "Datos de esta revisión"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {modo === "nueva" ? (
            <>
              {/* §2.6: el "Nro de Inspección" NO se muestra en este paso — el
                  ticket todavía no existe. Aparece recién en el paso 2 (título
                  "Inspección Nro X"), en el detalle, el informe y la tabla. */}
              {/* §1: la fecha/hora de inspección se registra sola, solo lectura. */}
              <div className="grid gap-1.5">
                <Label htmlFor="fecha-inspeccion">
                  Fecha y hora de inspección
                </Label>
                <Input
                  id="fecha-inspeccion"
                  type="text"
                  readOnly
                  disabled
                  value={
                    cabecera.fecha
                      ? new Date(cabecera.fecha).toLocaleString("es-CL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Se registra automáticamente al abrir la inspección.
                </span>
              </div>
              {CAMPOS_CABECERA.map((c) => (
                <div key={c.key} className="grid gap-1.5">
                  <Label htmlFor={c.key}>{c.label}</Label>
                  <Input
                    id={c.key}
                    type={c.type ?? "text"}
                    required
                    disabled={paso === 2}
                    value={cabecera[c.key]}
                    onChange={(e) => setCampoCabecera(c.key, e.target.value)}
                  />
                  {c.key === "fechaVencimiento" && (
                    <span className="text-xs text-muted-foreground">
                      Se precarga como la fecha de inspección + 10 días. Editable.
                    </span>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              {numeroInspeccion != null && (
                <div className="grid gap-1.5">
                  <Label htmlFor="numero-inspeccion-re">Nro de Inspección</Label>
                  <Input
                    id="numero-inspeccion-re"
                    readOnly
                    disabled
                    value={String(numeroInspeccion)}
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="conductor-revision">Conductor</Label>
                <Input
                  id="conductor-revision"
                  required
                  disabled={paso === 2}
                  value={conductorRevision}
                  onChange={(e) => setConductorRevision(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Prellenado con el de la revisión anterior. Confirmarlo o
                  ingresar el chofer que se presentó ahora — no cambia el
                  conductor de las revisiones previas.
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="venc-revision">
                  Fecha de vencimiento de la corrección
                </Label>
                <Input
                  id="venc-revision"
                  type="datetime-local"
                  required
                  disabled={paso === 2}
                  value={vencRevision}
                  onChange={(e) => setVencRevision(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={!puedeAvanzar || iniciando}
              onClick={irAlChecklist}
            >
              {iniciando ? "Preparando revisión…" : "Realizar revisión"}
            </Button>
            {!puedeAvanzar && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Completar todos los campos para avanzar.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {pasoMaxVisto === 2 && (
        <div className={cn("grid gap-6", paso === 1 && "hidden")}>
          <Card>
            <CardHeader>
              <CardTitle>
                2. Elementos a Fiscalizar
                {modo === "reinspeccion" ? ` — Revisión #${numeroRevision}` : ""}
              </CardTitle>
              {/* §2.13: el Nro de Inspección se conoce apenas se crea el ticket
                  ("Realizar revisión") — se muestra acá de inmediato. */}
              {numInsp != null && (
                <CardDescription>Inspección Nro {numInsp}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <div className="px-3">
                  {items.map((item, idx) => (
                    <ChecklistItemRow
                      key={item.key}
                      indice={idx + 1}
                      item={item}
                      valor={respuestas[item.key]}
                      onEstado={(v) => onEstadoItem(item.key, v)}
                      onObservacion={(t) => onObservacionItem(item.key, t)}
                      onFoto={(f) => onFotoItem(item.key, f)}
                      onQuitarFoto={() => onQuitarFotoItem(item.key)}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {noConformes.length === 0
                  ? "Sin elementos no conformes: la revisión finalizará sin observaciones."
                  : `${noConformes.length} elemento(s) no conforme(s): la revisión finalizará con observaciones.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cada elemento se guarda apenas se marca — si algo falla al
                finalizar, el checklist no se pierde.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Firmas digitales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <SignaturePad
                label="Firma Conductor"
                visible={paso === 2}
                initialDataUrl={firmaConductorUrl}
                onChange={(d) => persistirFirma("conductor", d)}
              />
              <SignaturePad
                label="Firma Fiscalizador/Supervisor"
                visible={paso === 2}
                initialDataUrl={firmaFiscalizadorUrl}
                onChange={(d) => persistirFirma("fiscalizador", d)}
              />
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Finalizar revisión"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={enviando}
              onClick={() => setPaso(1)}
            >
              Volver a los datos
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
