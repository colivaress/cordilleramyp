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

/** Contenedor raíz de toda la app (ver src/app/layout.tsx) — se le alterna
 *  `inert` mientras este overlay está visible. */
const ID_RAIZ_APP = "raiz-app";

/**
 * Overlay de nivel 2 — ver `useAccionLarga`. No expone ninguna forma de
 * cerrarlo (sin botón de cerrar, sin click afuera, sin Esc) a propósito: es
 * para acciones donde un segundo click del usuario significaría un envío
 * doble (dos correos, cerrar la inspección dos veces). Desaparece solo
 * cuando la acción que lo disparó resuelve.
 *
 * `inset-0` en vez de `100vh` — se mantiene correcto en el teléfono aunque
 * el teclado virtual esté abierto (`100vh` puede quedar mal calculado ahí).
 *
 * Bloqueo real del fondo — `inert` nativo, no una trampa de Tab a mano:
 * mientras `visible`, el contenedor #raiz-app (todo menos este overlay,
 * portado aparte a document.body) queda `inert` — el navegador ya se
 * encarga de sacarlo del ciclo de tabulación Y del árbol de accesibilidad
 * para lectores de pantalla con un solo atributo nativo, sin arriesgarse a
 * una trampa de foco casera que se equivoque y deje a alguien encerrado.
 *
 * El foco de vuelta al cerrarse NO se maneja acá — se intentó primero acá
 * (capturar `document.activeElement` al volverse `visible`) y después
 * dentro de `useAccionLarga.ejecutar`, pero medido en vivo las dos quedaban
 * mal: en los tres usos reales de este overlay, `useAccionLarga.ejecutar`
 * va anidado DENTRO de `useEstadoGuardado.ejecutar` (el que controla
 * `disabled={pendiente}` del botón) — y cuando la acción falla, el
 * `finally` de ACÁ adentro corre antes que el `catch`/reseteo de ESE
 * `guardado` de afuera, así que a esa altura el botón todavía está
 * deshabilitado y `.focus()` es un no-op silencioso. La restauración vive
 * en el borde exterior real — el `try/finally` de cada llamador alrededor
 * de todo el `guardado.ejecutar(...)`, ver esos componentes.
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

  useEffect(() => {
    if (!visible) return;
    const raiz = document.getElementById(ID_RAIZ_APP);
    raiz?.setAttribute("inert", "");
    // El cleanup corre tanto al pasar `visible` a false como si este
    // componente se desmonta mientras seguía visible (una navegación en
    // curso, ver asegurarRevision/finalizarInspeccion) — en los dos casos
    // hay que liberar la raíz igual, si no la página de destino queda
    // inert para siempre.
    return () => {
      raiz?.removeAttribute("inert");
    };
  }, [visible]);

  if (!montado || !visible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mensaje}
      className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <div
        tabIndex={0}
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
