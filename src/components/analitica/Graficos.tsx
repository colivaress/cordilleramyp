"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// §6: misma paleta que el resto de la app (tokens semánticos de Tailwind v4).
const AZUL = "var(--color-brand-500)";
const AMBAR = "var(--color-warning-500)";
const PALETA_DONA = [
  "var(--color-brand-500)",
  "var(--color-success-500)",
  "var(--color-warning-500)",
  "var(--color-alert-500)",
  "var(--color-brand-700)",
  "var(--color-success-700)",
  "var(--color-warning-600)",
  "var(--color-alert-700)",
  "var(--color-brand-300)",
  "var(--color-success-300)",
];

const ejeStyle = { fontSize: 12, fill: "var(--color-neutral-500)" };
const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid var(--color-neutral-200)",
    fontSize: 12,
  },
};

export function GraficoBarrasMes({
  datos,
}: {
  datos: { mes: string; total: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-neutral-200)"
            vertical={false}
          />
          <XAxis dataKey="mes" tick={ejeStyle} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={ejeStyle} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} />
          <Bar
            dataKey="total"
            name="Inspecciones"
            fill={AZUL}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoConObservaciones({
  datos,
}: {
  datos: { mes: string; total: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-neutral-200)"
            vertical={false}
          />
          <XAxis dataKey="mes" tick={ejeStyle} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={ejeStyle} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} />
          <Bar
            dataKey="total"
            name="Con observaciones"
            fill={AMBAR}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoDonaSupervisores({
  ticketsDona,
  mesesOpciones,
}: {
  ticketsDona: { supervisor: string; mes: string }[];
  mesesOpciones: { valor: string; etiqueta: string }[];
}) {
  // §2.11: selector de mes propio; por defecto, el mes más reciente con datos.
  const [mes, setMes] = useState<string>(mesesOpciones[0]?.valor ?? "");

  const datos = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const t of ticketsDona) {
      if (mes && t.mes !== mes) continue;
      conteo.set(t.supervisor, (conteo.get(t.supervisor) ?? 0) + 1);
    }
    return [...conteo.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [ticketsDona, mes]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor="dona-mes" className="text-xs text-muted-foreground">
          Mes
        </label>
        <select
          id="dona-mes"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-9 w-fit rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Todos los meses</option>
          {mesesOpciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <div className="h-64 w-full">
        {datos.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin inspecciones en el período seleccionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={datos}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
              >
                {datos.map((_, i) => (
                  <Cell
                    key={i}
                    fill={PALETA_DONA[i % PALETA_DONA.length]}
                    stroke="var(--color-card, #fff)"
                  />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
