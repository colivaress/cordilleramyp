import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { claseLanding } from "../fuentes-landing";
import { CotizacionForm } from "./CotizacionForm";

export const metadata: Metadata = {
  title: "Cotizar un flete – Cordillera M&P",
  description:
    "Solicite una cotización de flete en la Región Metropolitana: encarpe, amarre técnico y transporte terrestre de carga. Le respondemos con una propuesta a su medida.",
};

export default function CotizacionPage() {
  return (
    <div className={claseLanding}>
      <Header />

      <main className="bg-landing-cream py-12 min-[880px]:py-16">
        <div className="mx-auto max-w-[860px] px-5 min-[880px]:px-7">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-landing-steel transition-colors duration-150 hover:text-landing-charcoal"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Volver al inicio
          </Link>

          <div className="mb-2.5 font-landing-body text-[14.5px] font-semibold text-landing-orange">
            Cotización de fletes
          </div>
          <h1 className="mb-4 font-landing-heading text-[clamp(32px,5vw,48px)] font-bold leading-[1.02] tracking-[0.01em] text-landing-charcoal">
            Cuéntenos qué necesita mover.
          </h1>
          <p className="mb-9 max-w-[560px] text-[16px] text-landing-steel">
            Complete el formulario y un ejecutivo se pondrá en contacto con
            usted para entregarle la cotización. Toma un par de minutos.
          </p>

          <CotizacionForm />
        </div>
      </main>

      <footer className="bg-landing-charcoal px-0 py-7 text-[12.5px] text-[#6E767E]">
        <div className="mx-auto flex max-w-[860px] flex-wrap justify-between gap-2.5 px-5 min-[880px]:px-7">
          <div>© 2026 Sociedad Cordillera M&amp;P SPA.</div>
          <div>Puente Alto, Región Metropolitana, Chile</div>
        </div>
      </footer>
    </div>
  );
}
