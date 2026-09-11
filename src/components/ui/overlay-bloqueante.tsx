"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon } from "lucide-react";

const suscribirNoOp = () => () => {};
/** Portal solo existe en el cliente — false durante SSR, true tras hidratar. */
function useMontado() {
  return useSyncExternalStore(
    suscribirNoOp,
    () => true,
    () => false,
  );
}

/**
 * Overlay de nivel 2 — ver `useAccionLarga`. No expone ninguna forma de
 * cerrarlo (sin botón de cerrar, sin click afuera, sin Esc) a propósito: es
 * para acciones donde un segundo click del usuario significaría un envío
 * doble (dos correos, cerrar la inspección dos veces). Desaparece solo
 * cuando la acción que lo disparó resuelve.
 *
 * `inset-0` en vez de `100vh` — se mantiene correcto en el teléfono aunque
 * el teclado virtual esté abierto (`100vh` puede quedar mal calculado ahí).
 */
export function OverlayBloqueante({
  visible,
  mensaje,
}: {
  visible: boolean;
  mensaje: string;
}) {
  const montado = useMontado();

  useEffect(() => {
    if (!visible) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [visible]);

  if (!montado || !visible) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={mensaje}
      className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <div
        tabIndex={-1}
        ref={(el) => el?.focus()}
        aria-live="assertive"
        className="flex w-full max-w-[calc(100vw-2rem)] min-w-[220px] flex-col items-center gap-3 rounded-xl bg-white p-6 text-center shadow-lg outline-none sm:min-w-[260px]"
      >
        <Loader2Icon className="size-8 animate-spin text-brand-600 motion-reduce:animate-none" />
        <p className="text-sm font-medium text-neutral-900">{mensaje}</p>
      </div>
    </div>,
    document.body,
  );
}
