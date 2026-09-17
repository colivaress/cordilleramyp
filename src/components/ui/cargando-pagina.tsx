import { Loader2Icon } from "lucide-react";

/**
 * Contenido de los `loading.tsx` de ruta (Next.js App Router) — nivel 3 de
 * retroalimentación visual (§ prioridad 3): antes NINGUNA ruta server-
 * rendered tenía loading.tsx, así que navegar entre pantallas (o un filtro
 * que dispara `router.push`) dejaba la pantalla anterior congelada, idéntica,
 * mientras el servidor re-renderizaba — el caso más puro de "apreté y no
 * pasó nada". Esto es la respuesta estándar y barata de Next.js: aparece
 * automáticamente entre la navegación y el contenido nuevo, sin lógica propia.
 */
export function CargandoPagina({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2Icon className="size-6 animate-spin motion-reduce:animate-none" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}
