import type { MetadataRoute } from "next";

/**
 * robots.txt SOLO pide a los rastreadores que no visiten estas rutas — no
 * las saca del índice si ya estaban indexadas (para eso, `robots:
 * { index: false, follow: false }` en la metadata de cada página, ver
 * src/app/login/layout.tsx y src/app/registro/layout.tsx). Las dos
 * protecciones son complementarias, no una sustituye a la otra.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/registro", "/dashboard", "/tickets", "/api"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
