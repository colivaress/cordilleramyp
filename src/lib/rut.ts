/**
 * RUT chileno — normalización, validación de dígito verificador y formato.
 *
 * Lo usa el formulario público de cotización de fletes (§ "Cotización de
 * fletes"), que pide RUT del solicitante y, si es empresa, también el RUT de
 * la empresa. La validación corre en los DOS lados: en el cliente para avisar
 * mientras se escribe, y otra vez en la Server Action — nunca solo en el
 * cliente, que es trivial de saltar en un endpoint público.
 */

/**
 * Deja el RUT en su forma canónica: solo dígitos y el dígito verificador, sin
 * puntos, guion ni espacios, con la K en mayúscula. Es la forma en que se
 * guarda en la base, para que "12.345.678-9", "12345678-9" y "123456789" sean
 * el mismo RUT y no tres filas distintas.
 */
export function normalizarRut(valor: string): string {
  return valor.replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * Dígito verificador que le corresponde a un cuerpo de RUT (módulo 11).
 * Recibe solo los dígitos, sin el verificador. Devuelve "0"-"9" o "K".
 */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    // La serie de multiplicadores es 2,3,4,5,6,7 y vuelve a 2 — no sigue a 8.
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * ¿El RUT es válido? Acepta cualquier formato de entrada (con o sin puntos y
 * guion, K en cualquier caja) y exige que el dígito verificador calce.
 *
 * El cuerpo debe tener entre 7 y 8 dígitos: cubre a personas y empresas
 * reales (desde 1.000.000 hasta 99.999.999). Rechazar cuerpos más cortos
 * evita que un "1-9" o un campo a medio escribir pase como válido.
 */
export function rutValido(valor: string): boolean {
  const limpio = normalizarRut(valor);
  if (limpio.length < 8 || limpio.length > 9) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  // El cuerpo tiene que ser todo dígitos: una K solo puede ir al final.
  if (!/^\d+$/.test(cuerpo)) return false;

  return digitoVerificador(cuerpo) === dv;
}

/**
 * Formato de presentación: 12.345.678-9. Si el valor no es un RUT válido lo
 * devuelve tal cual vino — formatear no es validar, y un campo a medio
 * escribir no debe reordenarse solo mientras la persona teclea.
 */
export function formatearRut(valor: string): string {
  const limpio = normalizarRut(valor);
  if (limpio.length < 2) return valor;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return valor;

  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${dv}`;
}
