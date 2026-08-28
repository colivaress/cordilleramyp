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
import { cn } from "@/lib/utils";
import {
  clasesFilaAlerta,
  estadoVencimiento,
  nivelAlerta,
} from "@/lib/vencimiento";
import type { FallaResumen } from "@/lib/mensajes";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // §2.6: el administrador ve todo; el supervisor ve solo sus tickets, sin
  // tarjetas de resumen. La RLS ya filtra a nivel de BD; acá además se refleja
  // en la UI y en el query.
  const { perfil } = await getSesion();
  const esAdmin = perfil.rol === "administrador";
  const esSupervisor = perfil.rol === "supervisor";
  const supabase = await createClient();

  let ticketsQuery = supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, telefono)",
    )
    .order("numero_inspeccion", { ascending: false });
  if (!esAdmin) ticketsQuery = ticketsQuery.eq("supervisor_id", perfil.id);

  // §2.6: UNA fila por ticket (nunca una por revisión). El orden lo da el ticket
  // (numero_inspeccion). La tabla itera sobre `tickets`, no sobre `ticket_revisiones`.
  const { data: tickets } = await ticketsQuery;
  const lista = tickets ?? [];

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
    total: lista.length,
    porVencer: lista.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "por_vencer",
    ).length,
    vencidos: lista.filter(
      (t) => estadoVencimiento(t.fecha_vencimiento, t.estado) === "vencido",
    ).length,
    enReparacion: lista.filter(
      (t) => t.estado === "en_reparacion_de_observaciones",
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
              ? "Todos los tickets de inspección y alertas de vencimiento."
              : "Tus tickets de inspección y alertas de vencimiento."}
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
          <ResumenCard titulo="Tickets" valor={resumen.total} />
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
          <CardTitle>Tickets</CardTitle>
          <CardDescription>
            Las filas se resaltan según el tiempo hasta la fecha límite de
            corrección (ámbar ≤48h, naranja ≤24h, rojo vencido).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nro de Inspección</TableHead>
                  <TableHead>Nro de Revisión</TableHead>
                  <TableHead>Camión / Rampla</TableHead>
                  <TableHead>Transporte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No hay tickets todavía.
                    </TableCell>
                  </TableRow>
                )}
                {lista.map((t) => {
                  const nivel = nivelAlerta(t.fecha_vencimiento, t.estado);
                  return (
                    <TableRow key={t.id} className={cn(clasesFilaAlerta(nivel))}>
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
                          <Link
                            href={`/tickets/${t.id}`}
                            className={buttonVariants({
                              variant: "outline",
                              size: "xs",
                            })}
                          >
                            Ver
                          </Link>
                          <Link
                            href={`/tickets/${t.id}/report`}
                            className={buttonVariants({
                              variant: "outline",
                              size: "xs",
                            })}
                          >
                            Informe
                          </Link>
                        </div>
                      </TableCell>
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
