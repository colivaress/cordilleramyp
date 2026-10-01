import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cordillera M&P — Revisión de Equipos y Camiones",
  description:
    "Inspección de flota: tickets, checklist de 18 elementos, firmas digitales y alertas de vencimiento.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Contenedor único con id estable — OverlayBloqueante le alterna
            el atributo `inert` mientras está visible, para que el resto de
            la página (navegación, formulario, toasts) quede realmente
            fuera de alcance del teclado y de los lectores de pantalla, no
            solo tapado visualmente. Mantiene las clases de layout que
            antes tenía `body` directamente, para no alterar nada visual. */}
        <div id="raiz-app" className="flex min-h-full flex-1 flex-col">
          {children}
          <Toaster richColors position="top-right" />
        </div>
      </body>
    </html>
  );
}
