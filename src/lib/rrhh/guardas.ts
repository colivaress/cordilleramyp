import { requireRol } from "@/lib/auth";
import { ROLES_EDITAN_MONTOS, ROLES_MODULO_RRHH } from "@/lib/rrhh/acceso";

/**
 * Guardas de servidor del módulo RRHH. Llamar en CADA page.tsx de /rrhh, no
 * en un layout: los layouts no se vuelven a renderizar al navegar entre
 * páginas hermanas (partial rendering), así que una guarda ahí no se
 * re-evalúa en cada cambio de ruta — ver la guía de autenticación de
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md.
 */
export function requireModuloRrhh() {
  return requireRol(...ROLES_MODULO_RRHH);
}

/**
 * Para las Server Actions que escriben montos de remuneración. El
 * administrador de contrato queda fuera aunque la RLS ya lo rechace
 * (`private.es_admin()` en las políticas de escritura): ruta + RLS.
 */
export function requireEditarMontos() {
  return requireRol(...ROLES_EDITAN_MONTOS);
}
