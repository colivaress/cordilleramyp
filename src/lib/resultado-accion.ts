/**
 * Resultado de una Server Action que puede fallar de forma esperada (una
 * regla de negocio: "ya fue finalizada", "faltan 3 ítems por responder") o
 * inesperada (una falla de infraestructura: RLS, red, constraint).
 *
 * En producción, un `throw` dentro de una Server Action llega al cliente
 * como un mensaje redactado y genérico ("Minified React error #NNN") — es
 * el comportamiento documentado de Next.js, a propósito, para no filtrar
 * detalles (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md: "Errors forwarded from Server Components
 * show a generic message... to prevent leaking sensitive details").
 *
 * 🔴 Esto ya causó un incidente caro en este proyecto: la migración 21
 * rompió `iniciarInspeccion` (una política RLS refactorizada hacía que el
 * INSERT ... RETURNING de creación de tickets violara su propia política).
 * El síntoma en pantalla era ese mismo "Minified React error #441" — la
 * causa real ("new row violates row-level security policy for table
 * tickets") solo se encontró leyendo los logs de Postgres. La migración 22
 * revirtió el refactor, pero el mecanismo que ocultó el síntoma real nunca
 * se corrigió hasta ahora.
 *
 * Por eso ninguna Server Action de `tickets/actions.ts` ni
 * `usuarios/actions.ts` lanza un error que el usuario deba leer — devuelve
 * `{ ok: false, mensaje }` con un texto real, y el cliente lo muestra
 * directamente (sin pasar por `error.message` de una excepción cruzando el
 * límite servidor→cliente). El mismo patrón que ya usa
 * `src/app/api/informe/[id]/enviar/route.ts` (`NextResponse.json({ error },
 * { status })` en vez de throw) — no es nuevo, se extiende a las Server
 * Actions, que hasta ahora eran el único lugar sin este resguardo.
 *
 * Los `throw` no desaparecen del todo: siguen sirviendo para lo
 * genuinamente inesperado, donde el mensaje opaco no molesta porque igual
 * hay que ir a los logs — ver `errorInesperado` más abajo, que loguea el
 * error real del lado del servidor y devuelve un mensaje humano genérico en
 * vez de dejar que la excepción cruce sin control.
 */
// El tipo condicional (en vez de `{ ok: true } & T` con un default tipo
// `Record<string, never>`/`{}`) es a propósito: TS rechaza `return { ok: true }`
// contra una intersección con un índice `never` por exceso de propiedades,
// aunque no sobre ninguna clave real. Con `T = undefined` por default, una
// acción sin datos de éxito devuelve `{ ok: true }` sin pelear con eso.
export type ResultadoAccion<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; mensaje: string };

/** Mensaje humano único para toda falla de infraestructura (DB/red) — no
 *  intenta explicar la causa real; esa vive en el log del servidor, nunca
 *  cruza al cliente en producción (ver el comentario de arriba). */
export const MENSAJE_ERROR_GENERICO =
  "No se pudo guardar. Intenta de nuevo; si sigue fallando, avisa a soporte.";

/**
 * Loguea el error real del lado del servidor (con contexto, para poder
 * ubicarlo en los logs) y arma el resultado genérico para el cliente. Usar
 * en cada `if (error) { ... }` de una llamada a Supabase que no tiene un
 * mensaje de negocio propio — nunca envolver `error.message` en un mensaje
 * que el cliente vaya a mostrar.
 */
export function errorInesperado(
  contexto: string,
  error: unknown,
): { ok: false; mensaje: string } {
  console.error(`[${contexto}]`, error);
  return { ok: false, mensaje: MENSAJE_ERROR_GENERICO };
}
