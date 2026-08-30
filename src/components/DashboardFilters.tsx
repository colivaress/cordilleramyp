"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opcion = { valor: string; etiqueta: string };

/**
 * Filtros de la tabla de inspecciones (§2.6): mes y supervisor solo para el
 * dashboard de administrador; estado en ambas pantallas. Navegan por query
 * params y se combinan (AND). Cualquier cambio vuelve a la página 1.
 */
export function DashboardFilters({
  meses,
  supervisores,
  estados,
}: {
  meses?: Opcion[] | null;
  supervisores?: Opcion[] | null;
  estados: Opcion[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(clave: string, valor: string) {
    const next = new URLSearchParams(sp.toString());
    if (valor) next.set(clave, valor);
    else next.delete(clave);
    next.delete("page"); // cambiar un filtro reinicia la paginación (§2.6)
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {meses && meses.length > 0 && (
        <Campo
          id="filtro-mes"
          etiqueta="Mes"
          valor={sp.get("mes") ?? ""}
          onChange={(v) => setParam("mes", v)}
          todos="Todos los meses"
          opciones={meses}
        />
      )}
      <Campo
        id="filtro-estado"
        etiqueta="Estado"
        valor={sp.get("estado") ?? ""}
        onChange={(v) => setParam("estado", v)}
        todos="Todos los estados"
        opciones={estados}
      />
      {supervisores && supervisores.length > 0 && (
        <Campo
          id="filtro-supervisor"
          etiqueta="Supervisor"
          valor={sp.get("supervisor") ?? ""}
          onChange={(v) => setParam("supervisor", v)}
          todos="Todos los supervisores"
          opciones={supervisores}
        />
      )}
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  todos,
  opciones,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  todos: string;
  opciones: Opcion[];
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
