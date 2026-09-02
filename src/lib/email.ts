import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type { Transporter } from "nodemailer";

// §8: logo real de la empresa embebido en el correo por `cid` (no por URL
// pública — la app puede no estar desplegada). El HTML del cuerpo lo referencia
// como <img src="cid:logo-cordillera-mp">.
const LOGO_CID = "logo-cordillera-mp";
const LOGO_PATH = path.join(process.cwd(), "public", "logo-cordillera-mp.png");

// §4.1: el logo se redimensiona a ~400px UNA vez por proceso. Sin esto, el PNG
// original de 2.4 MB va adjunto en cada correo y el envío SMTP tarda ~20s (subir
// varios MB a Gmail); con el resize baja a unos KB.
let logoBufCache: Promise<Buffer> | null = null;
function logoAdjunto(): Promise<Buffer> {
  if (!logoBufCache) {
    logoBufCache = fs.promises
      .readFile(LOGO_PATH)
      .then((buf) =>
        sharp(buf)
          .resize({ width: 400, withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toBuffer(),
      );
  }
  return logoBufCache;
}

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
// §4.1: el transporter se crea UNA sola vez por proceso (no en cada request) y
// usa pool para reutilizar la conexión SMTP entre envíos.
let cache: { transporter: Transporter; from: string } | null = null;
function obtenerTransporte() {
  if (cache) return cache;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "El envío de correo no está configurado: faltan SMTP_USER y/o SMTP_PASSWORD en el entorno.",
    );
  }

  cache = {
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
      pool: true,
      maxConnections: 3,
    }),
  };
  return cache;
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
      {
        filename: "logo-cordillera-mp.png",
        content: await logoAdjunto(),
        contentType: "image/png",
        cid: LOGO_CID,
      },
    ],
  };

  // sendMail lanza si el SMTP rechaza la conexión / autenticación / envío.
  const t0 = performance.now();
  const info = await transporter.sendMail(mail);
  console.log(
    `[informe] SMTP sendMail: ${Math.round(performance.now() - t0)}ms -> ${info.messageId}`,
  );
  return { ok: true, messageId: info.messageId };
}
