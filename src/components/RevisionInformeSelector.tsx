"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type OpcionRevision = { valor: string; etiqueta: string };

/**
 * §4 — selector para elegir qué revisión muestra el informe cuando el ticket
 * tiene 2 o más. Navega por el query param `?rev=` (número puntual o "todas");
 * la página se re-renderiza en el servidor con esa selección, y el PDF de
 * "Enviar por correo" / "Enviar por WhatsApp" usa el mismo valor.
 */
export function RevisionInformeSelector({
  opciones,
  valorActual,
}: {
  opciones: OpcionRevision[];
  valorActual: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function cambiar(valor: string) {
    const next = new URLSearchParams(sp.toString());
    next.set("rev", valor);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="grid gap-1">
      <label
        htmlFor="informe-revision"
        className="text-xs text-muted-foreground"
      >
        Revisión a mostrar
      </label>
      <select
        id="informe-revision"
        value={valorActual}
        onChange={(e) => cambiar(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
