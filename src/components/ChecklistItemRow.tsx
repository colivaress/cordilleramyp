"use client";

import Image from "next/image";
import { Trash2Icon } from "lucide-react";
import { InfoPopover } from "@/components/InfoPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ItemEstado } from "@/lib/tipos";

export type RespuestaEditable = {
  estado: ItemEstado;
  observacion: string;
  // §2.8: la foto se sube a Storage apenas se selecciona. Se guarda su ruta y
  // una vista previa local; `fotoFile` ya no se acumula para subir al final.
  fotoPath: string | null;
  fotoNombre: string | null;
  fotoPreviewUrl: string | null;
  subiendoFoto: boolean;
  // ¿la fila ya está persistida en ticket_checklist_respuestas?
  guardado: boolean;
};

export const respuestaVacia = (): RespuestaEditable => ({
  estado: "conforme",
  observacion: "",
  fotoPath: null,
  fotoNombre: null,
  fotoPreviewUrl: null,
  subiendoFoto: false,
  guardado: false,
});

const OPCIONES: { value: ItemEstado; label: string }[] = [
  { value: "conforme", label: "Conforme" },
  { value: "no_conforme", label: "No conforme" },
  { value: "no_aplica", label: "No aplica" },
];

// §2.8: solo formatos de imagen fotográfica.
export const FORMATOS_FOTO = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export function ChecklistItemRow({
  indice,
  item,
  valor,
  onEstado,
  onObservacion,
  onFoto,
  onQuitarFoto,
}: {
  indice: number;
  item: ChecklistItem;
  valor: RespuestaEditable;
  onEstado: (estado: ItemEstado) => void;
  onObservacion: (texto: string) => void;
  onFoto: (file: File | null) => void;
  onQuitarFoto: () => void;
}) {
  const noConforme = valor.estado === "no_conforme";

  return (
    <div
      className={cn(
        "grid gap-3 border-b py-3 last:border-b-0",
        noConforme && "rounded-lg bg-danger-50 px-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {indice.toString().padStart(2, "0")}
        </span>
        <span className="text-sm font-medium">{item.nombre}</span>
        <InfoPopover titulo={item.nombre} exigencia={item.exigencia} />
        {valor.guardado && (
          <span className="text-xs text-success-700">✓ Guardado</span>
        )}
        <select
          aria-label={`Estado de ${item.nombre}`}
          value={valor.estado}
          onChange={(e) => onEstado(e.target.value as ItemEstado)}
          className="ml-auto h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {OPCIONES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {noConforme && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`obs-${item.key}`}>Observación (obligatoria)</Label>
            <Textarea
              id={`obs-${item.key}`}
              required
              value={valor.observacion}
              onChange={(e) => onObservacion(e.target.value)}
              placeholder="Describir la falla detectada"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`foto-${item.key}`}>
              Foto de la falla (obligatoria)
            </Label>

            {valor.fotoPreviewUrl ? (
              <div className="flex items-start gap-3">
                <Image
                  src={valor.fotoPreviewUrl}
                  alt={`Foto de la falla en ${item.nombre}`}
                  width={160}
                  height={120}
                  unoptimized
                  className="h-24 w-32 rounded-md border bg-white object-cover"
                />
                <div className="grid gap-1">
                  {valor.fotoNombre && (
                    <span className="text-xs text-muted-foreground">
                      {valor.fotoNombre}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="w-fit"
                    onClick={onQuitarFoto}
                  >
                    <Trash2Icon />
                    Eliminar y volver a tomar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Input
                  id={`foto-${item.key}`}
                  type="file"
                  accept={FORMATOS_FOTO}
                  capture="environment"
                  disabled={valor.subiendoFoto}
                  onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
                />
                <span className="text-xs text-muted-foreground">
                  {valor.subiendoFoto
                    ? "Subiendo foto…"
                    : "Elegir una imagen o tomarla con la cámara. Se guarda al instante."}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
