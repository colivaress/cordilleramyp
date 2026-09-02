import Link from "next/link";
import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
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
import { TicketStatusBadge } from "@/components/TicketStatusBadge";
import { CountdownBadge } from "@/components/CountdownBadge";
import { DashboardFilters } from "@/components/DashboardFilters";
import { Paginacion } from "@/components/Paginacion";
import { ResumenCards } from "@/components/ResumenCards";
import { cn } from "@/lib/utils";
import { clasesFilaAlerta, nivelAlerta } from "@/lib/vencimiento";
import {
  ESTADOS_FILTRO,
  calcularResumen,
  mesEtiqueta,
  mesKey,
} from "@/lib/dashboard";
import { nombreCompleto } from "@/lib/mensajes";
import type { TicketEstado } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    estado?: string;
    supervisor?: string;
    page?: string;
  }>;
}) {
  const { mes, estado, supervisor, page } = await searchParams;
  const { perfil } = await getSesion();
  const esAdmin = perfil.rol === "administrador";
  const esSupervisor = perfil.rol === "supervisor";
  const supabase = await createClient();

  // §2.6: la RLS de `select` ya limita qué tickets ve cada rol (el admin todos;
  // el supervisor los suyos + los "con observaciones"). No filtramos por
  // supervisor_id acá — un filtro extra ocultaría de más.
  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, apellido)",
    )
    .order("numero_inspeccion", { ascending: false });
  const lista = tickets ?? [];

  // Revisión más reciente por ticket (contador que reinicia en 1 por ticket).
  const { data: revisiones } = await supabase
    .from("ticket_revisiones")
    .select("ticket_id, numero_revision");
  const ultimoNumeroRevision = new Map<string, number>();
  for (const r of revisiones ?? []) {
    if (r.numero_revision > (ultimoNumeroRevision.get(r.ticket_id) ?? 0))
      ultimoNumeroRevision.set(r.ticket_id, r.numero_revision);
  }
  const numeroRevision = (t: { id: string; revision_actual: number }): number =>
    ultimoNumeroRevision.get(t.id) ?? t.revision_actual;

  // §2.6/§2.11: las tarjetas muestran los totales globales (sin filtrar), para
  // que coincidan con la página de analítica (§2.11).
  const resumen = calcularResumen(lista);

  // ---- Filtros de la tabla (§2.6): mes + supervisor solo admin; estado ambos ----
  const mesesDisponibles = esAdmin
    ? [...new Set(lista.map((t) => mesKey(t.created_at)))]
        .sort()
        .reverse()
        .map((k) => ({ valor: k, etiqueta: mesEtiqueta(k) }))
    : [];
  const mesSel =
    esAdmin && mes && mesesDisponibles.some((o) => o.valor === mes) ? mes : "";

  const estadosValidos = new Set(ESTADOS_FILTRO.map((e) => e.valor));
  const estadoSel =
    estado && estadosValidos.has(estado as TicketEstado)
      ? (estado as TicketEstado)
      : "";

  const supervisoresDisponibles = esAdmin
    ? [
        ...new Map(
          lista
            .filter((t) => t.supervisor)
            .map((t) => [
              t.supervisor!.id,
              {
                valor: t.supervisor!.id,
                etiqueta: nombreCompleto(
                  t.supervisor!.nombre,
                  t.supervisor!.apellido,
                ),
              },
            ]),
        ).values(),
      ].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"))
    : [];
  const supervisorSel =
    esAdmin && supervisor && supervisoresDisponibles.some((o) => o.valor === supervisor)
      ? supervisor
      : "";

  const listaFiltrada = lista.filter(
    (t) =>
      (!mesSel || mesKey(t.created_at) === mesSel) &&
      (!estadoSel || t.estado === estadoSel) &&
      (!supervisorSel || t.supervisor_id === supervisorSel),
  );

  // ---- Paginación (§2.6): 15 por página ----
  const totalPaginas = Math.max(
    1,
    Math.ceil(listaFiltrada.length / POR_PAGINA),
  );
  const pageActual = Math.min(
    Math.max(1, Number(page) || 1),
    totalPaginas,
  );
  const listaPagina = listaFiltrada.slice(
    (pageActual - 1) * POR_PAGINA,
    pageActual * POR_PAGINA,
  );

  const hayFiltro = !!(mesSel || estadoSel || supervisorSel);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inspecciones</h1>
          <p className="text-sm text-muted-foreground">
            {esAdmin
              ? "Todas las inspecciones y alertas de vencimiento."
              : "Tus inspecciones y alertas de vencimiento."}
          </p>
        </div>
        {esSupervisor && (
          <Link href="/tickets/new" className={buttonVariants({})}>
            Nueva inspección
          </Link>
        )}
      </div>

      {esAdmin && <ResumenCards resumen={resumen} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Inspecciones</CardTitle>
              <CardDescription>
                Las filas se resaltan según el tiempo hasta la fecha límite de
                corrección (ámbar ≤48h, naranja ≤24h, rojo vencido).
              </CardDescription>
            </div>
            <DashboardFilters
              meses={esAdmin ? mesesDisponibles : null}
              supervisores={esAdmin ? supervisoresDisponibles : null}
              estados={ESTADOS_FILTRO}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* §2.6: primera columna "Ver" sin título visible. La columna
                      del botón de WhatsApp se eliminó por completo (§2.6/§3). */}
                  <TableHead>
                    <span className="sr-only">Ver</span>
                  </TableHead>
                  {/* §2.6/§2.7: encabezado corto "Nro" (el resto de la app usa
                      "Nro de Inspección"). El nro de revisión va pegado acá
                      mismo como "#N", ya no en una columna aparte. */}
                  <TableHead>Nro</TableHead>
                  <TableHead>Camión / Rampla</TableHead>
                  <TableHead>Transporte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Supervisor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaPagina.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {hayFiltro
                        ? "No hay inspecciones para los filtros seleccionados."
                        : "No hay inspecciones todavía."}
                    </TableCell>
                  </TableRow>
                )}
                {listaPagina.map((t) => {
                  const nivel = nivelAlerta(t.fecha_vencimiento, t.estado);
                  return (
                    <TableRow key={t.id} className={cn(clasesFilaAlerta(nivel))}>
                      <TableCell>
                        {/* §2.6: "Ver" lleva directo al informe. El detalle con
                            todas las revisiones sigue en /tickets/[id]. */}
                        <Link
                          href={`/tickets/${t.id}/report`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "xs" }),
                            "border-brand-600/40 text-brand-700 hover:bg-brand-50 hover:text-brand-800",
                          )}
                        >
                          Ver
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums whitespace-nowrap">
                        {t.numero_inspeccion}
                        <span className="ml-1 text-xs text-muted-foreground">
                          #{numeroRevision(t)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.patente_camion}
                        <span className="text-muted-foreground">
                          {" "}
                          / {t.patente_rampla}
                        </span>
                      </TableCell>
                      <TableCell>{t.transporte}</TableCell>
                      <TableCell>
                        <TicketStatusBadge estado={t.estado} />
                      </TableCell>
                      <TableCell>
                        <CountdownBadge
                          fechaVencimiento={t.fecha_vencimiento}
                          estadoTicket={t.estado}
                          formatoTabla
                        />
                      </TableCell>
                      <TableCell>{t.supervisor?.nombre ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Paginacion page={pageActual} totalPaginas={totalPaginas} />
        </CardContent>
      </Card>
    </div>
  );
}
