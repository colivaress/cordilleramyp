import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResumenCards } from "@/components/ResumenCards";
import {
  GraficoBarrasMes,
  GraficoConObservaciones,
  GraficoDonaSupervisores,
} from "@/components/analitica/Graficos";
import { calcularResumen } from "@/lib/dashboard";
import { construirAnalitica } from "@/lib/analitica";
import { ETIQUETA_ESTADO } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function AnaliticaPage() {
  // §2.11: analítica exclusiva del administrador (ruta + RLS).
  await requireRol("administrador");
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "id, created_at, estado, fecha_vencimiento, supervisor_id, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, apellido)",
    );
  const { data: revisiones } = await supabase
    .from("ticket_revisiones")
    .select("ticket_id, created_at, estado_resultante");

  const lista = tickets ?? [];
  const resumen = calcularResumen(lista);
  const {
    porEstado,
    inspeccionesPorMes,
    conObservacionesPorMes,
    ticketsDona,
    mesesOpciones,
    statsSupervisor,
  } = construirAnalitica(lista, revisiones ?? []);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Analítica de inspecciones. El listado completo está en{" "}
          <span className="font-medium">Inspecciones</span>.
        </p>
      </div>

      <ResumenCards resumen={resumen} />

      <Card>
        <CardHeader>
          <CardTitle>Desglose por estado</CardTitle>
          <CardDescription>
            Inspecciones ya finalizadas, según cómo terminaron. Las que siguen en
            revisión no entran acá (van en la tarjeta “Inspecciones” de arriba).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {porEstado.map((x) => (
              <div
                key={x.estado}
                className="rounded-lg border bg-card px-4 py-3"
              >
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_ESTADO[x.estado]}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{x.total}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inspecciones por mes</CardTitle>
            <CardDescription>
              Tickets creados cada mes (por fecha de creación).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoBarrasMes datos={inspeccionesPorMes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspecciones por supervisor</CardTitle>
            <CardDescription>
              Proporción de inspecciones creadas por cada supervisor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoDonaSupervisores
              ticketsDona={ticketsDona}
              mesesOpciones={mesesOpciones}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inspecciones con observaciones por mes</CardTitle>
          <CardDescription>
            Tickets que en ese mes tuvieron una revisión que quedó “finalizada con
            observaciones”, aunque hoy ya estén resueltos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoConObservaciones datos={conObservacionesPorMes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estadísticas por supervisor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supervisor</TableHead>
                  <TableHead className="text-right">
                    Inspecciones realizadas
                  </TableHead>
                  <TableHead className="text-right">Con observaciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsSupervisor.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Todavía no hay inspecciones.
                    </TableCell>
                  </TableRow>
                )}
                {statsSupervisor.map((s) => (
                  <TableRow key={s.nombre}>
                    <TableCell className="font-medium">{s.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.conObs}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
