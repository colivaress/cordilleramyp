"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type FotoSlot,
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
  guardarFotoChecklistItem,
  guardarObservacionGeneral,
} from "@/app/(app)/tickets/actions";
import {
  ETIQUETA_TIPO_INSPECCION,
  ORDEN_TIPOS_INSPECCION,
  type ChecklistItem,
  type ItemEstado,
  type TipoInspeccion,
} from "@/lib/tipos";

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
  // formulario. `fechaVencimiento` se precarga según el tipo elegido (§8 de
  // la fase "tipos de inspección"), editable siempre.
  fecha: aDatetimeLocal(new Date()),
  fechaVencimiento: vencimientoPorDefecto(10),
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
const vencimientoPorDefecto = (dias: number) => sumarDias(aDatetimeLocal(new Date()), dias);

/**
 * Fase "tipos de inspección" — parte 2/4, §8. Control de Salida vence en 1
 * día; los otros tres tipos siguen con 10 días, como hasta ahora. Solo cambia
 * el valor precargado — el campo sigue siendo editable por el supervisor.
 */
function diasVencimientoPorTipo(tipo: string): number {
  return tipo === "control_salida" ? 1 : 10;
}

/**
 * Fase "tipos de inspección" — cantidad de fotos obligatorias de un ítem de
 * modo 'fotos', leída de checklist_items.fotos_requeridas — ya no es una
 * constante del código (algunos ítems piden 1, otros 2).
 */
function cantidadFotosItem(item: ChecklistItem): number {
  return item.modo === "fotos" ? item.fotos_requeridas ?? 0 : 0;
}

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
  tipos,
  ticketId: ticketIdProp,
  numeroRevision = 1,
  numeroInspeccion = null,
  conductorInicial = "",
  fechaVencimientoInicial = null,
  tipoInspeccionInicial = null,
}: {
  modo: "nueva" | "reinspeccion";
  /**
   * En modo "nueva": TODOS los ítems del checklist, de los 4 tipos, sin
   * filtrar — se filtra acá según el tipo que elija el supervisor. En modo
   * "reinspeccion": ya vienen filtrados por el tipo fijo del ticket.
   */
  items: ChecklistItem[];
  /** Solo modo "nueva" — puebla el combo "Tipo de inspección". */
  tipos?: TipoInspeccion[];
  ticketId?: string;
  numeroRevision?: number;
  /** §2.6: correlativo legible del ticket (solo lectura). Null en inspección nueva sin guardar. */
  numeroInspeccion?: number | null;
  conductorInicial?: string;
  fechaVencimientoInicial?: string | null;
  /** Solo modo "reinspeccion" — el tipo es fijo desde que se creó el ticket. */
  tipoInspeccionInicial?: string | null;
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

  // Fase "tipos de inspección" — parte 2/4. Combo obligatorio, arranca sin
  // preseleccionar ("Seleccionar…"). Solo aplica en modo "nueva" — en
  // reinspección el tipo es fijo (tipoInspeccionInicial, §3 de la fase).
  const [tipoSeleccionado, setTipoSeleccionado] = useState("");
  const tipoInspeccion =
    modo === "nueva" ? tipoSeleccionado : tipoInspeccionInicial ?? "";
  const [nombreEncarpador, setNombreEncarpador] = useState("");
  const [nombreGuardia, setNombreGuardia] = useState("");
  const [nroContenedor, setNroContenedor] = useState("");

  // §2.6: conductor de ESTA revisión (solo re-inspección), prellenado con el de
  // la revisión anterior. §2.7: la fecha de vencimiento también es por revisión.
  const [conductorRevision, setConductorRevision] = useState(conductorInicial);
  const [vencRevision, setVencRevision] = useState(
    () => isoADatetimeLocal(fechaVencimientoInicial) || vencimientoPorDefecto(10),
  );

  const opcionesTipo = useMemo(() => {
    if (!tipos || tipos.length === 0) return ORDEN_TIPOS_INSPECCION;
    const claves = new Set(tipos.map((t) => t.clave));
    return ORDEN_TIPOS_INSPECCION.filter((c) => claves.has(c));
  }, [tipos]);

  // Ítems del checklist DEL TIPO elegido, ordenados — §4 de la fase.
  const itemsDelTipo = useMemo(() => {
    if (modo === "reinspeccion")
      return [...items].sort((a, b) => a.orden - b.orden);
    if (!tipoSeleccionado) return [];
    return items
      .filter((i) => i.tipo === tipoSeleccionado)
      .sort((a, b) => a.orden - b.orden);
  }, [items, modo, tipoSeleccionado]);

  // §7 de la fase: si TODO el checklist de este tipo es modo 'fotos' (hoy,
  // solo exportacion_chimolsa), no hay Conforme/No conforme por ítem — hay
  // una única observación general que define el estado resultante.
  const esSoloFotos = useMemo(
    () =>
      itemsDelTipo.length > 0 &&
      itemsDelTipo.every((i) => i.modo === "fotos"),
    [itemsDelTipo],
  );

  const [respuestas, setRespuestas] = useState<Record<string, RespuestaEditable>>(
    () =>
      Object.fromEntries(
        itemsDelTipo.map((i) => [i.key, respuestaVacia(cantidadFotosItem(i))]),
      ),
  );
  // Espejo para leer el estado más reciente dentro de callbacks async.
  const respuestasRef = useRef(respuestas);
  useEffect(() => {
    respuestasRef.current = respuestas;
  }, [respuestas]);

  const [observacionGeneral, setObservacionGeneral] = useState("");

  // El checklist a mostrar depende del tipo elegido — mientras el supervisor
  // no haya avanzado al paso 2, cambiar el tipo reinicia las respuestas
  // locales (nada se persistió todavía) y vuelve a precargar el vencimiento
  // por defecto de ese tipo (§8 de la fase). Se hace en el propio handler del
  // combo, no en un efecto — es una reacción directa a la elección del
  // usuario, no una sincronización con un sistema externo.
  function onCambiarTipo(nuevoTipo: string) {
    setTipoSeleccionado(nuevoTipo);
    const nuevosItems = nuevoTipo
      ? items
          .filter((i) => i.tipo === nuevoTipo)
          .sort((a, b) => a.orden - b.orden)
      : [];
    setRespuestas(
      Object.fromEntries(
        nuevosItems.map((i) => [i.key, respuestaVacia(cantidadFotosItem(i))]),
      ),
    );
    setObservacionGeneral("");
    if (nuevoTipo) {
      setCabecera((prev) => ({
        ...prev,
        fechaVencimiento: sumarDias(
          prev.fecha,
          diasVencimientoPorTipo(nuevoTipo),
        ),
      }));
    }
  }

  const [enviando, setEnviando] = useState(false);

  // §2.8: firmas persistidas en el estado del formulario (sobreviven a navegar
  // entre pasos) + subidas a Storage y a ticket_revisiones apenas se capturan.
  const [firmaConductorUrl, setFirmaConductorUrl] = useState<string | null>(null);
  const [firmaFiscalizadorUrl, setFirmaFiscalizadorUrl] = useState<string | null>(
    null,
  );

  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const obsGeneralTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timers = obsTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      if (obsGeneralTimer.current) clearTimeout(obsGeneralTimer.current);
    };
  }, []);

  // iOS Safari: tras cerrar el teclado virtual (al salir de un campo de texto),
  // el hit-test de los elementos no siempre se recalcula hasta el próximo
  // scroll — un botón puede quedar "clickeable visualmente" pero sin responder
  // al primer toque hasta que el usuario scrollea. Forzamos un scroll de 1px
  // (con demora, para dar tiempo a la animación de cierre del teclado) apenas
  // se sale de cualquier campo del formulario, para que Safari recalcule solo.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onFocusOut = () => {
      window.setTimeout(() => {
        window.scrollBy(0, 1);
        window.scrollBy(0, -1);
      }, 300);
    };
    form.addEventListener("focusout", onFocusOut);
    return () => form.removeEventListener("focusout", onFocusOut);
  }, []);

  const rutaFirma = (quien: "conductor" | "fiscalizador") =>
    `${ticketId}/${rev}/${quien}.png`;

  const patchResp = useCallback(
    (key: string, patch: Partial<RespuestaEditable>) => {
      setRespuestas((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    [],
  );

  const patchFotoSlot = useCallback(
    (key: string, orden: number, patch: Partial<FotoSlot>) => {
      setRespuestas((prev) => {
        const actual = prev[key];
        if (!actual) return prev;
        const fotos = [...actual.fotos];
        fotos[orden - 1] = { ...fotos[orden - 1], ...patch };
        return { ...prev, [key]: { ...actual, fotos } };
      });
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
  // Fase "tipos de inspección": además, el tipo es obligatorio y los campos
  // condicionales de su tipo (§3 de la fase) también.
  const cabeceraCompleta = useMemo(() => {
    if (modo !== "nueva") return true;
    if (!tipoSeleccionado) return false;
    if (!CAMPOS_CABECERA.every((c) => cabecera[c.key].trim() !== "")) return false;
    if (tipoSeleccionado === "control_salida")
      return nombreEncarpador.trim() !== "" && nombreGuardia.trim() !== "";
    if (tipoSeleccionado === "exportacion_chimolsa")
      return nroContenedor.trim() !== "";
    return true;
  }, [modo, tipoSeleccionado, cabecera, nombreEncarpador, nombreGuardia, nroContenedor]);
  const datosRevisionCompletos =
    conductorRevision.trim() !== "" && vencRevision.trim() !== "";
  const puedeAvanzar =
    modo === "nueva" ? cabeceraCompleta : datosRevisionCompletos;

  const noConformes = useMemo(
    () =>
      itemsDelTipo.filter(
        (i) => i.modo === "estado" && respuestas[i.key]?.estado === "no_conforme",
      ),
    [itemsDelTipo, respuestas],
  );

  function setCampoCabecera(key: keyof Cabecera, value: string) {
    setCabecera((prev) => ({ ...prev, [key]: value }));
  }

  async function irAlChecklist() {
    if (!puedeAvanzar || iniciando) return;
    setIniciando(true);
    try {
      if (modo === "nueva") {
        // §2.6/§2.8: crea la fila en `tickets`, la revisión #1 y siembra las
        // respuestas del checklist del tipo elegido — así numero_inspeccion
        // existe y se puede guardar por ítem.
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
          tipoInspeccion: tipoSeleccionado,
          nombreEncarpador:
            tipoSeleccionado === "control_salida" ? nombreEncarpador : null,
          nombreGuardia:
            tipoSeleccionado === "control_salida" ? nombreGuardia : null,
          nroContenedor:
            tipoSeleccionado === "exportacion_chimolsa" ? nroContenedor : null,
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
  // Solo para ítems de modo 'estado'.
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

  // Fase "tipos de inspección" — parte 2/4. Fotos de un ítem modo 'fotos':
  // misma lógica de subida inmediata que onFotoItem, pero contra
  // ticket_checklist_fotos (orden explícito, de 1 a fotos_requeridas del
  // ítem), no contra foto_url directamente.
  async function onFotoModoItem(key: string, orden: number, file: File | null) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (JPG, PNG, WEBP o HEIC).");
      return;
    }
    patchFotoSlot(key, orden, { subiendo: true });
    try {
      const { blob, ext } = await comprimirImagen(file);
      const path = await subirArchivo(
        "fallas",
        `${ticketId}/${key}/${orden}-${nombreFoto(ext)}`,
        blob,
        blob.type || "image/jpeg",
      );
      const previewUrl = URL.createObjectURL(blob);
      patchFotoSlot(key, orden, {
        path,
        nombre: file.name,
        previewUrl,
        subiendo: false,
      });
      await guardarFotoChecklistItem({
        ticketId,
        revisionNumero: rev,
        itemKey: key,
        orden,
        path,
      });
    } catch (e) {
      patchFotoSlot(key, orden, { subiendo: false });
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto.");
    }
  }

  async function onQuitarFotoModoItem(key: string, orden: number) {
    const slot = respuestasRef.current[key]?.fotos[orden - 1];
    if (!slot) return;
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    if (slot.path) {
      const supabase = createClient();
      await supabase.storage.from("fallas").remove([slot.path]).catch(() => {});
    }
    patchFotoSlot(key, orden, {
      path: null,
      nombre: null,
      previewUrl: null,
      subiendo: false,
    });
    try {
      await guardarFotoChecklistItem({
        ticketId,
        revisionNumero: rev,
        itemKey: key,
        orden,
        path: null,
      });
    } catch {
      /* no bloquea: "Finalizar revisión" vuelve a validar */
    }
  }

  // Fase "tipos de inspección" — §5/§7. Una sola observación para toda la
  // revisión (checklists todo modo 'fotos') — se guarda debounced, igual que
  // la observación por ítem.
  function onObservacionGeneral(texto: string) {
    setObservacionGeneral(texto);
    if (obsGeneralTimer.current) clearTimeout(obsGeneralTimer.current);
    obsGeneralTimer.current = setTimeout(async () => {
      try {
        await guardarObservacionGeneral({ ticketId, revisionNumero: rev, texto });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo guardar la observación.",
        );
      }
    }, 700);
  }

  function validarChecklist(): string | null {
    for (const item of itemsDelTipo) {
      const r = respuestas[item.key];
      if (!r) return `Falta completar "${item.nombre}".`;
      if (item.modo === "fotos") {
        const requeridas = cantidadFotosItem(item);
        if (r.fotos.length < requeridas || r.fotos.some((f) => !f.path))
          return `Faltan fotos en "${item.nombre}" (se requiere${requeridas === 1 ? "" : "n"} ${requeridas}).`;
      } else if (r.estado === "no_conforme") {
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

  // Fase "tipos de inspección" — §2: el resto de los campos queda
  // deshabilitado hasta elegir un tipo (solo aplica a modo "nueva").
  const camposDeshabilitados =
    paso === 2 || (modo === "nueva" && !tipoSeleccionado);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-6">
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
              {/* Fase "tipos de inspección": primer campo de esta sección,
                  obligatorio, sin valor preseleccionado. */}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="tipo-inspeccion">Tipo de inspección</Label>
                {/* w-fit + justify-self-start: en una grilla CSS los <select>
                    se estiran a ocupar toda la columna por defecto
                    (justify-items: stretch) — acá se lo dimensiona según su
                    contenido (la opción más larga, "Exportación (Chimolsa)")
                    en vez de a las dos columnas de la grilla. El padding
                    derecho (pr-8) deja lugar cómodo para la flecha nativa
                    del combo, que no debe quedar pegada al texto. */}
                <select
                  id="tipo-inspeccion"
                  required
                  disabled={paso === 2}
                  value={tipoSeleccionado}
                  onChange={(e) => onCambiarTipo(e.target.value)}
                  className="h-9 w-fit min-w-0 justify-self-start rounded-md border border-input bg-transparent py-1 pl-3 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Seleccionar…</option>
                  {opcionesTipo.map((clave) => (
                    <option key={clave} value={clave}>
                      {ETIQUETA_TIPO_INSPECCION[clave]}
                    </option>
                  ))}
                </select>
              </div>
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
                    disabled={camposDeshabilitados}
                    value={cabecera[c.key]}
                    onChange={(e) => setCampoCabecera(c.key, e.target.value)}
                  />
                  {c.key === "fechaVencimiento" && (
                    <span className="text-xs text-muted-foreground">
                      {tipoSeleccionado === "control_salida"
                        ? "Se precarga como la fecha de inspección + 1 día. Editable."
                        : "Se precarga como la fecha de inspección + 10 días. Editable."}
                    </span>
                  )}
                </div>
              ))}
              {/* Fase "tipos de inspección" — §3: campos condicionales por tipo. */}
              {tipoSeleccionado === "control_salida" && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre-encarpador">Nombre Encarpador</Label>
                    <Input
                      id="nombre-encarpador"
                      required
                      disabled={camposDeshabilitados}
                      value={nombreEncarpador}
                      onChange={(e) => setNombreEncarpador(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre-guardia">Nombre Guardia</Label>
                    <Input
                      id="nombre-guardia"
                      required
                      disabled={camposDeshabilitados}
                      value={nombreGuardia}
                      onChange={(e) => setNombreGuardia(e.target.value)}
                    />
                  </div>
                </>
              )}
              {tipoSeleccionado === "exportacion_chimolsa" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="nro-contenedor">Nro de Contenedor</Label>
                  <Input
                    id="nro-contenedor"
                    required
                    disabled={camposDeshabilitados}
                    value={nroContenedor}
                    onChange={(e) => setNroContenedor(e.target.value)}
                  />
                </div>
              )}
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
              {tipoInspeccionInicial && (
                <div className="grid gap-1.5">
                  <Label htmlFor="tipo-inspeccion-re">Tipo de inspección</Label>
                  <Input
                    id="tipo-inspeccion-re"
                    readOnly
                    disabled
                    value={
                      ETIQUETA_TIPO_INSPECCION[tipoInspeccionInicial] ??
                      tipoInspeccionInicial
                    }
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
                {modo === "nueva" && !tipoSeleccionado
                  ? "Elegir un tipo de inspección para continuar."
                  : "Completar todos los campos para avanzar."}
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
              {(numInsp != null || tipoInspeccion) && (
                <CardDescription>
                  {numInsp != null ? `Inspección Nro ${numInsp}` : ""}
                  {numInsp != null && tipoInspeccion ? " — " : ""}
                  {tipoInspeccion ? ETIQUETA_TIPO_INSPECCION[tipoInspeccion] : ""}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <div className="px-3">
                  {itemsDelTipo.map((item, idx) => (
                    <ChecklistItemRow
                      key={item.key}
                      indice={idx + 1}
                      item={item}
                      valor={respuestas[item.key]}
                      onEstado={(v) => onEstadoItem(item.key, v)}
                      onObservacion={(t) => onObservacionItem(item.key, t)}
                      onFoto={(f) => onFotoItem(item.key, f)}
                      onQuitarFoto={() => onQuitarFotoItem(item.key)}
                      onFotoModo={(orden, f) => onFotoModoItem(item.key, orden, f)}
                      onQuitarFotoModo={(orden) =>
                        onQuitarFotoModoItem(item.key, orden)
                      }
                    />
                  ))}
                </div>
              </div>

              {esSoloFotos ? (
                <div className="mt-4 grid gap-1.5">
                  <Label htmlFor="observacion-general">Observaciones</Label>
                  <Textarea
                    id="observacion-general"
                    value={observacionGeneral}
                    onChange={(e) => onObservacionGeneral(e.target.value)}
                    placeholder="Observaciones de la inspección (opcional)"
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {noConformes.length === 0
                    ? "Sin elementos no conformes: la revisión finalizará sin observaciones."
                    : `${noConformes.length} elemento(s) no conforme(s): la revisión finalizará con observaciones.`}
                </p>
              )}
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
