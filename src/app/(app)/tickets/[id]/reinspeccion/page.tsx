import { notFound, redirect } from "next/navigation";
import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InspeccionForm } from "@/components/InspeccionForm";
import { puedeReinspeccionar } from "@/lib/ticket-state-machine";

export const dynamic = "force-dynamic";

export default async function ReinspeccionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // §2.6: registrar una re-inspección es crear una inspección → solo supervisor.
  const { perfil } = await requireRol("supervisor");
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, estado, revision_actual, numero_inspeccion, patente_camion, patente_rampla, conductor, fecha_vencimiento, supervisor_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  // §2.14: al presionar "Realizar revisión" el ticket pasa a `en_revision` y el
  // Server Action refresca esta misma ruta. Si el guard solo mirara
  // `puedeReinspeccionar`, ahí redirigiría al detalle y el supervisor nunca vería
  // el checklist. Se permite seguir en el formulario si el ticket está en una
  // re-inspección EN CURSO iniciada por este supervisor (o el creador del ticket)
  // y todavía sin cerrar.
  const { data: revActual } = await supabase
    .from("ticket_revisiones")
    .select("numero_revision, estado_resultante, supervisor_id")
    .eq("ticket_id", id)
    .order("numero_revision", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reinspeccionEnCurso =
    ticket.estado === "en_revision" &&
    revActual != null &&
    revActual.numero_revision > 1 &&
    revActual.estado_resultante === "en_revision" &&
    (revActual.supervisor_id === perfil.id ||
      ticket.supervisor_id === perfil.id);

  if (!puedeReinspeccionar(ticket.estado) && !reinspeccionEnCurso) {
    redirect(`/tickets/${id}`);
  }

  // Si la re-inspección ya arrancó, su `numero_revision` ya está creado
  // (`revision_actual` bumpeado). Si todavía no, es la siguiente.
  const numeroRevision = reinspeccionEnCurso
    ? ticket.revision_actual
    : ticket.revision_actual + 1;

  const { data: items } = await supabase
    .from("checklist_items")
    .select("*")
    .order("orden");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Re-inspección — {ticket.patente_camion} / {ticket.patente_rampla}
        </h1>
        <p className="text-sm text-muted-foreground">
          Revisión #{numeroRevision}. Volver a evaluar todos los elementos a
          fiscalizar y firmar.
        </p>
      </div>
      <InspeccionForm
        modo="reinspeccion"
        items={items ?? []}
        ticketId={id}
        numeroRevision={numeroRevision}
        numeroInspeccion={ticket.numero_inspeccion}
        conductorInicial={ticket.conductor}
        fechaVencimientoInicial={ticket.fecha_vencimiento}
      />
    </div>
  );
}
