import type { Metadata } from "next";

/**
 * `metadata` no se puede exportar desde src/app/login/page.tsx porque es un
 * Client Component ("use client", necesita useState/useEffect para el
 * formulario) — Next.js solo permite `metadata`/`generateMetadata` en Server
 * Components. Este layout, sí Server Component, es el lugar correcto para
 * declarar `robots: noindex` sin tocar la página.
 *
 * robots.txt (src/app/robots.ts) ya pide no rastrear /login, pero eso solo
 * evita que Google la visite — no la saca del índice si ya estaba indexada.
 * Esta etiqueta sí lo hace.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
