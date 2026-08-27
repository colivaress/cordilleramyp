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
  await requireRol("supervisor", "administrador");
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, estado, revision_actual, patente_camion, patente_rampla")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  if (!puedeReinspeccionar(ticket.estado)) {
    redirect(`/tickets/${id}`);
  }

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
          Revisión #{ticket.revision_actual + 1}. Volvé a evaluar el checklist
          completo y capturá las dos firmas.
        </p>
      </div>
      <InspeccionForm
        modo="reinspeccion"
        items={items ?? []}
        ticketId={id}
        numeroRevision={ticket.revision_actual + 1}
      />
    </div>
  );
}
