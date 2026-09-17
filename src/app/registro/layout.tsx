import type { Metadata } from "next";

/**
 * Mismo motivo que src/app/login/layout.tsx: /registro/page.tsx es un
 * Client Component, así que `metadata` (incluido `robots: noindex`) tiene
 * que declararse en un layout Server Component hermano, no en la página.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
