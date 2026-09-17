"use client";

import type { ComponentType } from "react";
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoGuardado } from "@/hooks/use-estado-guardado";

/**
 * Indicador inline de nivel 1, para un CAMPO con autoguardado (no un botón —
 * para eso ver `ContenidoBoton` más abajo, mismo estado). Se ubica junto al
 * control (checkbox, select, textarea). "idle" no renderiza nada.
 */
export function IndicadorGuardado({
  estado,
  className,
  textoGuardando = "Guardando…",
  textoGuardado = "Guardado",
  textoError = "Error al guardar",
}: {
  estado: EstadoGuardado;
  className?: string;
  textoGuardando?: string;
  textoGuardado?: string;
  textoError?: string;
}) {
  if (estado === "idle") return null;

  const base = "inline-flex items-center gap-1 text-xs";

  if (estado === "cambiando")
    // Respuesta INSTANTÁNEA al toque del usuario, antes de que exista
    // siquiera una request — un punto que late, no un mensaje largo. Es lo
    // que responde "sí, registré tu toque" sin esperar el debounce.
    return (
      <span
        className={cn(base, "text-muted-foreground", className)}
        aria-live="polite"
      >
        <span className="size-1.5 rounded-full bg-brand-500 motion-safe:animate-pulse" />
        <span className="sr-only">Cambio registrado, guardando en breve…</span>
      </span>
    );

  if (estado === "guardando")
    return (
      <span
        className={cn(base, "text-muted-foreground", className)}
        aria-live="polite"
      >
        <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
        {textoGuardando}
      </span>
    );

  if (estado === "guardado")
    return (
      <span
        className={cn(base, "text-success-700", className)}
        aria-live="polite"
      >
        <CheckIcon className="size-3" />
        {textoGuardado}
      </span>
    );

  return (
    <span
      className={cn(base, "text-danger-700", className)}
      aria-live="assertive"
    >
      <TriangleAlertIcon className="size-3" />
      {textoError}
    </span>
  );
}

/**
 * Contenido de un BOTÓN de nivel 1 — mismo hook `useEstadoGuardado`, mismo
 * lenguaje visual (spinner + texto) que `IndicadorGuardado`, adaptado a vivir
 * dentro de un `<Button>` en vez de al lado de un campo. `pendiente` ya
 * incluye tanto "cambiando" como "guardando" (ver el hook) — un botón no
 * tiene debounce, así que en la práctica siempre entra directo en
 * "guardando", pero se lee `pendiente` para no repetir esa lógica en cada
 * lugar que lo usa.
 */
export function ContenidoBoton({
  pendiente,
  texto,
  textoPendiente,
  icono: Icono,
}: {
  pendiente: boolean;
  texto: string;
  textoPendiente: string;
  /** Ícono opcional para el estado normal (no pendiente) — ej. MailIcon. */
  icono?: ComponentType<{ className?: string }>;
}) {
  if (pendiente)
    return (
      <>
        {/* Sin "size-" propio a propósito: el botón la autoajusta según su
            variante (`xs` → size-3, `default` → size-4, etc.), igual que el
            resto de los íconos de esta app dentro de <Button>. */}
        <Loader2Icon className="animate-spin motion-reduce:animate-none" />
        {textoPendiente}
      </>
    );
  return (
    <>
      {Icono && <Icono />}
      {texto}
    </>
  );
}
