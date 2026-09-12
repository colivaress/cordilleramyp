"use client";

import Image from "next/image";
import { Trash2Icon } from "lucide-react";
import { InfoPopover } from "@/components/InfoPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IndicadorGuardado } from "@/components/ui/estado-accion";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ItemEstado } from "@/lib/tipos";
import type { EstadoGuardado } from "@/hooks/use-estado-guardado";

export type FotoSlot = {
  path: string | null;
  nombre: string | null;
  previewUrl: string | null;
};

const slotVacio = (): FotoSlot => ({
  path: null,
  nombre: null,
  previewUrl: null,
});

export type RespuestaEditable = {
  // Solo relevante para ítems de modo 'estado' — un ítem de modo 'fotos'
  // nunca tiene Conforme/No conforme/No aplica, este campo queda sin usar.
  estado: ItemEstado;
  // Observación POR ÍTEM — solo modo 'estado'. Los ítems de modo 'fotos'
  // comparten una única observación general para toda la revisión, aparte
  // (ver InspeccionForm, sección "Observaciones" debajo del checklist).
  observacion: string;
  // §2.8: la foto se sube a Storage apenas se selecciona. Se guarda su ruta y
  // una vista previa local; `fotoFile` ya no se acumula para subir al final.
  // Solo modo 'estado' (un ítem no conforme, una sola foto).
  fotoPath: string | null;
  fotoNombre: string | null;
  fotoPreviewUrl: string | null;
  // Solo modo 'fotos': una fila por foto obligatoria del ítem (cantidad =
  // checklist_items.fotos_requeridas — ya no es una constante fija de 2;
  // varía por ítem). Índice 0 = orden 1 en ticket_checklist_fotos, índice 1
  // = orden 2, etc.
  fotos: FotoSlot[];
};

/** `cantidadFotos` = checklist_items.fotos_requeridas del ítem (0 si modo 'estado'). */
export const respuestaVacia = (cantidadFotos = 0): RespuestaEditable => ({
  estado: "conforme",
  observacion: "",
  fotoPath: null,
  fotoNombre: null,
  fotoPreviewUrl: null,
  fotos: Array.from({ length: cantidadFotos }, slotVacio),
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
  estadoGuardado,
  onEstado,
  onObservacion,
  onFoto,
  onQuitarFoto,
  onFotoModo,
  onQuitarFotoModo,
  estadoGuardadoFoto,
}: {
  indice: number;
  item: ChecklistItem;
  valor: RespuestaEditable;
  /** Nivel 1 (retroalimentación visual) — cubre el select de estado, la
   *  observación y (modo 'estado') su única foto: un solo indicador por
   *  fila, igual granularidad que antes. */
  estadoGuardado: EstadoGuardado;
  onEstado: (estado: ItemEstado) => void;
  onObservacion: (texto: string) => void;
  onFoto: (file: File | null) => void;
  onQuitarFoto: () => void;
  /** Solo se usa (y solo hace falta pasarlo) para ítems de modo 'fotos'. */
  onFotoModo?: (orden: number, file: File | null) => void;
  onQuitarFotoModo?: (orden: number) => void;
  /** Solo modo 'fotos': un indicador independiente por cada foto obligatoria. */
  estadoGuardadoFoto?: (orden: number) => EstadoGuardado;
}) {
  if (item.modo === "fotos") {
    // checklist_items.fotos_requeridas manda la cantidad de espacios de
    // carga — un ítem de una sola foto muestra un solo espacio, no dos con
    // uno opcional.
    return (
      <div className="grid gap-3 border-b py-3 last:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            {indice.toString().padStart(2, "0")}
          </span>
          <span className="text-sm font-medium">{item.nombre}</span>
          {/* Sin InfoPopover: los ítems de modo 'fotos' no tienen exigencia
              (piden solo foto(s), no una evaluación contra un criterio). */}
        </div>
        <div
          className={cn(
            "grid gap-3",
            valor.fotos.length > 1 && "sm:grid-cols-2",
          )}
        >
          {valor.fotos.map((slot, idx) => (
            <FotoSlotInput
              key={idx}
              label={
                valor.fotos.length > 1
                  ? `Foto ${idx + 1} (obligatoria)`
                  : "Foto (obligatoria)"
              }
              slot={slot}
              disabled={!onFotoModo}
              estadoGuardado={estadoGuardadoFoto?.(idx + 1) ?? "idle"}
              onFoto={(f) => onFotoModo?.(idx + 1, f)}
              onQuitar={() => onQuitarFotoModo?.(idx + 1)}
              alt={`${item.nombre} — foto ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    );
  }

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
        <InfoPopover titulo={item.nombre} exigencia={item.exigencia ?? ""} />
        <IndicadorGuardado estado={estadoGuardado} />
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
                  disabled={estadoGuardado === "guardando"}
                  onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
                />
                {estadoGuardado === "guardando" ? (
                  <IndicadorGuardado
                    estado={estadoGuardado}
                    textoGuardando="Subiendo foto…"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Elegir una imagen o tomarla con la cámara. Se guarda al
                    instante.
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Un slot de foto (de los dos) de un ítem de modo 'fotos'. */
function FotoSlotInput({
  label,
  slot,
  disabled,
  estadoGuardado,
  onFoto,
  onQuitar,
  alt,
}: {
  label: string;
  slot: FotoSlot;
  disabled: boolean;
  estadoGuardado: EstadoGuardado;
  onFoto: (file: File | null) => void;
  onQuitar: () => void;
  alt: string;
}) {
  const inputId = `foto-modo-${alt.replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      {slot.previewUrl ? (
        <div className="flex items-start gap-3">
          <Image
            src={slot.previewUrl}
            alt={alt}
            width={160}
            height={120}
            unoptimized
            className="h-24 w-32 rounded-md border bg-white object-cover"
          />
          <div className="grid gap-1">
            {slot.nombre && (
              <span className="text-xs text-muted-foreground">{slot.nombre}</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="w-fit"
              onClick={onQuitar}
            >
              <Trash2Icon />
              Eliminar y volver a tomar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Input
            id={inputId}
            type="file"
            accept={FORMATOS_FOTO}
            capture="environment"
            disabled={disabled || estadoGuardado === "guardando"}
            onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
          />
          {estadoGuardado === "guardando" ? (
            <IndicadorGuardado
              estado={estadoGuardado}
              textoGuardando="Subiendo foto…"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              Elegir una imagen o tomarla con la cámara. Se guarda al
              instante.
            </span>
          )}
        </>
      )}
    </div>
  );
}
