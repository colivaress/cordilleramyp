import { formatearTiempoRestante, horasRestantes } from "@/lib/vencimiento";

export type FallaResumen = {
  nombre: string;
  observacion?: string | null;
  fechaVencimientoItem?: string | null;
};

type DatosVencimiento = {
  ticketId: string;
  patenteCamion: string;
  patenteRampla: string;
  transporte?: string | null;
  conductor?: string | null;
  fallas: FallaResumen[];
  fechaVencimiento: string | Date | null;
  supervisorNombre?: string | null;
};

const fmtFecha = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

/**
 * Plantilla de texto automatizada para el deep link de WhatsApp — §3.
 * Detalla ID de ticket, patentes, fallas detectadas y tiempo restante.
 */
export function construirMensajeVencimiento(d: DatosVencimiento): string {
  const horas = horasRestantes(d.fechaVencimiento);
  const listaFallas =
    d.fallas.length > 0
      ? d.fallas
          .map(
            (f, i) =>
              `  ${i + 1}. ${f.nombre}${
                f.observacion ? ` — ${f.observacion}` : ""
              }`,
          )
          .join("\n")
      : "  (sin detalle de fallas)";

  return [
    "*Cordillera M&P — Alerta de vencimiento de corrección*",
    "",
    `Ticket: ${d.ticketId}`,
    d.transporte ? `Transporte: ${d.transporte}` : null,
    `Patente camión: ${d.patenteCamion}`,
    `Patente rampla: ${d.patenteRampla}`,
    d.conductor ? `Conductor: ${d.conductor}` : null,
    "",
    "Fallas pendientes de corrección:",
    listaFallas,
    "",
    `Vence: ${fmtFecha(d.fechaVencimiento)} (${formatearTiempoRestante(horas)})`,
    "",
    "Por favor gestionar la corrección antes de la fecha límite.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Normaliza un teléfono a solo dígitos, formato internacional para wa.me. */
export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D+/g, "");
}

/** Deep link nativo de WhatsApp — §3. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return `https://wa.me/${normalizarTelefono(telefono)}?text=${encodeURIComponent(
    mensaje,
  )}`;
}

type DatosInforme = {
  ticketId: string;
  revision: number;
  patenteCamion: string;
  patenteRampla: string;
  transporte: string;
  conductor: string;
  estado: string;
  urlInforme: string;
};

export function construirAsuntoInforme(d: DatosInforme): string {
  return `Informe de Inspección de Flota — ${d.patenteCamion} / ${d.patenteRampla} (ticket ${d.ticketId})`;
}

export function construirCuerpoInforme(d: DatosInforme): string {
  return [
    "Adjunto el Informe de Inspección de Flota de Cordillera M&P.",
    "",
    `Ticket: ${d.ticketId}`,
    `Revisión: #${d.revision}`,
    `Estado: ${d.estado}`,
    `Transporte: ${d.transporte}`,
    `Conductor: ${d.conductor}`,
    `Patente camión: ${d.patenteCamion}`,
    `Patente rampla: ${d.patenteRampla}`,
    "",
    `Ver informe: ${d.urlInforme}`,
  ].join("\n");
}

/** Enlace mailto con múltiples destinatarios (envío desde el cliente de correo). */
export function enlaceMailto(
  destinatarios: string[],
  asunto: string,
  cuerpo: string,
): string {
  const to = destinatarios.map((e) => e.trim()).filter(Boolean).join(",");
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    asunto,
  )}&body=${encodeURIComponent(cuerpo)}`;
}
