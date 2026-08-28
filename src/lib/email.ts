import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

export type ResultadoEnvio = {
  ok: boolean;
  messageId?: string;
};

/**
 * Transporte de correo real — §4.1. Gmail / Google Workspace vía SMTP con una
 * casilla real de la empresa. Autenticación con `SMTP_USER` (la casilla) y
 * `SMTP_PASSWORD` (una "contraseña de aplicación" de Google, no la contraseña
 * normal de la cuenta). Si falta cualquiera de las dos, NO se envía nada y se
 * lanza un error — nunca un falso "enviado con éxito".
 */
function obtenerTransporte() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "El envío de correo no está configurado: faltan SMTP_USER y/o SMTP_PASSWORD en el entorno.",
    );
  }

  return {
    from: process.env.MAIL_FROM || user,
    transporter: nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      // Puerto 465 => conexión TLS directa (secure). Configurable por si se usa
      // otro puerto/servidor.
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : true,
      auth: { user, pass },
    }),
  };
}

export async function enviarInformePorCorreo(opts: {
  destinatarios: string[];
  asunto: string;
  /** Cuerpo en HTML (§4.1) — se envía como `html:`, no como texto plano. */
  cuerpoHtml: string;
  pdf: Buffer;
  nombreArchivo: string;
}): Promise<ResultadoEnvio> {
  const { transporter, from } = obtenerTransporte();

  const mail: Mail.Options = {
    from,
    to: opts.destinatarios,
    subject: opts.asunto,
    html: opts.cuerpoHtml,
    attachments: [
      {
        filename: opts.nombreArchivo,
        content: opts.pdf,
        contentType: "application/pdf",
      },
    ],
  };

  // sendMail lanza si el SMTP rechaza la conexión / autenticación / envío.
  const info = await transporter.sendMail(mail);
  return { ok: true, messageId: info.messageId };
}
