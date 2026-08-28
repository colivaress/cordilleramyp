"use client";

import { InfoPopover } from "@/components/InfoPopover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ItemEstado } from "@/lib/tipos";

export type RespuestaEditable = {
  estado: ItemEstado;
  observacion: string;
  fotoFile: File | null;
};

export const respuestaVacia = (): RespuestaEditable => ({
  estado: "conforme",
  observacion: "",
  fotoFile: null,
});

const OPCIONES: { value: ItemEstado; label: string }[] = [
  { value: "conforme", label: "Conforme" },
  { value: "no_conforme", label: "No conforme" },
  { value: "no_aplica", label: "No aplica" },
];

export function ChecklistItemRow({
  indice,
  item,
  valor,
  onChange,
}: {
  indice: number;
  item: ChecklistItem;
  valor: RespuestaEditable;
  onChange: (v: RespuestaEditable) => void;
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
        <select
          aria-label={`Estado de ${item.nombre}`}
          value={valor.estado}
          onChange={(e) =>
            onChange({ ...valor, estado: e.target.value as ItemEstado })
          }
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
              onChange={(e) =>
                onChange({ ...valor, observacion: e.target.value })
              }
              placeholder="Describir la falla detectada"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`foto-${item.key}`}>
              Foto de la falla (obligatoria)
            </Label>
            <Input
              id={`foto-${item.key}`}
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) =>
                onChange({ ...valor, fotoFile: e.target.files?.[0] ?? null })
              }
            />
            {valor.fotoFile && (
              <span className="text-xs text-muted-foreground">
                {valor.fotoFile.name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
