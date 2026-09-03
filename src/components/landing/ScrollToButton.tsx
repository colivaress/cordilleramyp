"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botón que hace scroll suave a una sección de esta misma página
 * (`scrollIntoView`), no una navegación real — mismo patrón que los
 * `[data-scroll-to]` del HTML de referencia.
 */
export function ScrollToButton({
  targetId,
  children,
  ...props
}: {
  targetId: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      {...props}
    >
      {children}
    </button>
  );
}
