import type { TicketEstado } from "@/lib/tipos";

/**
 * Máquina de estados del ticket — §2.3 del blueprint.
 *
 *   EN_REVISION
 *     ├─ checklist sin fallas ─► FINALIZADA_SIN_OBSERVACIONES (terminal)
 *     └─ checklist con fallas ─► FINALIZADA_CON_OBSERVACIONES
 *                                   └─ supervisor re-inspecciona ─► EN_REVISION (revision_actual += 1)
 *
 * §2.3: se eliminó el paso manual "Iniciar reparación". Desde
 * FINALIZADA_CON_OBSERVACIONES la única acción es reinspeccionar directamente,
 * que lleva el ticket a EN_REVISION. El estado EN_REPARACION_DE_OBSERVACIONES
 * queda como legado: ningún flujo nuevo lo asigna, pero un ticket antiguo que
 * haya quedado ahí se trata igual que FINALIZADA_CON_OBSERVACIONES.
 */

export const TRANSICIONES: Record<TicketEstado, TicketEstado[]> = {
  en_revision: ["finalizada_sin_observaciones", "finalizada_con_observaciones"],
  finalizada_con_observaciones: ["en_revision"],
  en_reparacion_de_observaciones: ["en_revision"], // legado, ver arriba
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

/**
 * §2.3/§2.6: el supervisor puede reinspeccionar mientras el ticket tenga fallas
 * pendientes — estado FINALIZADA_CON_OBSERVACIONES o el legado
 * EN_REPARACION_DE_OBSERVACIONES.
 */
export function puedeReinspeccionar(estado: TicketEstado): boolean {
  return (
    estado === "finalizada_con_observaciones" ||
    estado === "en_reparacion_de_observaciones"
  );
}

export function esEstadoTerminal(estado: TicketEstado): boolean {
  return estado === "finalizada_sin_observaciones";
}
