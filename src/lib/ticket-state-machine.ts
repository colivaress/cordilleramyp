import type { TicketEstado } from "@/lib/tipos";

/**
 * Máquina de estados del ticket — §2.3 del blueprint.
 *
 *   EN_REVISION
 *     ├─ checklist sin fallas ─► FINALIZADA_SIN_OBSERVACIONES (terminal)
 *     └─ checklist con fallas ─► FINALIZADA_CON_OBSERVACIONES
 *                                   └─ taller trabaja ─► EN_REPARACION_DE_OBSERVACIONES
 *                                        └─ supervisor re-inspecciona ─► EN_REVISION (revision_actual += 1)
 */

export const TRANSICIONES: Record<TicketEstado, TicketEstado[]> = {
  en_revision: ["finalizada_sin_observaciones", "finalizada_con_observaciones"],
  finalizada_con_observaciones: ["en_reparacion_de_observaciones"],
  en_reparacion_de_observaciones: ["en_revision"],
  finalizada_sin_observaciones: [],
};

export function puedeTransicionar(
  desde: TicketEstado,
  hacia: TicketEstado,
): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** Estado resultante al cerrar el checklist de una revisión. */
export function estadoTrasChecklist(hayItemsNoConformes: boolean): TicketEstado {
  return hayItemsNoConformes
    ? "finalizada_con_observaciones"
    : "finalizada_sin_observaciones";
}

/** El taller solo puede empezar a reparar desde "finalizada con observaciones". */
export function puedeIniciarReparacion(estado: TicketEstado): boolean {
  return estado === "finalizada_con_observaciones";
}

/** El supervisor solo puede re-inspeccionar mientras hay una reparación en curso. */
export function puedeReinspeccionar(estado: TicketEstado): boolean {
  return estado === "en_reparacion_de_observaciones";
}

export function esEstadoTerminal(estado: TicketEstado): boolean {
  return estado === "finalizada_sin_observaciones";
}
