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
  fecha: string;
  procedencia: string;
  tipo_camion: string;
  patente_camion: string;
  patente_rampla: string;
};

const cabeceraVacia = (): Cabecera => ({
  transporte: "",
  conductor: "",
  fecha: "",
  procedencia: "",
  tipo_camion: "",
  patente_camion: "",
  patente_rampla: "",
});

const CAMPOS_CABECERA: { key: keyof Cabecera; label: string; type?: string }[] = [
  { key: "transporte", label: "Transporte" },
  { key: "conductor", label: "Conductor" },
  { key: "fecha", label: "Fecha y hora", type: "datetime-local" },
  { key: "procedencia", label: "Procedencia" },
  { key: "tipo_camion", label: "Tipo de camión" },
  { key: "patente_camion", label: "Patente camión" },
  { key: "patente_rampla", label: "Patente rampla" },
];

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
}: {
  modo: "nueva" | "reinspeccion";
  items: ChecklistItem[];
  ticketId?: string;
  numeroRevision?: number;
  conductorInicial?: string;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(modo === "nueva" ? 1 : 2);
  const [cabecera, setCabecera] = useState<Cabecera>(cabeceraVacia);
  // §2.6: conductor de ESTA revisión (solo modo re-inspección). Prellenado con
  // el de la revisión anterior; el supervisor lo confirma o lo cambia.
  const [conductorRevision, setConductorRevision] = useState(conductorInicial);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaEditable>>(
    () => Object.fromEntries(items.map((i) => [i.key, respuestaVacia()])),
  );
  const [enviando, setEnviando] = useState(false);

  const firmaConductor = useRef<SignaturePadHandle>(null);
  const firmaFiscalizador = useRef<SignaturePadHandle>(null);

  const cabeceraCompleta = useMemo(
    () => CAMPOS_CABECERA.every((c) => cabecera[c.key].trim() !== ""),
    [cabecera],
  );

  const noConformes = useMemo(
    () => Object.values(respuestas).filter((r) => r.estado === "no_conforme"),
    [respuestas],
  );

  function setResp(key: string, v: RespuestaEditable) {
    setRespuestas((prev) => ({ ...prev, [key]: v }));
  }

  function validarChecklist(): string | null {
    if (modo === "reinspeccion" && !conductorRevision.trim())
      return "Indicá el conductor de esta revisión.";
    for (const item of items) {
      const r = respuestas[item.key];
      if (r.estado === "no_conforme") {
        if (!r.observacion.trim())
          return `Falta la observación en "${item.nombre}".`;
        if (!r.fotoFile) return `Falta la foto de la falla en "${item.nombre}".`;
        if (!r.fechaVencimiento)
          return `Falta la fecha límite de corrección en "${item.nombre}".`;
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
        modo === "nueva"
          ? crypto.randomUUID()
          : (ticketIdProp as string);
      const rev = modo === "nueva" ? 1 : numeroRevision;

      // Subir fotos de fallas
      const respuestasInput: RespuestaInput[] = [];
      for (const item of items) {
        const r = respuestas[item.key];
        let fotoPath: string | null = null;
        let fechaISO: string | null = null;
        if (r.estado === "no_conforme") {
          const ext =
            r.fotoFile?.name.split(".").pop()?.toLowerCase() || "jpg";
          fotoPath = await subirArchivo(
            "fallas",
            `${ticketId}/${item.key}/${Date.now()}.${ext}`,
            r.fotoFile as File,
            r.fotoFile?.type || "image/jpeg",
          );
          fechaISO = new Date(r.fechaVencimiento).toISOString();
        }
        respuestasInput.push({
          itemKey: item.key,
          estado: r.estado,
          observacion: r.estado === "no_conforme" ? r.observacion.trim() : null,
          fotoPath,
          fechaVencimientoISO: fechaISO,
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
            ...cabecera,
            fecha: new Date(cabecera.fecha).toISOString(),
          },
          respuestas: respuestasInput,
          firmaConductorPath,
          firmaFiscalizadorPath,
        });
      } else {
        await registrarReinspeccion({
          ticketId,
          conductor: conductorRevision.trim(),
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
        error instanceof Error ? error.message : "Error al guardar la inspección.",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      {modo === "nueva" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Datos de cabecera</CardTitle>
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
                  onChange={(e) =>
                    setCabecera((prev) => ({ ...prev, [c.key]: e.target.value }))
                  }
                />
              </div>
            ))}
            {paso === 1 && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  disabled={!cabeceraCompleta}
                  onClick={() => setPaso(2)}
                >
                  Continuar al checklist
                </Button>
                {!cabeceraCompleta && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Completá todos los campos para avanzar.
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
                <CardTitle>Conductor de esta revisión</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid max-w-sm gap-1.5">
                  <Label htmlFor="conductor-revision">Conductor</Label>
                  <Input
                    id="conductor-revision"
                    required
                    value={conductorRevision}
                    onChange={(e) => setConductorRevision(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prellenado con el de la revisión anterior. Confirmalo o
                    ingresá el chofer que se presentó ahora — no cambia el
                    conductor de las revisiones previas.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                2. Checklist de 18 elementos
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
                Volver a la cabecera
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
