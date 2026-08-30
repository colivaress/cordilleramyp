"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Selector de mes para el dashboard de administrador (§2.6). Filtra la tabla por
 * `tickets.created_at`. Navega con `?mes=YYYY-MM` (o sin query para "todos").
 */
export function MesFilter({
  opciones,
  seleccionado,
}: {
  opciones: { valor: string; etiqueta: string }[];
  seleccionado: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="filtro-mes" className="text-sm text-muted-foreground">
        Mes
      </label>
      <select
        id="filtro-mes"
        value={seleccionado}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `${pathname}?mes=${v}` : pathname);
        }}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Todos los meses</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
