import type { MetadataRoute } from "next";

/**
 * SOLO la portada — es la única página comercial pública del sitio (§ portada
 * pública). El resto de la app (login, registro, dashboard, tickets, API)
 * nunca va acá; se bloquea explícitamente en robots.ts, no se enumera aquí.
 *
 * NEXT_PUBLIC_APP_URL: mismo patrón que ya usa el cron de alertas de
 * vencimiento (src/app/api/cron/alertas-whatsapp/route.ts) para armar URLs
 * absolutas — Preview apunta al alias de staging, Production al dominio real.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
