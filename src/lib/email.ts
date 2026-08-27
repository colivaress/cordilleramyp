import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

export type ResultadoEnvio = {
  ok: boolean;
  modo: "smtp" | "ethereal";
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
};

type TransporteInfo = {
  transporter: nodemailer.Transporter;
  modo: "smtp" | "ethereal";
  from: string;
};

/**
 * Devuelve un transporte de correo:
 * - Si hay SMTP_* en el entorno, usa ese servidor (producción).
 * - Si no, crea una cuenta de prueba Ethereal (no entrega de verdad, pero deja
 *   ver el correo y su adjunto en una URL). Suficiente para verificar que el PDF
 *   se adjunta bien; para producción configurar SMTP_*.
 */
async function obtenerTransporte(): Promise<TransporteInfo> {
  const host = process.env.SMTP_HOST;
  if (host) {
    return {
      transporter: nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              }
            : undefined,
      }),
      modo: "smtp",
      from:
        process.env.MAIL_FROM ??
        `Cordillera M&P <${process.env.SMTP_USER ?? "no-reply@cordilleramyp.cl"}>`,
    };
  }

  const cuenta = await nodemailer.createTestAccount();
  return {
    transporter: nodemailer.createTransport({
      host: cuenta.smtp.host,
      port: cuenta.smtp.port,
      secure: cuenta.smtp.secure,
      auth: { user: cuenta.user, pass: cuenta.pass },
    }),
    modo: "ethereal",
    from: process.env.MAIL_FROM ?? "Cordillera M&P <no-reply@cordilleramyp.cl>",
  };
}

export async function enviarInformePorCorreo(opts: {
  destinatarios: string[];
  asunto: string;
  cuerpo: string;
  pdf: Buffer;
  nombreArchivo: string;
}): Promise<ResultadoEnvio> {
  const { transporter, modo, from } = await obtenerTransporte();

  const mail: Mail.Options = {
    from,
    to: opts.destinatarios,
    subject: opts.asunto,
    text: opts.cuerpo,
    attachments: [
      {
        filename: opts.nombreArchivo,
        content: opts.pdf,
        contentType: "application/pdf",
      },
    ],
  };

  const info = await transporter.sendMail(mail);
  return {
    ok: true,
    modo,
    messageId: info.messageId,
    previewUrl:
      modo === "ethereal" ? nodemailer.getTestMessageUrl(info) || null : null,
  };
}
