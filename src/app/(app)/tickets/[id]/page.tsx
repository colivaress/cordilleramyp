import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firmarRutas } from "@/lib/storage";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/TicketStatusBadge";
import { ItemEstadoBadge } from "@/components/ItemEstadoBadge";
import { FotoFalla } from "@/components/FotoFalla";
import { CountdownBadge } from "@/components/CountdownBadge";
import { WhatsAppNotifyButton } from "@/components/WhatsAppNotifyButton";
import { BotonIniciarReparacion } from "@/components/BotonIniciarReparacion";
import {
  puedeIniciarReparacion,
  puedeReinspeccionar,
} from "@/lib/ticket-state-machine";
import type { FallaResumen } from "@/lib/mensajes";

export const dynamic = "force-dynamic";

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function TicketDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { perfil } = await getSesion();
  const esSupervisor = perfil.rol === "supervisor";
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(id, nombre, telefono)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!ticket) notFound();

  const { data: revisiones } = await supabase
    .from("ticket_revisiones")
    .select("*")
    .eq("ticket_id", id)
    .order("numero_revision");

  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("*, item:checklist_items(nombre, orden)")
    .eq("ticket_id", id)
    .order("revision_numero");

  const revs = revisiones ?? [];
  const resp = respuestas ?? [];
  // §2.6: se identifica por el par (numero_inspeccion, numero_revision).
  const numeroRevisionActual = Math.max(
    ticket.revision_actual,
    ...revs.map((r) => r.numero_revision),
  );

  const urlFotos = await firmarRutas(
    supabase,
    "fallas",
    resp.map((r) => r.foto_url),
  );
  const urlFirmas = await firmarRutas(supabase, "firmas", [
    ...revs.map((r) => r.firma_conductor_url),
    ...revs.map((r) => r.firma_fiscalizador_url),
  ]);

  const fallasAbiertas: FallaResumen[] = resp
    .filter(
      (r) =>
        r.revision_numero === ticket.revision_actual &&
        r.estado === "no_conforme",
    )
    .map((r) => ({
      nombre: r.item?.nombre ?? r.item_key,
      observacion: r.observacion,
    }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {ticket.patente_camion}{" "}
            <span className="text-muted-foreground">/ {ticket.patente_rampla}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Nro de Inspección{" "}
            <span className="font-mono font-medium text-foreground">
              {ticket.numero_inspeccion}
            </span>
            {"  ·  "}
            Nro de Revisión{" "}
            <span className="font-mono font-medium text-foreground">
              {numeroRevisionActual}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge
            estado={ticket.estado}
            revision={ticket.revision_actual}
          />
          <CountdownBadge
            fechaVencimiento={ticket.fecha_vencimiento}
            estadoTicket={ticket.estado}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/tickets/${id}/report`}
          className={buttonVariants({ variant: "outline" })}
        >
          Ver informe
        </Link>
        {puedeIniciarReparacion(ticket.estado) && (
          <BotonIniciarReparacion ticketId={id} />
        )}
        {esSupervisor && puedeReinspeccionar(ticket.estado) && (
          <Link
            href={`/tickets/${id}/reinspeccion`}
            className={buttonVariants({})}
          >
            Registrar re-inspección
          </Link>
        )}
        <WhatsAppNotifyButton
          ticketId={ticket.id}
          numeroInspeccion={ticket.numero_inspeccion}
          numeroRevision={numeroRevisionActual}
          patenteCamion={ticket.patente_camion}
          patenteRampla={ticket.patente_rampla}
          transporte={ticket.transporte}
          conductor={ticket.conductor}
          supervisorTelefono={ticket.supervisor?.telefono}
          supervisorNombre={ticket.supervisor?.nombre}
          fallas={fallasAbiertas}
          fechaVencimiento={ticket.fecha_vencimiento}
          estadoTicket={ticket.estado}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de Inspección</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Dato k="Transporte" v={ticket.transporte} />
          <Dato k="Conductor (última revisión)" v={ticket.conductor} />
          <Dato k="Fecha de inspección" v={fmt(ticket.fecha)} />
          <Dato k="Procedencia" v={ticket.procedencia} />
          <Dato k="Tipo de camión" v={ticket.tipo_camion} />
          <Dato k="Patente camión" v={ticket.patente_camion} />
          <Dato k="Patente rampla" v={ticket.patente_rampla} />
          <Dato k="Supervisor" v={ticket.supervisor?.nombre ?? "—"} />
          <Dato
            k="Vencimiento corrección (última revisión)"
            v={fmt(ticket.fecha_vencimiento)}
          />
        </CardContent>
      </Card>

      {revs.map((rev) => {
        const items = resp
          .filter((r) => r.revision_numero === rev.numero_revision)
          .sort((a, b) => (a.item?.orden ?? 0) - (b.item?.orden ?? 0));
        return (
          <Card key={rev.id}>
            <CardHeader>
              <CardTitle>Revisión #{rev.numero_revision}</CardTitle>
              <CardDescription>
                {fmt(rev.created_at)} · {" "}
                <TicketStatusBadge estado={rev.estado_resultante} />
                {rev.conductor ? (
                  <>
                    {" "}
                    · Conductor:{" "}
                    <span className="font-medium">{rev.conductor}</span>
                  </>
                ) : null}
                {rev.fecha_vencimiento ? (
                  <>
                    {" "}
                    · Vencimiento corrección:{" "}
                    <span className="font-medium">
                      {fmt(rev.fecha_vencimiento)}
                    </span>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul className="divide-y">
                {items.map((r) => (
                  <li key={r.id} className="grid gap-2 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{r.item?.nombre}</span>
                      <ItemEstadoBadge estado={r.estado} />
                    </div>
                    {r.estado === "no_conforme" && (
                      <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto]">
                        <p>{r.observacion}</p>
                        {r.foto_url && urlFotos[r.foto_url] && (
                          <FotoFalla
                            src={urlFotos[r.foto_url]}
                            alt={`Falla: ${r.item?.nombre}`}
                          />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                <Firma
                  titulo="Firma Conductor"
                  url={
                    rev.firma_conductor_url
                      ? urlFirmas[rev.firma_conductor_url]
                      : undefined
                  }
                />
                <Firma
                  titulo="Firma Fiscalizador/Supervisor"
                  url={
                    rev.firma_fiscalizador_url
                      ? urlFirmas[rev.firma_fiscalizador_url]
                      : undefined
                  }
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Firma({ titulo, url }: { titulo: string; url?: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      {url ? (
        <Image
          src={url}
          alt={titulo}
          width={280}
          height={120}
          unoptimized
          className="h-28 w-full rounded-md border bg-white object-contain"
        />
      ) : (
        <span className="text-sm text-muted-foreground">Sin firma</span>
      )}
    </div>
  );
}
