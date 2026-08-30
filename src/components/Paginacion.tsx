"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Números de página a mostrar: 1 … (actual-1, actual, actual+1) … total. */
function paginasVisibles(actual: number, total: number): (number | "…")[] {
  if (total <= 7)
    return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, actual, actual - 1, actual + 1]);
  const orden = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  for (let i = 0; i < orden.length; i++) {
    if (i > 0 && orden[i] - orden[i - 1] > 1) salida.push("…");
    salida.push(orden[i]);
  }
  return salida;
}

export function Paginacion({
  page,
  totalPaginas,
}: {
  page: number;
  totalPaginas: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (totalPaginas <= 1) return null;

  const href = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const btn = buttonVariants({ variant: "outline", size: "xs" });
  const inactivo = "pointer-events-none opacity-50";

  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-wrap items-center justify-center gap-1"
    >
      <Link
        href={href(page - 1)}
        aria-disabled={page <= 1}
        className={cn(btn, page <= 1 && inactivo)}
      >
        Anterior
      </Link>
      {paginasVisibles(page, totalPaginas).map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-2 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={buttonVariants({
              variant: n === page ? "default" : "outline",
              size: "xs",
            })}
          >
            {n}
          </Link>
        ),
      )}
      <Link
        href={href(page + 1)}
        aria-disabled={page >= totalPaginas}
        className={cn(btn, page >= totalPaginas && inactivo)}
      >
        Siguiente
      </Link>
    </nav>
  );
}
