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
  await getSesion();
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, telefono)",
    )
    .order("created_at", { ascending: false });

  const lista = tickets ?? [];

  // Fallas abiertas (no conformes de la última revisión) por ticket, para el mensaje de WhatsApp.
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("ticket_id, revision_numero, estado, observacion, item:checklist_items(nombre)")
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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Tickets de inspección y alertas de vencimiento.
          </p>
        </div>
        <Link href="/tickets/new" className={buttonVariants({})}>
          Nueva inspección
        </Link>
      </div>

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
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No hay tickets todavía.
                    </TableCell>
                  </TableRow>
                )}
                {lista.map((t) => {
                  const nivel = nivelAlerta(t.fecha_vencimiento, t.estado);
                  return (
                    <TableRow key={t.id} className={cn(clasesFilaAlerta(nivel))}>
                      <TableCell className="font-medium">
                        {t.patente_camion}
                        <span className="text-muted-foreground">
                          {" "}
                          / {t.patente_rampla}
                        </span>
                      </TableCell>
                      <TableCell>{t.transporte}</TableCell>
                      <TableCell>
                        <TicketStatusBadge
                          estado={t.estado}
                          revision={t.revision_actual}
                        />
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
