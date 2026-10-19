/**
 * Pesos chilenos e IVA para la cotización de fletes.
 *
 * Todo en enteros: el peso no tiene decimales en una cotización, y trabajar
 * con enteros evita que el total impreso en el PDF no cuadre con la suma de
 * neto + IVA por un redondeo de punto flotante.
 *
 * El IVA y el total NUNCA se guardan en la base: se derivan del neto acá,
 * en un solo lugar. Si la tasa cambiara, cambia esta constante y no hay
 * cotizaciones con un IVA "congelado" distinto conviviendo en la tabla.
 */

/** Tasa de IVA vigente en Chile. */
export const TASA_IVA = 0.19;

export type Totales = {
  neto: number;
  iva: number;
  total: number;
};

/**
 * Descompone un neto en neto / IVA / total, todo en enteros.
 *
 * El total se calcula como `neto + iva` con el IVA ya redondeado. Para un
 * neto entero eso da exactamente lo mismo que `round(neto * 1.19)` —se
 * verificó, no es una suposición: con `neto` entero, `round(neto + x)` es
 * `neto + round(x)`— así que la elección no es por el número, es por la
 * garantía: escrito así, el total impreso en el PDF es la suma de las dos
 * líneas que lo preceden por construcción, y ningún cambio futuro de la
 * tasa puede descuadrarlo.
 */
export function calcularTotales(neto: number): Totales {
  const netoEntero = Math.round(neto);
  const iva = Math.round(netoEntero * TASA_IVA);
  return { neto: netoEntero, iva, total: netoEntero + iva };
}

/** "$1.234.567" — separador de miles con punto, como se escribe en Chile. */
export function formatearCLP(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CL")}`;
}

/**
 * Lee un monto escrito a mano: acepta "1.234.567", "1234567", "$1.234.567"
 * y "1 234 567". Devuelve `null` si no queda un número utilizable.
 *
 * No acepta decimales a propósito: en una cotización en pesos no existen, y
 * un "1.234,56" mal interpretado sería un error de tres órdenes de magnitud.
 */
export function leerMontoCLP(valor: string): number | null {
  const limpio = valor.replace(/[^0-9]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Fecha hasta la que vale la cotización, a partir de su emisión. */
export function fechaValidez(emision: Date, dias: number): Date {
  const d = new Date(emision);
  d.setDate(d.getDate() + dias);
  return d;
}
