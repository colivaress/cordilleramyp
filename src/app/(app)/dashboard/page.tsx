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
import { WhatsAppNotifyButton } from "@/components/WhatsAppNotifyButton";
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
import type { FallaResumen } from "@/lib/mensajes";
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
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, apellido, telefono)",
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

  // No conformes de la última revisión, por ticket — para el mensaje de WhatsApp.
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select(
      "ticket_id, revision_numero, estado, observacion, item:checklist_items(nombre)",
    )
    .eq("estado", "no_conforme");
  const fallasPorTicket = new Map<string, FallaResumen[]>();
  for (const t of lista) {
    fallasPorTicket.set(
      t.id,
      (respuestas ?? [])
        .filter(
          (r) =>
            r.ticket_id === t.id && r.revision_numero === t.revision_actual,
        )
        .map((r) => ({
          nombre: r.item?.nombre ?? r.ticket_id,
          observacion: r.observacion,
        })),
    );
  }

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
                  {/* §2.6: col 1 "Ver" y col 2 "WhatsApp" sin título visible;
                      la columna de WhatsApp queda reservada en ambas pantallas. */}
                  <TableHead>
                    <span className="sr-only">Ver</span>
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">Notificar por WhatsApp</span>
                  </TableHead>
                  {/* §2.6: solo en esta tabla el encabezado se acorta a "Nro"
                      (el resto de la app mantiene "Nro de Inspección"). */}
                  <TableHead>Nro</TableHead>
                  <TableHead>Camión / Rampla</TableHead>
                  <TableHead>Transporte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Nro de Revisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaPagina.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
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
                      <TableCell>
                        {esAdmin && (
                          <WhatsAppNotifyButton
                            ticketId={t.id}
                            numeroInspeccion={t.numero_inspeccion}
                            numeroRevision={numeroRevision(t)}
                            patenteCamion={t.patente_camion}
                            patenteRampla={t.patente_rampla}
                            transporte={t.transporte}
                            conductor={t.conductor}
                            supervisorTelefono={t.supervisor?.telefono}
                            supervisorNombre={t.supervisor?.nombre}
                            fallas={fallasPorTicket.get(t.id) ?? []}
                            fechaVencimiento={t.fecha_vencimiento}
                            estadoTicket={t.estado}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {t.numero_inspeccion}
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
                        />
                      </TableCell>
                      <TableCell>{t.supervisor?.nombre ?? "—"}</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {numeroRevision(t)}
                      </TableCell>
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
