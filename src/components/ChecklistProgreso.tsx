"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Contador de progreso del checklist — sticky, debajo del header de la app
 * (también sticky, §6/layout.tsx). Se agregó porque el checklist de Encarpe
 * (18 ítems) ocupa ~4,5 pantallas de 360px con la escala táctil de 44px: un
 * contador fijo en el título de la sección desaparece después de la primera
 * pantalla y deja de servir justo cuando hace falta.
 *
 * Una sola línea, no una tarjeta — el header ya es sticky y en celular puede
 * ocupar más de una pantalla por sí solo (flex-wrap con varios botones);
 * un segundo elemento fijo grande se come demasiado.
 *
 * Cuenta ítems RESPONDIDOS, no "ítem actual" ni una heurística de foco: cada
 * ítem del checklist arranca sin valor (§2.7 — mismo criterio que el combo
 * "Tipo de inspección"), así que "tiene un estado guardado" es un hecho, no
 * una inferencia. Si se salta un ítem, el contador no avanza y se nota.
 *
 * El `top` se mide del header real en vez de asumir un alto fijo — el
 * header usa flex-wrap y su altura cambia según el rol (admin ve 3 links
 * de nav, supervisor 1) y el ancho de pantalla.
 */
export function ChecklistProgreso({
  respondidos,
  total,
}: {
  respondidos: number;
  total: number;
}) {
  const [top, setTop] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const header = document.getElementById("app-header");
    if (!header) return;

    const medir = () => setTop(header.getBoundingClientRect().height);
    medir();

    observerRef.current = new ResizeObserver(medir);
    observerRef.current.observe(header);
    return () => observerRef.current?.disconnect();
  }, []);

  const porcentaje = total > 0 ? Math.round((respondidos / total) * 100) : 0;

  return (
    <div
      className="no-print sticky z-10 h-8 border-b bg-card/95 backdrop-blur"
      style={{ top }}
    >
      {/* Mismo ancho/padding que el contenido del header (layout.tsx), para
          que quede alineado con él en pantallas anchas. */}
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-3 px-4 text-xs">
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {respondidos} de {total} respondidos
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-brand-500 transition-[width] motion-reduce:transition-none",
            )}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>
    </div>
  );
}
