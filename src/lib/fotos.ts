/**
 * Qué ofrece el selector de fotos y qué se acepta de verdad al subir (§2.8).
 *
 * Vive en un módulo propio, separado del componente, por dos razones: es
 * lógica pura que se puede testear sin montar React, y porque el valor de
 * `FORMATOS_FOTO` ya rompió la captura de fotos en producción dos veces por
 * motivos distintos. El test de al lado lo fija.
 */

/**
 * Lo que el `<input type="file">` OFRECE en el selector del sistema.
 *
 * 🔴 TIENE QUE SER EL COMODÍN `image/*`. NO volver a poner la lista
 * explícita de MIME ("image/jpeg,image/png,…"): con una lista explícita,
 * Chrome en Android resuelve el intent solo contra el selector de fotos y
 * **la cámara desaparece del menú** — el botón abre Google Fotos directo,
 * sin ofrecer "Tomar foto". Reportado desde producción el 19-10 con video:
 * en el iPhone el mismo código muestra Fototeca / Tomar foto / Seleccionar
 * archivo; en Android, solo la galería.
 *
 * Es la misma clase de trampa que `capture="environment"`, que se sacó en el
 * PR #113 por quitar la galería. Los dos atributos recortan el menú del
 * sistema de formas que no se ven hasta probar en un teléfono de verdad, y
 * cada uno esconde una mitad distinta:
 *
 *   capture="environment"  → solo cámara, sin galería
 *   accept="image/jpeg,…"  → solo galería, sin cámara  (en Android)
 *   accept="image/*"       → las dos                   ✅
 *
 * Esto NO relaja qué archivos se aceptan: `accept` es un filtro del
 * selector, nunca una validación — se salta arrastrando un archivo o
 * eligiendo "todos los archivos" en el propio selector. La restricción de
 * formato vive en `esFotoPermitida`, que es donde sí se puede hacer cumplir.
 */
export const FORMATOS_FOTO = "image/*";

/** §2.8: los formatos fotográficos que el sistema acepta de verdad. */
export const MIME_FOTO = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * ¿Este archivo es una foto que aceptamos? Es la validación real, la que
 * corre antes de subir, y es MÁS estricta que la que había antes de este
 * cambio (`type.startsWith("image/")`, que dejaba pasar un SVG).
 *
 * Un `type` vacío pasa a propósito: algunos selectores de Android entregan
 * el archivo sin MIME, y rechazarlo dejaría al supervisor sin poder subir
 * una foto perfectamente válida con el teléfono en la mano, en el patio.
 * Ese caso lo cubre la compresión, que falla sola si el contenido no es una
 * imagen — es mejor fallar ahí que negarse de entrada a algo que sí servía.
 */
export function esFotoPermitida(tipo: string | undefined | null): boolean {
  if (!tipo) return true;
  return (MIME_FOTO as readonly string[]).includes(tipo.toLowerCase());
}
