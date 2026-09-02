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
      ? `<p style="margin: 0 0 8px;">Tras la revisión, se detectó el siguiente hallazgo en las observaciones:</p>
    <ol style="margin: 0 0 20px; padding-left: 20px;">
      ${obs.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ol>`
      : `<p style="margin: 0 0 20px;">Tras la revisión, no se detectaron observaciones. El camión cumple con todas las exigencias del Check List.</p>`;

  return `<div style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
    <p style="margin: 0 0 16px;">Estimados,</p>

    <p style="margin: 0 0 16px;">Junto con saludar, informo que se ha ejecutado la inspección técnica y operativa al camión de transportes cuyos datos se detallan a continuación:</p>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
      ${fila("Empresa", d.transporte)}
      ${fila("Matrícula", d.patenteCamion.toUpperCase())}
      ${fila("Rampla", d.patenteRampla.toUpperCase())}
      ${fila("Conductor", d.conductor)}
    </table>

    ${seccionObservaciones}

    <p style="margin: 0 0 20px;">Para mayor respaldo, se adjunta la lista de chequeo y el registro fotográfico que ilustra la condición actual del vehículo.</p>

    <p style="margin: 0 0 12px;">Atentamente,<br>${esc(d.firmanteNombre)}<br>${CARGO_SUPERVISOR}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:12px 0 0 0;">
      <tr>
        <td align="left" style="text-align:left; padding:0;">
          <img src="cid:logo-cordillera-mp" alt="Cordillera M&amp;P" width="150" style="display:block; margin:0; border:0; outline:none; text-decoration:none; width:150px; max-width:150px; height:auto;" />
        </td>
      </tr>
    </table>
  </div>`;
}

/** §3.2 — momento del ciclo de vencimiento para el aviso a administradores. */
export type MomentoVencimiento = "48h" | "24h" | "vencido";

export type DatosAvisoVencimiento = {
  ticketId: string;
  numeroInspeccion: number;
  transporte: string;
  patenteCamion: string;
  patenteRampla: string;
  supervisorNombre: string;
  /** Fecha/hora de vencimiento de la revisión más reciente. */
  fechaVencimiento: string | Date | null;
  /** URL absoluta a `/tickets/[id]/report` (arma el link del botón). */
  urlInforme: string;
};

/**
 * §3.2 — asunto + cuerpo HTML del aviso automático por correo a los
 * administradores (48h / 24h antes de vencer, o al vencer). Sin PDF adjunto;
 * lleva un botón que abre el informe de esa inspección.
 */
export function construirCorreoVencimientoAdmin(
  momento: MomentoVencimiento,
  d: DatosAvisoVencimiento,
): { asunto: string; html: string } {
  const asunto =
    momento === "vencido"
      ? `La inspección Nro ${d.numeroInspeccion} venció`
      : `La inspección Nro ${d.numeroInspeccion} vencerá en ${
          momento === "48h" ? "48" : "24"
        } horas`;

  const intro =
    momento === "vencido"
      ? "La siguiente inspección venció sin que se resolvieran sus observaciones:"
      : `La siguiente inspección vencerá en ${
          momento === "48h" ? "48" : "24"
        } horas si no se resuelven sus observaciones:`;

  const celdaEtiqueta =
    "background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee; width:170px;";
  const celdaValor = "padding:8px 12px; border:1px solid #dde3ee;";
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="${celdaEtiqueta}">${etiqueta}</td><td style="${celdaValor}">${esc(
      valor,
    )}</td></tr>`;

  const html = `<div style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 16px 0;">
      <tr><td align="left" style="text-align:left; padding:0;">
        <img src="cid:logo-cordillera-mp" alt="Cordillera M&amp;P" width="150" style="display:block; margin:0; border:0; outline:none; text-decoration:none; width:150px; max-width:150px; height:auto;" />
      </td></tr>
    </table>

    <p style="margin: 0 0 8px;">${intro}</p>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
      ${fila("Nro de Inspección", String(d.numeroInspeccion))}
      ${fila("Patente Camión", d.patenteCamion.toUpperCase())}
      ${fila("Patente Rampla", d.patenteRampla.toUpperCase())}
      ${fila("Transporte", d.transporte)}
      ${fila("Supervisor a cargo", d.supervisorNombre)}
      ${fila("Vence", fmtFecha(d.fechaVencimiento))}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 8px 0;">
      <tr><td align="left" bgcolor="#1e40af" style="border-radius:6px;">
        <a href="${d.urlInforme}" style="display:inline-block; padding:10px 18px; font-weight:bold; color:#ffffff; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size:14px;">Ver inspección</a>
      </td></tr>
    </table>

    <p style="margin: 12px 0 0; font-size: 12px; color: #64748b;">Aviso automático de Cordillera M&amp;P — no responder a este correo.</p>
  </div>`;

  return { asunto, html };
}
