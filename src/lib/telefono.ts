/**
 * Teléfonos chilenos — normalización a formato internacional y armado de los
 * enlaces `tel:` y `wa.me` del correo de cotización (§ "Cotización de
 * fletes"), para que Jaime llame o escriba con un toque desde el celular.
 *
 * En Chile el número nacional significativo son 9 dígitos: móviles 9XXXXXXXX,
 * fijos con su código de área (Santiago 2XXXXXXXX, regiones 3X/4X/5X/6X/7X...).
 * El código de país es 56.
 */

/**
 * Deja el teléfono como dígitos en formato internacional (`56` + 9 dígitos),
 * o `null` si no es un teléfono chileno reconocible.
 *
 * Acepta lo que la gente realmente escribe: "+56 9 1234 5678", "56912345678",
 * "9 1234 5678", "912345678", "(2) 2123 4567".
 */
export function normalizarTelefonoCl(valor: string): string | null {
  const digitos = valor.replace(/\D+/g, "");

  // Ya viene con código de país.
  if (digitos.length === 11 && digitos.startsWith("56")) return digitos;

  // Número nacional de 9 dígitos, sin código de país.
  if (digitos.length === 9) return `56${digitos}`;

  // Algunos lo escriben con el 0 de larga distancia adelante: 09 1234 5678.
  if (digitos.length === 10 && digitos.startsWith("0")) {
    return `56${digitos.slice(1)}`;
  }

  return null;
}

/** ¿Es un móvil? Solo a un móvil tiene sentido mandarle un WhatsApp. */
export function esMovilCl(valor: string): boolean {
  const n = normalizarTelefonoCl(valor);
  return n !== null && n.startsWith("569");
}

/** `tel:+56912345678` — o `null` si el número no se pudo normalizar. */
export function enlaceTel(valor: string): string | null {
  const n = normalizarTelefonoCl(valor);
  return n ? `tel:+${n}` : null;
}

/**
 * `https://wa.me/569...?text=...` — o `null` si el número no es un móvil
 * chileno válido. Devolver `null` en vez de un enlace roto es a propósito: el
 * correo omite el botón de WhatsApp en vez de ofrecer uno que no abre nada.
 */
export function enlaceWhatsApp(valor: string, texto?: string): string | null {
  const n = normalizarTelefonoCl(valor);
  if (!n || !n.startsWith("569")) return null;
  const base = `https://wa.me/${n}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/**
 * Formato de presentación: "+56 9 1234 5678" para móviles, "+56 2 2123 4567"
 * para fijos. Si no se puede normalizar, devuelve el valor tal cual.
 */
export function formatearTelefonoCl(valor: string): string {
  const n = normalizarTelefonoCl(valor);
  if (!n) return valor;
  const nacional = n.slice(2); // 9 dígitos
  return `+56 ${nacional[0]} ${nacional.slice(1, 5)} ${nacional.slice(5)}`;
}
