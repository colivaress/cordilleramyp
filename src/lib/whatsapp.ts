/**
 * WhatsApp Business Cloud API de Meta — §3.1. Envío server-only (el cron).
 *
 * Un mensaje que la empresa inicia (el destinatario no escribió antes a este
 * número) DEBE usar una plantilla pre-aprobada por Meta — `type: "text"` es
 * rechazado. Por eso este helper solo manda `type: "template"`.
 */

const GRAPH_VERSION = "v20.0";

export type ResultadoWhatsApp = { id?: string };

/**
 * Envía la plantilla `plantilla` (por defecto `WHATSAPP_TEMPLATE` o
 * `"alerta_vencimiento"`) al `telefono` (formato internacional, solo dígitos),
 * rellenando los parámetros del cuerpo en orden. Lanza si la API responde error.
 */
export async function enviarWhatsAppPlantilla(opts: {
  telefono: string;
  /** Parámetros del componente `body`, en el orden de la plantilla. */
  parametros: string[];
  plantilla?: string;
  idioma?: string;
}): Promise<ResultadoWhatsApp> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp no configurado: faltan WHATSAPP_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID.",
    );
  }
  const telefono = opts.telefono.replace(/\D+/g, "");
  if (!telefono) throw new Error("Teléfono de destino vacío o inválido.");

  const name =
    opts.plantilla || process.env.WHATSAPP_TEMPLATE || "alerta_vencimiento";
  const code = opts.idioma || process.env.WHATSAPP_LANG || "es";

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name,
          language: { code },
          components: [
            {
              type: "body",
              parameters: opts.parametros.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
    },
  );

  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(`Meta Cloud API: ${err?.message ?? `HTTP ${res.status}`}`);
  }
  const messages = (data as { messages?: { id?: string }[] }).messages;
  return { id: messages?.[0]?.id };
}
