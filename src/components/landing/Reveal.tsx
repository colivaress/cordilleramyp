"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const DIRECCION_TRANSFORM = {
  left: "-translate-x-14",
  right: "translate-x-14",
  up: "translate-y-9",
} as const;

/**
 * Aparición al hacer scroll (portada pública): los hijos entran con un
 * desplazamiento + fade y vuelven a ocultarse al salir del viewport, para
 * que el efecto se repita tanto al bajar como al subir — igual que el
 * `IntersectionObserver` del HTML de referencia (threshold 0.18).
 * Respeta `prefers-reduced-motion` quedando siempre visible y sin transición.
 */
export function Reveal({
  children,
  direccion = "up",
  className,
}: {
  children: ReactNode;
  direccion?: "left" | "right" | "up";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out will-change-transform motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-x-0 motion-reduce:translate-y-0",
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${DIRECCION_TRANSFORM[direccion]}`,
        className,
      )}
    >
      {children}
    </div>
  );
}
