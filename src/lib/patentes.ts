/**
 * Fuente de verdad ÚNICA para normalizar una patente (camión o rampla) —
 * usada por el guardado (`iniciarInspeccion`, `tickets/actions.ts`) y por el
 * buscador de patentes que viene después. No duplicar esta regla en un
 * segundo archivo: dos lugares decidiendo la misma normalización es
 * exactamente el patrón que costó el agujero de autorización del PR #32
 * (dos políticas RLS con la misma decisión, desincronizadas con el tiempo).
 *
 * También hay un CHECK constraint en la base (migración
 * 20260916030000_normaliza_patentes_e_indices.sql) que exige que el valor
 * guardado sea igual a su propia forma normalizada — la regla de ahí tiene
 * que seguir coincidiendo exactamente con esta función. Ver el comentario
 * de esa migración si esta función cambia alguna vez.
 *
 * Reglas: mayúsculas, quita guiones y puntos, y quita TODO espacio (bordes
 * e internos) — no los colapsa a uno solo. Una patente nunca tiene un
 * espacio que distinga dos vehículos distintos; "AB CD 12" y "ABCD12" son
 * la misma patente. Colapsar (en vez de quitar) deja ese falso negativo
 * vivo con otra forma — y es invisible en datos reales que hoy no tienen
 * espacios internos, así que no alcanza con mirar el SELECT de impacto para
 * confirmarlo, hace falta un caso de prueba explícito con espacio en medio
 * (ver patentes.test.ts).
 */
export function normalizarPatente(valor: string): string {
  return valor.toUpperCase().replace(/[-.\s]+/g, "");
}
