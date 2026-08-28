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
  /** Solo para el asunto del correo; no se repite en el cuerpo (va en el PDF). */
  nroRevisionGlobal: number | null;
  transporte: string;
  patenteCamion: string;
  patenteRampla: string;
  /** Conductor de la revisión informada (§2.6). */
  conductor: string;
  /** Nombre del supervisor que envía (personal.nombre). */
  supervisorNombre: string;
  /** Ítems no_conforme de la revisión, en orden de checklist. */
  observaciones: { observacion: string | null }[];
};

/** Cargo fijo para todos los supervisores (§4.1), no se guarda en BD. */
const CARGO_SUPERVISOR = "Supervisor de Encarpe";

export function construirAsuntoInforme(d: DatosInforme): string {
  return `Informe de Inspección de Flota — ${d.patenteCamion} / ${d.patenteRampla} (N° Revisión ${
    d.nroRevisionGlobal ?? "s/n"
  })`;
}

/**
 * Cuerpo del correo — plantilla exacta de §4.1. No repite datos que ya van en el
 * PDF adjunto (N° de Revisión, estado, etc.). Sin fotos (van solo en el PDF).
 */
export function construirCuerpoInforme(d: DatosInforme): string {
  const obs = d.observaciones
    .map((o) => (o.observacion ?? "").trim())
    .filter(Boolean);

  const seccionObservaciones =
    obs.length > 0
      ? [
          "Dentro de las observaciones se detecta lo siguiente",
          "",
          ...obs.map((texto, i) => `${i + 1}. ${texto}`),
        ]
      : [
          "No se detectan observaciones. El camión cumple con todas las exigencias del Check List.",
        ];

  return [
    "Estimados,",
    "",
    `Se realiza Check List a camión de transportes ${d.transporte}.`,
    `Matrícula ${d.patenteCamion}`,
    `Rampla ${d.patenteRampla}`,
    `Conductor ${d.conductor}.`,
    "",
    ...seccionObservaciones,
    "",
    "Se adjunta Check List y fotografías para ilustrar la condición",
    "",
    `${d.supervisorNombre} ( ${CARGO_SUPERVISOR} )`,
  ].join("\n");
}
