/**
 * Qué ofrece el selector de fotos y qué se acepta de verdad al subir (§2.8).
 *
 * Vive en un módulo propio, separado del componente, por dos razones: es
 * lógica pura que se puede testear sin montar React, y porque el valor de
 * `FORMATOS_FOTO` ya rompió la captura de fotos en producción dos veces por
 * motivos distintos. El test de al lado lo fija.
 */

/**
 * El `accept` de los inputs de foto.
 *
 * ⚠️ OJO CON LA HISTORIA DE ESTE VALOR, porque ya costó dos despliegues.
 *
 * El 19-10 se cambió de la lista explícita de MIME a este comodín creyendo
 * que eso devolvía la cámara en Android. **No la devolvió**: se probó en
 * producción, con video, y el comportamiento fue idéntico. El `accept` NO
 * es la palanca de ese problema — otros proyectos hicieron el mismo cambio
 * y también lo revirtieron por no tener efecto.
 *
 * La causa real es que en Android moderno un solo <input> no puede ofrecer
 * cámara y galería a la vez: con `capture` abre la cámara, y sin `capture`
 * Chrome entrega el selector de fotos del sistema, que no tiene cámara. Eso
 * se resolvió con DOS inputs y dos botones (ver `BotonesFoto` en
 * ChecklistItemRow.tsx), no tocando este valor.
 *
 * Entonces, ¿por qué queda el comodín? Porque es lo correcto por otra razón,
 * más chica: la lista explícita no aportaba seguridad —`accept` es un filtro
 * del selector, nunca una validación: se salta arrastrando un archivo o
 * eligiendo "todos los archivos"— y en cambio sí escondía archivos HEIC
 * legítimos en algunos selectores de escritorio. La restricción de formato
 * de verdad vive en `esFotoPermitida`, abajo.
 *
 * Si alguien vuelve a tocar esto buscando arreglar la cámara: el problema no
 * está acá.
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
