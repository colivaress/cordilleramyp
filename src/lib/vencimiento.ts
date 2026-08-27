import type {
  EstadoVencimiento,
  NivelAlerta,
  TicketEstado,
} from "@/lib/tipos";
import { esEstadoTerminal } from "@/lib/ticket-state-machine";

/**
 * Umbrales de alerta de vencimiento — §3. Parametrizados por env (no hardcodeados
 * dispersos). Valores por defecto: 48h (amarillo) y 24h (naranja).
 */
export const HORAS_AMARILLO = numeroEnv(
  process.env.NEXT_PUBLIC_ALERTA_HORAS_AMARILLO,
  48,
);
export const HORAS_NARANJA = numeroEnv(
  process.env.NEXT_PUBLIC_ALERTA_HORAS_NARANJA,
  24,
);

function numeroEnv(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

const MS_HORA = 3_600_000;

/** Horas hasta el vencimiento (negativo si ya venció). `null` si no hay fecha. */
export function horasRestantes(
  fechaVencimiento: string | Date | null | undefined,
  ahora: Date = new Date(),
): number | null {
  if (!fechaVencimiento) return null;
  const venc = new Date(fechaVencimiento).getTime();
  if (Number.isNaN(venc)) return null;
  return (venc - ahora.getTime()) / MS_HORA;
}

/**
 * Estado derivado de vencimiento del ticket. Recalcular en cada render — no persistir.
 * Un ticket terminal (finalizada sin observaciones) nunca alerta.
 */
export function estadoVencimiento(
  fechaVencimiento: string | Date | null | undefined,
  estadoTicket: TicketEstado,
  ahora: Date = new Date(),
): EstadoVencimiento {
  if (esEstadoTerminal(estadoTicket)) return "vigente";
  const horas = horasRestantes(fechaVencimiento, ahora);
  if (horas === null) return "vigente";
  if (horas < 0) return "vencido";
  if (horas <= HORAS_AMARILLO) return "por_vencer";
  return "vigente";
}

/** Nivel de resaltado visual de la fila / badge. */
export function nivelAlerta(
  fechaVencimiento: string | Date | null | undefined,
  estadoTicket: TicketEstado,
  ahora: Date = new Date(),
): NivelAlerta {
  if (esEstadoTerminal(estadoTicket)) return "ninguno";
  const horas = horasRestantes(fechaVencimiento, ahora);
  if (horas === null) return "ninguno";
  if (horas < 0) return "vencido";
  if (horas <= HORAS_NARANJA) return "naranja";
  if (horas <= HORAS_AMARILLO) return "amarillo";
  return "ninguno";
}

/** ¿Corresponde ofrecer el botón "Notificar Vencimiento por WhatsApp"? — §3 */
export function puedeNotificarVencimiento(
  fechaVencimiento: string | Date | null | undefined,
  estadoTicket: TicketEstado,
  ahora: Date = new Date(),
): boolean {
  const est = estadoVencimiento(fechaVencimiento, estadoTicket, ahora);
  return est === "por_vencer" || est === "vencido";
}

/** Texto legible del tiempo restante para UI y mensajes. */
export function formatearTiempoRestante(
  horas: number | null | undefined,
): string {
  if (horas === null || horas === undefined) return "sin fecha de vencimiento";
  const vencido = horas < 0;
  const abs = Math.abs(horas);
  const dias = Math.floor(abs / 24);
  const h = Math.round(abs % 24);
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
  if (h > 0 || dias === 0) partes.push(`${h} h`);
  const texto = partes.join(" ");
  return vencido ? `vencido hace ${texto}` : `${texto} restantes`;
}

/** Clases Tailwind para el resaltado de fila del dashboard — §3. */
export function clasesFilaAlerta(nivel: NivelAlerta): string {
  switch (nivel) {
    case "vencido":
      return "bg-danger-50 hover:bg-danger-100/70";
    case "naranja":
      return "bg-alert-50 hover:bg-alert-100/70";
    case "amarillo":
      return "bg-warning-50 hover:bg-warning-100/70";
    default:
      return "";
  }
}
