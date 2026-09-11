const fmtFecha = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

export type DatosInforme = {
  /** Solo para el asunto del correo; no se repite en el cuerpo (va en el PDF). */
  numeroInspeccion: number;
  numeroRevision: number;
  /** §4: el PDF adjunto trae todo el historial de revisiones, no una sola. */
  todasLasRevisiones?: boolean;
  /**
   * tipos_inspeccion.titulo — fase "tipos de inspección" §1: nunca se
   * compone en código, va tal cual en el asunto del correo.
   */
  tituloInforme: string;
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
  /**
   * ¿El checklist de este tipo es 100% modo 'fotos' (hoy, Exportación
   * Chimolsa)? En ese caso `observaciones` arriba está siempre vacío (esos
   * ítems nunca son no_conforme) y NO significa "sin observaciones" — el
   * cuerpo omite por completo el bloque de hallazgos por ítem, que no aplica.
   */
  esSoloFotos: boolean;
  /**
   * Observación general de la revisión — común a los 4 tipos, distinta de
   * `observaciones` (por ítem). Se muestra bajo su propio encabezado,
   * siempre, en todos los tipos; se omite del todo si viene vacía.
   */
  observacionGeneral: string | null;
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

/**
 * Defensa explícita contra inyección de cabeceras (CRLF) en el asunto del
 * correo: transporte/patentes son texto libre que ingresa un supervisor al
 * crear el ticket, sin validación de formato. No es HTML (asunto ≠ cuerpo),
 * así que no aplica esc() acá — el riesgo es un salto de línea coincidiendo
 * con el formato de cabeceras SMTP, no markup. No depende de que nodemailer
 * lo maneje por su cuenta.
 */
const sinSaltosDeLinea = (v: string) => v.replace(/[\r\n]/g, " ");

export function construirAsuntoInforme(d: DatosInforme): string {
  // Fase "tipos de inspección" §1: el asunto usa tipos_inspeccion.titulo —
  // nunca un texto compuesto en código — seguido del par (N° Inspección,
  // N° Revisión) para diferenciar el correo en la bandeja del destinatario.
  // §4: si el PDF trae todo el historial, se indica.
  const detalle = d.todasLasRevisiones
    ? `N° Inspección ${d.numeroInspeccion} · todas las revisiones`
    : `N° Inspección ${d.numeroInspeccion} · Rev. ${d.numeroRevision}`;
  const titulo = sinSaltosDeLinea(d.tituloInforme);
  const transporte = sinSaltosDeLinea(d.transporte);
  const patenteCamion = sinSaltosDeLinea(d.patenteCamion.toUpperCase());
  const patenteRampla = sinSaltosDeLinea(d.patenteRampla.toUpperCase());
  return `${titulo} — ${transporte} — ${patenteCamion} / ${patenteRampla} (${detalle})`;
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

  // Bloque de hallazgos POR ÍTEM. Un checklist 100% modo 'fotos' (hoy,
  // Exportación Chimolsa) no tiene el concepto de no_conforme — `d.observaciones`
  // siempre viene vacío ahí, y no significa "sin observaciones": el bloque se
  // omite por completo en vez de mostrarlo vacío.
  const seccionHallazgos = d.esSoloFotos
    ? ""
    : obs.length > 0
      ? `<p style="margin: 0 0 8px;">Tras la revisión, se detectó el siguiente hallazgo en las observaciones:</p>
    <ol style="margin: 0 0 20px; padding-left: 20px;">
      ${obs.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ol>`
      : `<p style="margin: 0 0 20px;">Tras la revisión, no se detectaron observaciones. El camión cumple con todas las exigencias del Check List.</p>`;

  // Observación general — nota libre, común a los 4 tipos, aparte de los
  // hallazgos por ítem. Encabezado propio; se omite del todo si está vacía.
  const seccionObservacionGeneral = d.observacionGeneral?.trim()
    ? `<p style="margin: 0 0 4px; font-weight: bold;">Observación general:</p>
    <p style="margin: 0 0 20px;">${esc(d.observacionGeneral.trim())}</p>`
    : "";

  return `<div lang="es" style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
    <p style="margin: 0 0 16px;">Estimados,</p>

    <p style="margin: 0 0 16px;">Junto con saludar, informo que se ha ejecutado la inspección técnica y operativa al camión de transportes cuyos datos se detallan a continuación:</p>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
      ${fila("Empresa", d.transporte)}
      ${fila("Matrícula", d.patenteCamion.toUpperCase())}
      ${fila("Rampla", d.patenteRampla.toUpperCase())}
      ${fila("Conductor", d.conductor)}
    </table>

    ${seccionHallazgos}
    ${seccionObservacionGeneral}

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

export type DatosInformeControlSalida = {
  numeroInspeccion: number;
  /** tickets.fecha — fecha/hora de LA INSPECCIÓN, no del envío del correo ni
   *  del vencimiento. Sin esto el correo no se puede verificar a sí mismo. */
  fechaInspeccion: string | Date | null;
  /** true = finalizada_sin_observaciones; false = con observaciones/en reparación. */
  aprobado: boolean;
  transporte: string;
  patenteCamion: string;
  patenteRampla: string;
  conductor: string;
  firmanteNombre: string;
  observaciones: { observacion: string | null }[];
  /** Observación general de la revisión — ver DatosInforme.observacionGeneral. */
  observacionGeneral: string | null;
};

/**
 * Cuerpo del correo — SOLO Control de Salida (fase "tipos de inspección" §5).
 * Cambio de FORMA, no solo de contenido: lo abre un guardia de portería en el
 * teléfono, con el camión delante, para autorizar o rechazar la salida — tiene
 * que resolverse en 30 segundos. Por eso el veredicto va primero (grande,
 * arriba de todo), seguido de inmediato por N° de Inspección y fecha/hora de
 * la inspección (sin la fecha, un correo de días atrás es indistinguible de
 * uno de hoy — el documento no se puede verificar a sí mismo) y recién
 * después los datos del camión. Sin el saludo "Estimados, junto con
 * saludar..." del cuerpo genérico: acá no hay tiempo para eso.
 */
export function construirCuerpoInformeControlSalida(
  d: DatosInformeControlSalida,
): string {
  const obs = d.observaciones
    .map((o) => (o.observacion ?? "").trim())
    .filter(Boolean);

  const veredicto = d.aprobado
    ? {
        texto: "APROBADO — Traslado autorizado",
        bg: "#ecfdf5",
        fg: "#047857",
        borde: "#a7f3d0",
      }
    : {
        texto: "CON OBSERVACIONES — Revisar antes de autorizar",
        bg: "#fffbeb",
        fg: "#b45309",
        borde: "#fde68a",
      };

  const celdaEtiqueta =
    "background:#eef1f6; font-weight:bold; padding:8px 12px; border:1px solid #dde3ee; width:160px;";
  const celdaValor = "padding:8px 12px; border:1px solid #dde3ee;";
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="${celdaEtiqueta}">${etiqueta}</td><td style="${celdaValor}">${esc(
      valor,
    )}</td></tr>`;

  const seccionObservaciones =
    obs.length > 0
      ? `<p style="margin: 16px 0 8px;">Observaciones:</p>
    <ol style="margin: 0 0 16px; padding-left: 20px;">
      ${obs.map((t) => `<li>${esc(t)}</li>`).join("\n      ")}
    </ol>`
      : "";

  // Observación general — nota libre, aparte de las observaciones por ítem
  // de arriba. Encabezado propio; se omite del todo si está vacía.
  const seccionObservacionGeneral = d.observacionGeneral?.trim()
    ? `<p style="margin: 16px 0 4px; font-weight: bold;">Observación general:</p>
    <p style="margin: 0 0 16px;">${esc(d.observacionGeneral.trim())}</p>`
    : "";

  return `<div lang="es" style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 480px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 16px 0;">
      <tr><td align="center" bgcolor="${veredicto.bg}" style="border:1px solid ${veredicto.borde}; border-radius:6px; padding:14px;">
        <span style="font-size:18px; font-weight:bold; color:${veredicto.fg};">${veredicto.texto}</span>
      </td></tr>
    </table>

    <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
      ${fila("N° de Inspección", String(d.numeroInspeccion))}
      ${fila("Fecha y hora", fmtFecha(d.fechaInspeccion))}
      ${fila("Empresa", d.transporte)}
      ${fila("Matrícula", d.patenteCamion.toUpperCase())}
      ${fila("Rampla", d.patenteRampla.toUpperCase())}
      ${fila("Conductor", d.conductor)}
    </table>

    ${seccionObservaciones}
    ${seccionObservacionGeneral}

    <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">Informe de Inspección Control de Salida — ${esc(d.firmanteNombre)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:12px 0 0 0;">
      <tr>
        <td align="left" style="text-align:left; padding:0;">
          <img src="cid:logo-cordillera-mp" alt="Cordillera M&amp;P" width="120" style="display:block; margin:0; border:0; outline:none; text-decoration:none; width:120px; max-width:120px; height:auto;" />
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

  const html = `<div lang="es" style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
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
        <a href="${esc(d.urlInforme)}" style="display:inline-block; padding:10px 18px; font-weight:bold; color:#ffffff; text-decoration:none; font-family: Arial, Helvetica, sans-serif; font-size:14px;">Ver inspección</a>
      </td></tr>
    </table>

    <p style="margin: 12px 0 0; font-size: 12px; color: #64748b;">Aviso automático de Cordillera M&amp;P — no responder a este correo.</p>
  </div>`;

  return { asunto, html };
}

/** §3.2 (destinatarios externos) — sin ticketId/supervisorNombre/urlInforme: nadie fuera de Cordillera tiene cuenta en el sistema, así que no hay nada ahí que mostrarles. */
export type DatosAvisoVencimientoExterno = {
  numeroInspeccion: number;
  transporte: string;
  patenteCamion: string;
  patenteRampla: string;
  /** Fecha/hora de vencimiento de la revisión más reciente. */
  fechaVencimiento: string | Date | null;
};

/**
 * §3.2 — versión del aviso automático de vencimiento para destinatarios
 * externos a Cordillera M&P (destinatarios_correo con recibe_vencimientos,
 * no personal.rol = administrador). A diferencia de
 * construirCorreoVencimientoAdmin, esta versión NO incluye el enlace al
 * informe (`/tickets/[id]/report` requiere sesión en el sistema, que estos
 * destinatarios no tienen) ni el nombre del supervisor a cargo (información
 * interna, no le corresponde a un tercero). Mismo esc() en todos los campos
 * de origen humano que la versión interna.
 */
export function construirCorreoVencimientoExterno(
  momento: MomentoVencimiento,
  d: DatosAvisoVencimientoExterno,
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

  const html = `<div lang="es" style="font-family: Arial, Helvetica, sans-serif; color: #1a2233; font-size: 14px; line-height: 1.6; max-width: 600px;">
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
      ${fila("Vence", fmtFecha(d.fechaVencimiento))}
    </table>

    <p style="margin: 12px 0 0; font-size: 12px; color: #64748b;">Aviso automático de Cordillera M&amp;P — no responder a este correo.</p>
  </div>`;

  return { asunto, html };
}
