"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSesion } from "@/lib/auth";
import {
  estadoTrasChecklist,
  puedeIniciarReparacion,
  puedeReinspeccionar,
} from "@/lib/ticket-state-machine";
import type { ItemEstado } from "@/lib/tipos";

export type RespuestaInput = {
  itemKey: string;
  estado: ItemEstado;
  observacion: string | null;
  fotoPath: string | null;
};

export type CabeceraInput = {
  transporte: string;
  conductor: string;
  fecha: string; // ISO
  procedencia: string;
  tipo_camion: string;
  patente_camion: string;
  patente_rampla: string;
};

export type CrearInspeccionInput = {
  ticketId: string;
  cabecera: CabeceraInput;
  // §2.7: un solo vencimiento por revisión, tomado de "Datos de Inspección".
  fechaVencimientoISO: string;
  respuestas: RespuestaInput[];
  firmaConductorPath: string;
  firmaFiscalizadorPath: string;
};

function validarRespuestas(respuestas: RespuestaInput[]) {
  if (respuestas.length === 0) throw new Error("El checklist está vacío.");
  for (const r of respuestas) {
    if (r.estado === "no_conforme") {
      if (!r.observacion?.trim())
        throw new Error(`Falta la observación en "${r.itemKey}".`);
      if (!r.fotoPath)
        throw new Error(`Falta la foto de la falla en "${r.itemKey}".`);
    }
  }
}

export async function crearInspeccion(input: CrearInspeccionInput) {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  validarRespuestas(input.respuestas);
  if (!input.fechaVencimientoISO)
    throw new Error("Falta la fecha de vencimiento de la corrección.");
  if (!input.firmaConductorPath || !input.firmaFiscalizadorPath)
    throw new Error("Faltan las firmas del conductor y/o del fiscalizador.");

  const hayNoConformes = input.respuestas.some(
    (r) => r.estado === "no_conforme",
  );
  const estado = estadoTrasChecklist(hayNoConformes);

  const { error: eTicket } = await supabase.from("tickets").insert({
    id: input.ticketId,
    ...input.cabecera,
    estado,
    revision_actual: 1,
    supervisor_id: perfil.id,
    // §2.7: el vencimiento efectivo del ticket es el de su revisión más reciente.
    fecha_vencimiento: input.fechaVencimientoISO,
  });
  if (eTicket) throw new Error(`No se pudo crear el ticket: ${eTicket.message}`);

  const { error: eRev } = await supabase.from("ticket_revisiones").insert({
    ticket_id: input.ticketId,
    numero_revision: 1,
    estado_resultante: estado,
    supervisor_id: perfil.id,
    // §2.6: la revisión #1 guarda el conductor de la cabecera del ticket.
    conductor: input.cabecera.conductor,
    // §2.7: un solo vencimiento por revisión.
    fecha_vencimiento: input.fechaVencimientoISO,
    firma_conductor_url: input.firmaConductorPath,
    firma_fiscalizador_url: input.firmaFiscalizadorPath,
  });
  if (eRev) throw new Error(`No se pudo crear la revisión: ${eRev.message}`);

  const { error: eResp } = await supabase.from("ticket_checklist_respuestas").insert(
    input.respuestas.map((r) => ({
      ticket_id: input.ticketId,
      revision_numero: 1,
      item_key: r.itemKey,
      estado: r.estado,
      observacion: r.estado === "no_conforme" ? r.observacion : null,
      foto_url: r.fotoPath,
    })),
  );
  if (eResp) throw new Error(`No se pudieron guardar las respuestas: ${eResp.message}`);

  revalidatePath("/dashboard");
  redirect(`/tickets/${input.ticketId}`);
}

export async function iniciarReparacion(ticketId: string) {
  await getSesion();
  const supabase = await createClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("estado")
    .eq("id", ticketId)
    .single();
  if (error || !ticket) throw new Error("Ticket no encontrado.");
  if (!puedeIniciarReparacion(ticket.estado))
    throw new Error(
      "Solo se puede iniciar reparación desde 'Finalizada con observaciones'.",
    );

  const { error: eUpd } = await supabase
    .from("tickets")
    .update({
      estado: "en_reparacion_de_observaciones",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (eUpd) throw new Error(eUpd.message);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/dashboard");
}

export async function registrarReinspeccion(input: {
  ticketId: string;
  conductor: string;
  fechaVencimientoISO: string;
  respuestas: RespuestaInput[];
  firmaConductorPath: string;
  firmaFiscalizadorPath: string;
}) {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  validarRespuestas(input.respuestas);
  if (!input.conductor?.trim())
    throw new Error("Falta el conductor de esta revisión.");
  if (!input.fechaVencimientoISO)
    throw new Error("Falta la fecha de vencimiento de la corrección.");
  if (!input.firmaConductorPath || !input.firmaFiscalizadorPath)
    throw new Error("Faltan las firmas del conductor y/o del fiscalizador.");

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("estado, revision_actual")
    .eq("id", input.ticketId)
    .single();
  if (error || !ticket) throw new Error("Ticket no encontrado.");
  if (!puedeReinspeccionar(ticket.estado))
    throw new Error(
      "Solo se puede re-inspeccionar un ticket 'En reparación de observaciones'.",
    );

  const nuevaRevision = ticket.revision_actual + 1;
  const hayNoConformes = input.respuestas.some((r) => r.estado === "no_conforme");
  const estado = estadoTrasChecklist(hayNoConformes);
  const conductor = input.conductor.trim();

  const { error: eRev } = await supabase.from("ticket_revisiones").insert({
    ticket_id: input.ticketId,
    numero_revision: nuevaRevision,
    estado_resultante: estado,
    supervisor_id: perfil.id,
    // §2.6: el conductor de ESTA revisión (puede diferir de las previas y no
    // toca sus filas).
    conductor,
    // §2.7: un solo vencimiento por revisión.
    fecha_vencimiento: input.fechaVencimientoISO,
    firma_conductor_url: input.firmaConductorPath,
    firma_fiscalizador_url: input.firmaFiscalizadorPath,
  });
  if (eRev) throw new Error(`No se pudo crear la revisión: ${eRev.message}`);

  const { error: eResp } = await supabase
    .from("ticket_checklist_respuestas")
    .insert(
      input.respuestas.map((r) => ({
        ticket_id: input.ticketId,
        revision_numero: nuevaRevision,
        item_key: r.itemKey,
        estado: r.estado,
        observacion: r.estado === "no_conforme" ? r.observacion : null,
        foto_url: r.fotoPath,
      })),
    );
  if (eResp) throw new Error(`No se pudieron guardar las respuestas: ${eResp.message}`);

  const { error: eUpd } = await supabase
    .from("tickets")
    .update({
      estado,
      revision_actual: nuevaRevision,
      fecha_vencimiento: input.fechaVencimientoISO,
      // La cabecera del ticket refleja el conductor de la última revisión (para
      // la tabla resumen y el informe); el histórico vive en ticket_revisiones.
      conductor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ticketId);
  if (eUpd) throw new Error(eUpd.message);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  redirect(`/tickets/${input.ticketId}`);
}
