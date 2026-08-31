import { formatearTiempoRestante, horasRestantes } from "@/lib/vencimiento";

export type FallaResumen = {
  nombre: string;
  observacion?: string | null;
};

type DatosVencimiento = {
  // §2.6: identificación legible = par (Nro de Inspección, Nro de Revisión).
  numeroInspeccion: number;
  numeroRevision: number;
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
 * Identifica al ticket por el par (Nro de Inspección, Nro de Revisión), nunca por
 * el UUID interno.
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
    `N° de Inspección: ${d.numeroInspeccion}`,
    `N° de Revisión: ${d.numeroRevision}`,
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
  numeroInspeccion: number;
  numeroRevision: number;
  /** §4: el PDF adjunto trae todo el historial de revisiones, no una sola. */
  todasLasRevisiones?: boolean;
  transporte: string;
  patenteCamion: string;
  patenteRampla: string;
  /** Conductor de la revisión informada (§2.6). */
  conductor: string;
  /**
   * Nombre + apellido del supervisor que ENVÍA el correo en este momento (el
   * usuario autenticado), no necesariamente el dueño original del ticket — §4.1.
   * Si el usuario legado no tiene apellido cargado, es solo el nombre.
   */
  firmanteNombre: string;
  /** Ítems no_conforme de la revisión, en orden de checklist. */
  observaciones: { observacion: string | null }[];
};

/** Cargo fijo para todos los supervisores (§4.1), no se guarda en BD. */
const CARGO_SUPERVISOR = "Supervisor de Encarpe";

/**
 * "Nombre Apellido" — y solo "Nombre" si el apellido no está cargado (usuario
 * legado), nunca un "undefined" ni un espacio colgando (§4.1 / §2.10).
 */
export function nombreCompleto(
  nombre: string | null | undefined,
  apellido: string | null | undefined,
): string {
  const n = (nombre ?? "").trim();
  const a = (apellido ?? "").trim();
  return a ? `${n} ${a}`.trim() : n;
}

/** Escapa texto para interpolarlo con seguridad dentro del HTML del correo. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function construirAsuntoInforme(d: DatosInforme): string {
  // §4.1: misma redacción que el cuerpo ("Check List camión de transportes …"),
  // con el par (N° Inspección, N° Revisión) para diferenciar el correo en la
  // bandeja del destinatario. §4: si el PDF trae todo el historial, se indica.
  const detalle = d.todasLasRevisiones
    ? `N° Inspección ${d.numeroInspeccion} · todas las revisiones`
    : `N° Inspección ${d.numeroInspeccion} · Rev. ${d.numeroRevision}`;
  return `Check List camión de transportes ${d.transporte} — ${d.patenteCamion.toUpperCase()} / ${d.patenteRampla.toUpperCase()} (${detalle})`;
}

/**
 * Cuerpo del correo en HTML (formato formal, con tabla) — plantilla de §4.1.
 * No repite datos que ya van en el PDF adjunto (N° de Inspección/Revisión,
 * estado, etc.). Sin fotos (van solo en el PDF). Las patentes se muestran en
 * MAYÚSCULA (no cambia cómo se guardan en la base).
 */
export function construirCuerpoInforme(d: DatosInforme): string {
  const obs = d.observaciones
    .map((o) => (o.observacion ?? "").trim())
    .filter(Boolean);

  const celdaEtiqueta =
    "background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee; width:140px;";
  const celdaValor = "padding:8px 12px; border:1px solid #dde3ee;";
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="${celdaEtiqueta}">${etiqueta}</td><td style="${celdaValor}">${esc(
      valor,
    )}</td></tr>`;

  const seccionObservaciones =
    obs.length > 0
      ? `<p style="margin: 0 0 8px;">Dentro de las observaciones se detecta lo siguiente:</p>
    <ol style="margin: 0 0 20px; padding-left: 20px;">
      ${obs.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ol>`
      : `<p style="margin: 0 0 20px;">No se detectan observaciones. El camión cumple con todas las exigencias del Check List.</p>`;

  return `<div style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
    <p style="margin: 0 0 16px;">Estimados,</p>

    <p style="margin: 0 0 16px;">Se realiza Check List a camión de transportes <strong>${esc(
      d.transporte,
    )}</strong>.</p>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
      ${fila("Empresa", d.transporte)}
      ${fila("Matrícula", d.patenteCamion.toUpperCase())}
      ${fila("Rampla", d.patenteRampla.toUpperCase())}
      ${fila("Conductor", d.conductor)}
    </table>

    ${seccionObservaciones}

    <p style="margin: 0 0 20px;">Se adjunta Check List y fotografías para ilustrar la condición.</p>

    <p style="margin: 0;">${esc(d.firmanteNombre)}<br>${CARGO_SUPERVISOR}</p>
  </div>`;
}
