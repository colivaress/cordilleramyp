/**
 * Cloudflare Turnstile — verificación antibot del formulario público de
 * cotización, server-only.
 *
 * Es invisible para quien llena el formulario: en el caso normal no se le
 * muestra nada. Solo aparece un desafío si Cloudflare considera sospechoso
 * al visitante. Eso cumple el requisito del cliente de no poner un captcha
 * a la vista.
 *
 * SIN CONFIGURAR NO ROMPE NADA. Si falta `TURNSTILE_SECRET_KEY`, la
 * verificación devuelve "sin_configurar" y el formulario sigue funcionando
 * exactamente como antes. Eso es a propósito: el formulario ya está vivo en
 * producción, y este código se despliega antes de que existan las claves —
 * si exigiera el token de entrada, dejaría el formulario roto para clientes
 * reales en la ventana entre el deploy y la carga de las variables.
 */

const URL_VERIFICACION =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type ResultadoTurnstile =
  /** Token válido: visitante verificado. */
  | { estado: "ok" }
  /** No hay secreto en el entorno — la protección está apagada. */
  | { estado: "sin_configurar" }
  /** Hay secreto, pero el cliente no mandó token (script bloqueado, sin JS,
   *  o un bot que no ejecuta JavaScript). Ambiguo: ver la política en
   *  `src/app/cotizacion/actions.ts`. */
  | { estado: "sin_token" }
  /** Había token y Cloudflare lo rechazó. Esto NO es ambiguo. */
  | { estado: "rechazado"; codigos: string[] }
  /** No se pudo preguntarle a Cloudflare (red, timeout). */
  | { estado: "error" };

/** ¿Está activada la protección? Lo usa la acción para decidir la política. */
export function turnstileConfigurado(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Le pregunta a Cloudflare si el token es válido.
 *
 * `ip` va en la consulta porque Cloudflare la usa como señal adicional; si
 * no se tiene, se omite sin problema.
 */
export async function verificarTurnstile(
  token: string | undefined | null,
  ip: string | null,
): Promise<ResultadoTurnstile> {
  const secreto = process.env.TURNSTILE_SECRET_KEY;
  if (!secreto) return { estado: "sin_configurar" };
  if (!token) return { estado: "sin_token" };

  const cuerpo = new URLSearchParams();
  cuerpo.set("secret", secreto);
  cuerpo.set("response", token);
  if (ip) cuerpo.set("remoteip", ip);

  try {
    // Timeout propio: si Cloudflare no contesta, no se deja colgado al
    // visitante esperando por una verificación antibot.
    const res = await fetch(URL_VERIFICACION, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    const datos = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (datos.success) return { estado: "ok" };
    return { estado: "rechazado", codigos: datos["error-codes"] ?? [] };
  } catch (err) {
    console.error("[turnstile] no se pudo verificar el token", err);
    return { estado: "error" };
  }
}

/** Qué hacer con una solicitud según cómo salió la verificación. */
export type DecisionTurnstile = {
  /** Descartar en silencio (con éxito falso). */
  descartar: boolean;
  /** Mandarle el acuse de recibo al solicitante. ESTA es la decisión que
   *  importa: es el único correo que sale hacia una dirección escrita por un
   *  desconocido, y por lo tanto el único camino por el que alguien podría
   *  usar el formulario para spamear a un tercero. */
  enviarAcuse: boolean;
  /** Avisarle a Jaime, en su correo, que esta solicitud no se verificó. */
  avisarSinVerificar: boolean;
};

/**
 * La política, en un solo lugar y sin tocar el entorno ni la red, para que
 * se pueda probar. La decisión de fondo:
 *
 *   - Un token RECHAZADO es un bot. Se descarta.
 *   - Un token AUSENTE es ambiguo: puede ser un bot sin JS, o una persona
 *     real con el script bloqueado. No se pierde el negocio —se guarda y
 *     Jaime se entera— pero no sale el acuse.
 *   - Sin configurar, todo se comporta como antes de que esto existiera.
 */
export function decidirPorTurnstile(
  estado: ResultadoTurnstile["estado"],
  configurado: boolean,
): DecisionTurnstile {
  if (!configurado) {
    return { descartar: false, enviarAcuse: true, avisarSinVerificar: false };
  }
  if (estado === "rechazado") {
    return { descartar: true, enviarAcuse: false, avisarSinVerificar: false };
  }
  if (estado === "ok") {
    return { descartar: false, enviarAcuse: true, avisarSinVerificar: false };
  }
  // "sin_token" | "error" | "sin_configurar" con secreto presente (no debería
  // pasar, pero si pasara es el caso prudente).
  return { descartar: false, enviarAcuse: false, avisarSinVerificar: true };
}
