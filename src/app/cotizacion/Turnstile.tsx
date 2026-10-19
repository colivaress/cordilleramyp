"use client";

import { useEffect, useRef } from "react";

/**
 * Widget de Cloudflare Turnstile, en modo invisible.
 *
 * No renderiza nada visible mientras Cloudflare considere normal al
 * visitante (`appearance: "interaction-only"`): el div queda vacío y el
 * token se obtiene solo. Si el visitante resulta sospechoso, aparece ahí el
 * desafío — por eso el contenedor existe aunque casi siempre esté vacío.
 *
 * SIN CLAVE PÚBLICA NO HACE NADA. Si falta `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * no carga el script ni estorba, y el formulario funciona igual que antes.
 * El servidor aplica la misma lógica con su propia clave.
 */

type TurnstileAPI = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

const ID_SCRIPT = "cf-turnstile-script";
const URL_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({
  onToken,
}: {
  /** Se llama con el token cuando Cloudflare lo entrega, y con "" cuando
   *  expira o falla — así el formulario nunca manda un token vencido. */
  onToken: (token: string) => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  // El callback se guarda en una ref para no re-renderizar el widget cada
  // vez que el formulario cambia de estado: Turnstile cobra una validación
  // por render, y re-montarlo en cada tecla sería absurdo.
  const onTokenRef = useRef(onToken);
  // La ref se actualiza en un efecto, NO durante el render. Escribirla
  // mientras React renderiza es lo que marca `react-hooks/refs`, y no es un
  // falso positivo: un render que React descarta dejaría la ref pisada con el
  // callback de un árbol que nunca se montó. Acá no hay forma de quedar con
  // uno viejo, porque esta ref solo se lee desde los callbacks de Turnstile:
  // llegan asíncronos bastante después del commit, nunca durante el render ni
  // dentro del efecto de montaje.
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    let widgetId: string | null = null;
    let cancelado = false;

    function montar() {
      if (cancelado || !contenedorRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(contenedorRef.current, {
        sitekey: siteKey!,
        appearance: "interaction-only",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
    }

    if (window.turnstile) {
      montar();
    } else {
      // Un solo <script> por página, aunque el componente se monte dos veces
      // (React en modo estricto monta y desmonta en desarrollo).
      let script = document.getElementById(ID_SCRIPT) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = ID_SCRIPT;
        script.src = URL_SCRIPT;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", montar);
    }

    return () => {
      cancelado = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Si Cloudflare ya lo soltó, no hay nada que limpiar.
        }
      }
    };
  }, []);

  return <div ref={contenedorRef} className="empty:hidden" />;
}
