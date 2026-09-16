/**
 * Fuente de verdad ÚNICA para normalizar una patente (camión o rampla) —
 * usada por el guardado (`iniciarInspeccion`, `tickets/actions.ts`) y por el
 * buscador de patentes que viene después. No duplicar esta regla en un
 * segundo archivo: dos lugares decidiendo la misma normalización es
 * exactamente el patrón que costó el agujero de autorización del PR #32
 * (dos políticas RLS con la misma decisión, desincronizadas con el tiempo).
 *
 * Reglas: recorta espacios en los bordes, mayúsculas, quita guiones y
 * puntos, colapsa cualquier corrida de espacios internos a uno solo. No
 * quita espacios internos por completo — una patente con espacio en medio
 * (poco común, pero posible en algunos formatos) los conserva, solo deja de
 * tener dobles.
 */
export function normalizarPatente(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[-.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
