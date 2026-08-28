"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChecklistItemRow,
  respuestaVacia,
  type RespuestaEditable,
} from "@/components/ChecklistItemRow";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { createClient } from "@/lib/supabase/client";
import {
  crearInspeccion,
  registrarReinspeccion,
  type RespuestaInput,
} from "@/app/(app)/tickets/actions";
import type { ChecklistItem } from "@/lib/tipos";

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
  fecha: "",
  fechaVencimiento: "",
  procedencia: "",
  tipo_camion: "",
  patente_camion: "",
  patente_rampla: "",
});

// §2.7: todos los campos de "Datos de Inspección" son obligatorios, incluido el
// nuevo `fechaVencimiento` (ubicado acá, no junto a la carga de fotos).
const CAMPOS_CABECERA: { key: keyof Cabecera; label: string; type?: string }[] = [
  { key: "transporte", label: "Transporte" },
  { key: "conductor", label: "Conductor" },
  { key: "fecha", label: "Fecha y hora de inspección", type: "datetime-local" },
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

export function InspeccionForm({
  modo,
  items,
  ticketId: ticketIdProp,
  numeroRevision = 1,
  conductorInicial = "",
  fechaVencimientoInicial = null,
}: {
  modo: "nueva" | "reinspeccion";
  items: ChecklistItem[];
  ticketId?: string;
  numeroRevision?: number;
  conductorInicial?: string;
  fechaVencimientoInicial?: string | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(modo === "nueva" ? 1 : 2);
  const [cabecera, setCabecera] = useState<Cabecera>(cabeceraVacia);
  // ¿el supervisor editó la fecha de vencimiento a mano? Si sí, no la pisamos al
  // cambiar la fecha de inspección (§2.7).
  const [vencManual, setVencManual] = useState(false);

  // §2.6: conductor de ESTA revisión (solo re-inspección), prellenado con el de
  // la revisión anterior. §2.7: la fecha de vencimiento también es por revisión.
  const [conductorRevision, setConductorRevision] = useState(conductorInicial);
  const [vencRevision, setVencRevision] = useState(
    () => isoADatetimeLocal(fechaVencimientoInicial) || vencimientoPorDefecto(),
  );

  const [respuestas, setRespuestas] = useState<Record<string, RespuestaEditable>>(
    () => Object.fromEntries(items.map((i) => [i.key, respuestaVacia()])),
  );
  const [enviando, setEnviando] = useState(false);

  const firmaConductor = useRef<SignaturePadHandle>(null);
  const firmaFiscalizador = useRef<SignaturePadHandle>(null);

  // §2.7: validación de cliente real — todos los campos deben estar completos.
  const cabeceraCompleta = useMemo(
    () => CAMPOS_CABECERA.every((c) => cabecera[c.key].trim() !== ""),
    [cabecera],
  );

  const noConformes = useMemo(
    () => Object.values(respuestas).filter((r) => r.estado === "no_conforme"),
    [respuestas],
  );

  function setCampoCabecera(key: keyof Cabecera, value: string) {
    setCabecera((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "fechaVencimiento") {
        setVencManual(true);
      } else if (key === "fecha" && !vencManual && value) {
        // Precarga automática: fecha de inspección + 10 días (editable).
        next.fechaVencimiento = sumarDias(value, 10);
      }
      return next;
    });
  }

  function setResp(key: string, v: RespuestaEditable) {
    setRespuestas((prev) => ({ ...prev, [key]: v }));
  }

  function validarChecklist(): string | null {
    if (modo === "reinspeccion") {
      if (!conductorRevision.trim())
        return "Indicar el conductor de esta revisión.";
      if (!vencRevision)
        return "Indicar la fecha de vencimiento de la corrección.";
    }
    for (const item of items) {
      const r = respuestas[item.key];
      if (r.estado === "no_conforme") {
        if (!r.observacion.trim())
          return `Falta la observación en "${item.nombre}".`;
        if (!r.fotoFile) return `Falta la foto de la falla en "${item.nombre}".`;
      }
    }
    if (firmaConductor.current?.isEmpty() ?? true)
      return "Falta la firma del conductor.";
    if (firmaFiscalizador.current?.isEmpty() ?? true)
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
      const ticketId =
        modo === "nueva" ? crypto.randomUUID() : (ticketIdProp as string);
      const rev = modo === "nueva" ? 1 : numeroRevision;

      const fechaVencimientoISO = new Date(
        modo === "nueva" ? cabecera.fechaVencimiento : vencRevision,
      ).toISOString();

      // Subir fotos de fallas
      const respuestasInput: RespuestaInput[] = [];
      for (const item of items) {
        const r = respuestas[item.key];
        let fotoPath: string | null = null;
        if (r.estado === "no_conforme") {
          const ext =
            r.fotoFile?.name.split(".").pop()?.toLowerCase() || "jpg";
          fotoPath = await subirArchivo(
            "fallas",
            `${ticketId}/${item.key}/${Date.now()}.${ext}`,
            r.fotoFile as File,
            r.fotoFile?.type || "image/jpeg",
          );
        }
        respuestasInput.push({
          itemKey: item.key,
          estado: r.estado,
          observacion: r.estado === "no_conforme" ? r.observacion.trim() : null,
          fotoPath,
        });
      }

      // Subir firmas
      const firmaConductorPath = await subirArchivo(
        "firmas",
        `${ticketId}/${rev}/conductor.png`,
        await dataUrlABlob(firmaConductor.current!.toDataURL()),
        "image/png",
      );
      const firmaFiscalizadorPath = await subirArchivo(
        "firmas",
        `${ticketId}/${rev}/fiscalizador.png`,
        await dataUrlABlob(firmaFiscalizador.current!.toDataURL()),
        "image/png",
      );

      if (modo === "nueva") {
        await crearInspeccion({
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
          fechaVencimientoISO,
          respuestas: respuestasInput,
          firmaConductorPath,
          firmaFiscalizadorPath,
        });
      } else {
        await registrarReinspeccion({
          ticketId,
          conductor: conductorRevision.trim(),
          fechaVencimientoISO,
          respuestas: respuestasInput,
          firmaConductorPath,
          firmaFiscalizadorPath,
        });
      }
      // Las server actions redirigen; este refresh es por si acaso.
      router.refresh();
    } catch (error) {
      setEnviando(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al guardar la inspección.",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      {modo === "nueva" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Datos de Inspección</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
            {paso === 1 && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  disabled={!cabeceraCompleta}
                  onClick={() => setPaso(2)}
                >
                  Realizar revisión
                </Button>
                {!cabeceraCompleta && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Completar todos los campos para avanzar.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {paso === 2 && (
        <>
          {modo === "reinspeccion" && (
            <Card>
              <CardHeader>
                <CardTitle>Datos de esta revisión</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="conductor-revision">Conductor</Label>
                  <Input
                    id="conductor-revision"
                    required
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
                    value={vencRevision}
                    onChange={(e) => setVencRevision(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                2. Elementos a Fiscalizar
                {modo === "reinspeccion" ? ` — Revisión #${numeroRevision}` : ""}
              </CardTitle>
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
                      onChange={(v) => setResp(item.key, v)}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {noConformes.length === 0
                  ? "Sin elementos no conformes: la revisión finalizará sin observaciones."
                  : `${noConformes.length} elemento(s) no conforme(s): la revisión finalizará con observaciones.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Firmas digitales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <SignaturePad ref={firmaConductor} label="Firma Conductor" />
              <SignaturePad
                ref={firmaFiscalizador}
                label="Firma Fiscalizador/Supervisor"
              />
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Finalizar revisión"}
            </Button>
            {modo === "nueva" && (
              <Button
                type="button"
                variant="ghost"
                disabled={enviando}
                onClick={() => setPaso(1)}
              >
                Volver a los datos de inspección
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
