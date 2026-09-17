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
  // No se necesita el perfil acá — el guard de esta página ya no compara
  // dueño (ver el comentario más abajo); autorizarRevisionEnCurso, del lado
  // del servidor, es quien decide quién puede hidratar/guardar de verdad.
  await requireRol("supervisor");
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, estado, revision_actual, numero_inspeccion, patente_camion, patente_rampla, conductor, fecha_vencimiento, supervisor_id, tipo_inspeccion",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();
  if (!ticket.tipo_inspeccion) notFound();

  // §2.14/"abrir no debe escribir": al hacer el PRIMER guardado real, el
  // ticket pasa a `en_reparacion_de_observaciones` — YA NO a `en_revision`
  // (ver el comentario grande en iniciarReinspeccion, tickets/actions.ts) —
  // y se queda ahí durante TODA la reinspección, para seguir visible para
  // el resto de los supervisores mientras dura. Por eso este guard ya no
  // puede mirar `ticket.estado === "en_revision"`: ese valor nunca vuelve a
  // aparecer en este flujo. "¿hay una revisión abierta?" se decide con
  // `ticket_revisiones.estado_resultante` de la última revisión — mismo
  // criterio que `autorizarRevisionEnCurso` server-side.
  const { data: revActual } = await supabase
    .from("ticket_revisiones")
    .select("numero_revision, estado_resultante, supervisor_id")
    .eq("ticket_id", id)
    .order("numero_revision", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hayRevisionAbierta =
    revActual != null &&
    revActual.numero_revision === ticket.revision_actual &&
    revActual.numero_revision > 1 &&
    revActual.estado_resultante === "en_revision";

  // Sin chequeo de dueño acá a propósito: es solo si se MUESTRA el
  // formulario o se redirige, no una autorización — quien no tiene derecho
  // a esta revisión igual no puede hidratar nada (autorizarRevisionEnCurso,
  // vía obtenerEstadoRevision) ni guardar (mismo gate, vía cualquier
  // guardarX), así que en el peor caso ve el paso 1 en blanco.
  if (!puedeReinspeccionar(ticket.estado) && !hayRevisionAbierta) {
    redirect(`/tickets/${id}`);
  }

  // Si la re-inspección ya arrancó, su `numero_revision` ya está creado
  // (`revision_actual` bumpeado). Si todavía no, es la siguiente.
  const numeroRevision = hayRevisionAbierta
    ? ticket.revision_actual
    : ticket.revision_actual + 1;

  // Fase "tipos de inspección" — parte 2/4. El tipo es fijo desde que se creó
  // el ticket — se filtra server-side, no se vuelve a pedir en el formulario.
  const { data: items } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("tipo", ticket.tipo_inspeccion)
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
        tipoInspeccionInicial={ticket.tipo_inspeccion}
      />
    </div>
  );
}
