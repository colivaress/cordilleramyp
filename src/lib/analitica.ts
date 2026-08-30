import type { TicketEstado } from "@/lib/tipos";
import { MESES_ES, mesEtiqueta, mesKey } from "@/lib/dashboard";
import { nombreCompleto } from "@/lib/mensajes";

/** "Ago 26" — etiqueta compacta para los ejes de los gráficos. */
export function mesEtiquetaCorta(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MESES_ES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

type TicketAnalitica = {
  id: string;
  created_at: string;
  estado: TicketEstado;
  supervisor_id: string | null;
  supervisor: { id: string; nombre: string; apellido: string | null } | null;
};

type RevisionAnalitica = {
  ticket_id: string;
  created_at: string;
  estado_resultante: TicketEstado;
};

const TODOS_ESTADOS: TicketEstado[] = [
  "en_revision",
  "finalizada_con_observaciones",
  "finalizada_sin_observaciones",
  "en_reparacion_de_observaciones",
];

/**
 * Todos los datasets de la página de analítica (§2.11). Cálculo puro sobre los
 * tickets y sus revisiones — sin tocar la base de datos.
 */
export function construirAnalitica(
  tickets: TicketAnalitica[],
  revisiones: RevisionAnalitica[],
) {
  // --- Desglose por estado (todos los valores; el legado solo si tiene datos) ---
  const porEstado = TODOS_ESTADOS.map((estado) => ({
    estado,
    total: tickets.filter((t) => t.estado === estado).length,
  })).filter(
    (x) => x.estado !== "en_reparacion_de_observaciones" || x.total > 0,
  );

  // --- Eje de meses: los meses con datos, tope 12 (los más recientes) ---
  const mesesConDatos = [...new Set(tickets.map((t) => mesKey(t.created_at)))].sort();
  const mesesEje = mesesConDatos.slice(-12);

  // --- Barras: inspecciones creadas por mes ---
  const creadasPorMes = new Map<string, number>();
  for (const t of tickets) {
    const k = mesKey(t.created_at);
    creadasPorMes.set(k, (creadasPorMes.get(k) ?? 0) + 1);
  }
  const inspeccionesPorMes = mesesEje.map((k) => ({
    mes: mesEtiquetaCorta(k),
    total: creadasPorMes.get(k) ?? 0,
  }));

  // --- Inspecciones con observaciones por mes: tickets con una revisión de
  //     resultado `finalizada_con_observaciones`, contados una vez por el mes
  //     en que ocurrió esa revisión (§2.11). ---
  const conObsPorMes = new Map<string, Set<string>>();
  for (const r of revisiones) {
    if (r.estado_resultante !== "finalizada_con_observaciones") continue;
    const k = mesKey(r.created_at);
    if (!conObsPorMes.has(k)) conObsPorMes.set(k, new Set());
    conObsPorMes.get(k)!.add(r.ticket_id);
  }
  const conObservacionesPorMes = mesesEje.map((k) => ({
    mes: mesEtiquetaCorta(k),
    total: conObsPorMes.get(k)?.size ?? 0,
  }));

  // --- Dona: un registro por ticket con su supervisor y su mes de creación
  //     (el <select> del gráfico filtra por mes en el cliente). ---
  const nombrePorSupervisor = new Map<string, string>();
  for (const t of tickets) {
    if (t.supervisor)
      nombrePorSupervisor.set(
        t.supervisor.id,
        nombreCompleto(t.supervisor.nombre, t.supervisor.apellido),
      );
  }
  const ticketsDona = tickets.map((t) => ({
    supervisor: t.supervisor_id
      ? (nombrePorSupervisor.get(t.supervisor_id) ?? "—")
      : "—",
    mes: mesKey(t.created_at),
  }));
  const mesesOpciones = [...mesesConDatos]
    .reverse()
    .map((k) => ({ valor: k, etiqueta: mesEtiqueta(k) }));

  // --- Tabla de estadísticas por supervisor ---
  const ticketsConObs = new Set(
    revisiones
      .filter((r) => r.estado_resultante === "finalizada_con_observaciones")
      .map((r) => r.ticket_id),
  );
  const statsMap = new Map<
    string,
    { nombre: string; total: number; conObs: number }
  >();
  for (const t of tickets) {
    const id = t.supervisor_id ?? "—";
    const nombre = t.supervisor_id
      ? (nombrePorSupervisor.get(t.supervisor_id) ?? "—")
      : "Sin supervisor";
    const fila = statsMap.get(id) ?? { nombre, total: 0, conObs: 0 };
    fila.total += 1;
    if (ticketsConObs.has(t.id)) fila.conObs += 1;
    statsMap.set(id, fila);
  }
  const statsSupervisor = [...statsMap.values()].sort(
    (a, b) => b.total - a.total,
  );

  return {
    porEstado,
    inspeccionesPorMes,
    conObservacionesPorMes,
    ticketsDona,
    mesesOpciones,
    statsSupervisor,
  };
}
