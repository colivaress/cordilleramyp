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
import { BuscadorPatente } from "@/components/BuscadorPatente";
import { DashboardFilters } from "@/components/DashboardFilters";
import { FilaTicket } from "@/components/FilaTicket";
import { Paginacion } from "@/components/Paginacion";
import { ResumenCards } from "@/components/ResumenCards";
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

      {/* §5: BuscadorPatente es un passthrough transparente cuando `activo`
          es false (admin) o mientras no hay una búsqueda activa — la tarjeta
          de abajo es la MISMA tabla de siempre, sin cambios de comportamiento
          fuera de las dos columnas nuevas. Al buscar (solo supervisor), este
          componente la reemplaza por una tabla con las mismas filas
          (FilaTicket) filtradas a lo encontrado. */}
      <BuscadorPatente activo={esSupervisor}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Inspecciones</CardTitle>
                <CardDescription>
                  Las filas se resaltan según el tiempo hasta la fecha límite
                  de corrección (ámbar ≤48h, naranja ≤24h, rojo vencido).
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Camión / Rampla</TableHead>
                    <TableHead>Transporte</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Supervisor</TableHead>
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
                  {listaPagina.map((t) => (
                    <FilaTicket
                      key={t.id}
                      ticketId={t.id}
                      numeroInspeccion={t.numero_inspeccion}
                      numeroRevision={numeroRevision(t)}
                      tipoInspeccion={t.tipo_inspeccion}
                      patenteCamion={t.patente_camion}
                      patenteRampla={t.patente_rampla}
                      transporte={t.transporte}
                      estado={t.estado}
                      fecha={t.fecha}
                      fechaVencimiento={t.fecha_vencimiento}
                      supervisorNombre={t.supervisor?.nombre ?? "—"}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <Paginacion page={pageActual} totalPaginas={totalPaginas} />
          </CardContent>
        </Card>
      </BuscadorPatente>
    </div>
  );
}
