import type { RolUsuario } from "@/lib/tipos";

/**
 * Quién entra al módulo RRHH y quién toca montos (spec RRHH §2). Lógica
 * pura: la usan las guardas de servidor (guardas.ts) y la navegación, y
 * es la misma regla que aplica la RLS de las tablas rrhh_*:
 *   - lectura:  private.puede_ver_rrhh()  → administrador, adm. de contrato
 *               (y el propio trabajador sobre sus filas, fuera del módulo);
 *   - montos:   private.es_admin()        → solo administrador.
 * Si cambia una, cambia la otra: la ruta y la RLS tienen que decir lo mismo.
 */
export const ROLES_MODULO_RRHH = [
  "administrador",
  "administrador_contrato",
] as const satisfies readonly RolUsuario[];

/** El administrador de contrato VE montos pero no los edita. */
export const ROLES_EDITAN_MONTOS = [
  "administrador",
] as const satisfies readonly RolUsuario[];

export function puedeEntrarModuloRrhh(rol: RolUsuario): boolean {
  return (ROLES_MODULO_RRHH as readonly RolUsuario[]).includes(rol);
}

export function puedeEditarMontos(rol: RolUsuario): boolean {
  return (ROLES_EDITAN_MONTOS as readonly RolUsuario[]).includes(rol);
}
