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
import { MesFilter } from "@/components/MesFilter";
import { cn } from "@/lib/utils";
import {
  clasesFilaAlerta,
  estadoVencimiento,
  nivelAlerta,
} from "@/lib/vencimiento";
import type { FallaResumen } from "@/lib/mensajes";

export const dynamic = "force-dynamic";

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** "YYYY-MM" del `created_at` en horario de Chile — §2.6 filtro por mes. */
function mesKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "Agosto 2026" a partir de "2026-08". */
function mesEtiqueta(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  // §2.6: el administrador ve todo; el supervisor ve solo sus tickets, sin
  // tarjetas de resumen. La RLS ya filtra a nivel de BD; acá además se refleja
  // en la UI y en el query.
  const { perfil } = await getSesion();
  const esAdmin = perfil.rol === "administrador";
  const esSupervisor = perfil.rol === "supervisor";
  const supabase = await createClient();

  // §2.6: el administrador ve todo; el supervisor ve sus propios tickets MÁS los
  // que estén "con observaciones" (cualquier supervisor puede tomar la siguiente
  // re-inspección). Esto ya lo hace cumplir la política RLS de `select` de
  // `tickets`, así que no hace falta filtrar acá — un filtro `.eq(supervisor_id)`
  // ocultaría de más.
  const ticketsQuery = supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, telefono)",
    )
    .order("numero_inspeccion", { ascending: false });

  // §2.6: UNA fila por ticket (nunca una por revisión). El orden lo da el ticket
  // (numero_inspeccion). La tabla itera sobre `tickets`, no sobre `ticket_revisiones`.
  const { data: tickets } = await ticketsQuery;
  const lista = tickets ?? [];

  // §2.6: filtro por mes (por `created_at`), SOLO en el dashboard de admin.
  const mesesDisponibles = esAdmin
    ? [...new Set(lista.map((t) => mesKey(t.created_at)))]
        .sort()
        .reverse()
        .map((k) => ({ valor: k, etiqueta: mesEtiqueta(k) }))
    : [];
  const mesSeleccionado =
    esAdmin && mes && mesesDisponibles.some((o) => o.valor === mes) ? mes : "";
  const listaVisible = mesSeleccionado
    ? lista.filter((t) => mesKey(t.created_at) === mesSeleccionado)
    : lista;

  // Por cada ticket, el `numero_revision` de su revisión MÁS RECIENTE (contador
  // que reinicia en 1 por ticket — §2.6, ya NO se usa nro_revision_global en UI).
  const { data: revisiones } = await supabase
    .from("ticket_revisiones")
    .select("ticket_id, numero_revision");

  const ultimoNumeroRevision = new Map<string, number>();
  for (const r of revisiones ?? []) {
    const previa = ultimoNumeroRevision.get(r.ticket_id) ?? 0;
    if (r.numero_revision > previa)
      ultimoNumeroRevision.set(r.ticket_id, r.numero_revision);
  }
  const numeroRevision = (t: { id: string; revision_actual: number }): number =>
    ultimoNumeroRevision.get(t.id) ?? t.revision_actual;

  // Fallas abiertas (no conformes de la última revisión) por ticket, para el mensaje de WhatsApp.
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select(
      "ticket_id, revision_numero, estado, observacion, item:checklist_items(nombre)",
    )
    .eq("estado", "no_conforme");

  const fallasPorTicket = new Map<string, FallaResumen[]>();
  for (const t of lista) {
    const abiertas = (respuestas ?? [])
      .filter(
        (r) => r.ticket_id === t.id && r.revision_numero === t.revision_actual,
      )
      .map((r) => ({
        nombre: r.item?.nombre ?? r.ticket_id,
        observacion: r.observacion,
      }));
    fallasPorTicket.set(t.id, abiertas);
  }

  const resumen = {
    total: listaVisible.length,
    porVencer: listaVisible.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "por_vencer",
    ).length,
    vencidos: listaVisible.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "vencido",
    ).length,
    // §2.6: "con fallas pendientes de corregir". Desde que se quitó el paso
    // manual "Iniciar reparación" (§2.3) ningún ticket nuevo llega a
    // `en_reparacion_de_observaciones`; se cuentan los `finalizada_con_observaciones`
    // (+ el legado para no perder datos antiguos).
    enReparacion: listaVisible.filter(
      (t) =>
        t.estado === "finalizada_con_observaciones" ||
        t.estado === "en_reparacion_de_observaciones",
    ).length,
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {esAdmin ? "Dashboard" : "Mis inspecciones"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {esAdmin
              ? "Todas las inspecciones y alertas de vencimiento."
              : "Tus inspecciones y alertas de vencimiento."}
          </p>
        </div>
        {/* §2.6: solo el supervisor crea inspecciones. */}
        {esSupervisor && (
          <Link href="/tickets/new" className={buttonVariants({})}>
            Nueva inspección
          </Link>
        )}
      </div>

      {esAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ResumenCard titulo="Inspecciones" valor={resumen.total} />
          <ResumenCard
            titulo="Por vencer (≤48h)"
            valor={resumen.porVencer}
            tono="amarillo"
          />
          <ResumenCard titulo="Vencidos" valor={resumen.vencidos} tono="rojo" />
          <ResumenCard
            titulo="En reparación"
            valor={resumen.enReparacion}
            tono="naranja"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Inspecciones</CardTitle>
              <CardDescription>
                Las filas se resaltan según el tiempo hasta la fecha límite de
                corrección (ámbar ≤48h, naranja ≤24h, rojo vencido).
              </CardDescription>
            </div>
            {/* §2.6: filtro por mes de creación — solo dashboard de admin. */}
            {esAdmin && mesesDisponibles.length > 0 && (
              <MesFilter
                opciones={mesesDisponibles}
                seleccionado={mesSeleccionado}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* §2.6: "Ver" es la primera columna en ambas pantallas. */}
                  <TableHead>Ver</TableHead>
                  <TableHead>Nro de Inspección</TableHead>
                  <TableHead>Nro de Revisión</TableHead>
                  <TableHead>Camión / Rampla</TableHead>
                  <TableHead>Transporte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Supervisor</TableHead>
                  {/* §2.6: la única acción extra ("Notificar por WhatsApp") es
                      solo del dashboard de administrador. */}
                  {esAdmin && (
                    <TableHead className="text-right">Acciones</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaVisible.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={esAdmin ? 9 : 8}
                      className="text-muted-foreground"
                    >
                      {mesSeleccionado
                        ? "No hay inspecciones creadas en el mes seleccionado."
                        : "No hay inspecciones todavía."}
                    </TableCell>
                  </TableRow>
                )}
                {listaVisible.map((t) => {
                  const nivel = nivelAlerta(t.fecha_vencimiento, t.estado);
                  return (
                    <TableRow key={t.id} className={cn(clasesFilaAlerta(nivel))}>
                      <TableCell>
                        <Link
                          href={`/tickets/${t.id}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "xs",
                          })}
                        >
                          Ver
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {t.numero_inspeccion}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {numeroRevision(t)}
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
                        {/* Solo el texto del estado — el nro de revisión ya está
                            en su columna "Nro de Revisión". */}
                        <TicketStatusBadge estado={t.estado} />
                      </TableCell>
                      <TableCell>
                        <CountdownBadge
                          fechaVencimiento={t.fecha_vencimiento}
                          estadoTicket={t.estado}
                        />
                      </TableCell>
                      <TableCell>{t.supervisor?.nombre ?? "—"}</TableCell>
                      {esAdmin && (
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <WhatsAppNotifyButton
                              size="xs"
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
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResumenCard({
  titulo,
  valor,
  tono,
}: {
  titulo: string;
  valor: number;
  tono?: "amarillo" | "naranja" | "rojo";
}) {
  const clase =
    tono === "rojo"
      ? "text-danger-700"
      : tono === "naranja"
        ? "text-alert-700"
        : tono === "amarillo"
          ? "text-warning-700"
          : "text-foreground";
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className={cn("text-3xl", clase)}>{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}
