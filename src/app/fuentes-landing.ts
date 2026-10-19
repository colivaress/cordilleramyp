import { Barlow_Condensed, Inter } from "next/font/google";

/**
 * Tipografía del sitio público (portada y formulario de cotización). Vive en
 * un módulo propio para declararla UNA sola vez: next/font genera el CSS a
 * partir de esta configuración, y tenerla repetida en dos páginas produce dos
 * declaraciones equivalentes que hay que mantener en sincronía a mano.
 *
 * El resto de la app (login, dashboard, tickets) NO usa esto — sigue con
 * font-sans (Geist) del layout raíz, que no se toca.
 */
export const barlowCondensed = Barlow_Condensed({
  variable: "--font-landing-heading",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const inter = Inter({
  variable: "--font-landing-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

/** Clases que abren cualquier pantalla del sitio público. */
export const claseLanding = `${barlowCondensed.variable} ${inter.variable} font-landing-body leading-[1.55] text-landing-charcoal antialiased`;
