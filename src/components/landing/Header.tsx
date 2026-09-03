"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { id: "nosotros", label: "Nosotros" },
  { id: "servicios", label: "Servicios" },
  { id: "compromiso", label: "Seguridad" },
  { id: "clientes", label: "Clientes" },
] as const;

/**
 * Header de la portada pública. Client Component porque necesita estado
 * (menú móvil) y listeners de DOM (resize, scroll-to-section) que no
 * existen en Server Components.
 */
export function Header() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function alRedimensionar() {
      if (window.innerWidth > 880) setMenuAbierto(false);
    }
    window.addEventListener("resize", alRedimensionar);
    return () => window.removeEventListener("resize", alRedimensionar);
  }, []);

  function irASeccion(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuAbierto(false);
  }

  function alHacerClicEnLogo(e: React.MouseEvent) {
    if (pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setMenuAbierto(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-landing-line bg-white shadow-[0_1px_0_rgba(0,0,0,.02)]">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-2 min-[880px]:px-7 min-[880px]:py-2.5">
        <Link
          href="/"
          onClick={alHacerClicEnLogo}
          aria-label="Ir al inicio"
          className="flex items-center"
        >
          <Image
            src="/images/logo-cordillera.png"
            alt="Cordillera M&P"
            width={104}
            height={104}
            priority
            className="block h-16 w-16 shrink-0 bg-white object-contain p-1 min-[400px]:h-[76px] min-[400px]:w-[76px] min-[880px]:h-[104px] min-[880px]:w-[104px]"
          />
        </Link>

        <nav
          id="nav-links"
          className={`${
            menuAbierto ? "flex" : "hidden"
          } max-[879px]:absolute max-[879px]:inset-x-0 max-[879px]:top-full max-[879px]:flex-col max-[879px]:items-stretch max-[879px]:gap-0 max-[879px]:border-t max-[879px]:border-landing-line max-[879px]:bg-white max-[879px]:px-5 max-[879px]:pb-3.5 max-[879px]:pt-1 max-[879px]:shadow-[0_10px_18px_rgba(0,0,0,.08)] min-[880px]:flex min-[880px]:gap-[30px]`}
        >
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => irASeccion(link.id)}
              className="cursor-pointer border-none bg-none font-landing-body text-[14.5px] font-medium text-landing-steel transition-colors duration-150 hover:text-landing-charcoal max-[879px]:w-full max-[879px]:border-b max-[879px]:border-landing-line max-[879px]:py-3.5 max-[879px]:text-left max-[879px]:text-[15px] max-[879px]:last:border-b-0"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            aria-controls="nav-links"
            onClick={() => setMenuAbierto((v) => !v)}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[3px] border border-landing-line text-landing-charcoal min-[880px]:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>

          <Link
            href="/login"
            className="flex items-center gap-0 rounded-[3px] bg-landing-orange px-[11px] py-[7px] font-landing-body text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-landing-orange-deep min-[400px]:px-3.5 min-[400px]:py-2 min-[400px]:text-[13px] min-[880px]:gap-2 min-[880px]:px-[22px] min-[880px]:py-2.5 min-[880px]:text-[14.5px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="hidden h-[15px] w-[15px] shrink-0 min-[880px]:block">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            Ingresar
          </Link>
        </div>
      </div>
    </header>
  );
}
