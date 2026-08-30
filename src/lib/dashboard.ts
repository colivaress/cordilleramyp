import { ETIQUETA_ESTADO, type TicketEstado } from "@/lib/tipos";
import { estadoVencimiento } from "@/lib/vencimiento";

export const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** "YYYY-MM" de una fecha ISO en horario de Chile — §2.6 / §2.11 filtro por mes. */
export function mesKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "Agosto 2026" a partir de "2026-08". */
export function mesEtiqueta(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** Opciones del filtro por estado — §2.6 (los mismos textos que los badges). */
export const ESTADOS_FILTRO: { valor: TicketEstado; etiqueta: string }[] = [
  { valor: "en_revision", etiqueta: ETIQUETA_ESTADO.en_revision },
  {
    valor: "finalizada_con_observaciones",
    etiqueta: ETIQUETA_ESTADO.finalizada_con_observaciones,
  },
  {
    valor: "finalizada_sin_observaciones",
    etiqueta: ETIQUETA_ESTADO.finalizada_sin_observaciones,
  },
];

type TicketResumen = {
  estado: TicketEstado;
  fecha_vencimiento: string | null;
};

/**
 * Tarjetas de resumen del dashboard / analítica (§2.6, §2.11). "En reparación" =
 * con fallas pendientes (`finalizada_con_observaciones` + legado). "Finalizadas"
 * = `finalizada_sin_observaciones`.
 */
export function calcularResumen(lista: TicketResumen[]) {
  return {
    total: lista.length,
    porVencer: lista.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "por_vencer",
    ).length,
    vencidos: lista.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "vencido",
    ).length,
    enReparacion: lista.filter(
      (t) =>
        t.estado === "finalizada_con_observaciones" ||
        t.estado === "en_reparacion_de_observaciones",
    ).length,
    finalizadas: lista.filter(
      (t) => t.estado === "finalizada_sin_observaciones",
    ).length,
  };
}
