/**
 * Clase base compartida para los `<select>` nativos de la app.
 *
 * No usamos el primitivo `Select`/`SelectTrigger` de shadcn (src/components/ui/select.tsx)
 * en ningún lado — cada `<select>` de la app es nativo, con manejo directo de
 * `onChange`, que es más simple para estos casos. Antes de esta constante cada
 * uno copiaba la misma clase Tailwind a mano (6 copias, dos alturas distintas
 * por el copy-paste: h-9 en cinco, h-8 en una) — la misma "cuarta forma" que
 * ya se evitó para los indicadores de carga en el PR #36. Un solo lugar.
 *
 * 44px (h-11): sirve al uso dominante — un supervisor de pie en el patio, con
 * el teléfono en una mano. Ninguno de los `<select>` de la app tiene el
 * problema de "muchos por fila" que sí justifica una excepción más chica
 * (ver `size="sm"` en button.tsx, reservado para UsuariosTabla) — todos son
 * campos sueltos de formulario o filtro, así que no hace falta una excepción acá.
 */
export const nativeSelectClassName =
  "h-11 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
