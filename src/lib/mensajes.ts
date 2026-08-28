import { formatearTiempoRestante, horasRestantes } from "@/lib/vencimiento";

export type FallaResumen = {
  nombre: string;
  observacion?: string | null;
};

type DatosVencimiento = {
  nroRevisionGlobal: number | null;
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
 * Plantilla de texto automatizada para el deep link de WhatsApp — §3 / §4.
 * Identifica la revisión por el correlativo `nro_revision_global` (legible para
 * una persona), nunca por el UUID interno del ticket.
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
    `N° de Revisión: ${d.nroRevisionGlobal ?? "—"}`,
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

export type DatosInforme = {
  nroRevisionGlobal: number | null;
  revision: number;
  patenteCamion: string;
  patenteRampla: string;
  transporte: string;
  conductor: string;
  estado: string;
  observaciones: { nombre: string; observacion: string | null }[];
  /** Link real al informe online; se omite del cuerpo si no se pasa. */
  urlInforme?: string | null;
};

export function construirAsuntoInforme(d: DatosInforme): string {
  return `Informe de Inspección de Flota — ${d.patenteCamion} / ${d.patenteRampla} (N° Revisión ${
    d.nroRevisionGlobal ?? "s/n"
  })`;
}

/**
 * Cuerpo del correo (§4.1): datos de cabecera + resumen de observaciones EN TEXTO.
 * Sin fotos (van solo en el PDF adjunto). Sin líneas de link vacías.
 */
export function construirCuerpoInforme(d: DatosInforme): string {
  const resumenObs =
    d.observaciones.length > 0
      ? [
          "",
          "Observaciones:",
          ...d.observaciones.map(
            (o) =>
              `  - ${o.nombre}${o.observacion ? `: ${o.observacion}` : ""}`,
          ),
        ]
      : ["", "Sin observaciones: todos los elementos conformes."];

  const linkLinea =
    d.urlInforme && /^https?:\/\//.test(d.urlInforme)
      ? ["", `Informe online: ${d.urlInforme}`]
      : [];

  return [
    "Adjunto (PDF) el Informe de Inspección de Flota de Cordillera M&P.",
    "",
    `N° de Revisión: ${d.nroRevisionGlobal ?? "—"}`,
    `Estado: ${d.estado}`,
    `Transporte: ${d.transporte}`,
    `Conductor: ${d.conductor}`,
    `Patente camión: ${d.patenteCamion}`,
    `Patente rampla: ${d.patenteRampla}`,
    ...resumenObs,
    ...linkLinea,
  ].join("\n");
}
