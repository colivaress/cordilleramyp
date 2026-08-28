"use server";

import { revalidatePath } from "next/cache";
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

export type InspeccionResultado = {
  ticketId: string;
  numeroInspeccion: number;
};

export type IniciarInspeccionInput = {
  ticketId: string;
  cabecera: CabeceraInput;
  // §2.7: un solo vencimiento por revisión, tomado de "Datos de Inspección".
  fechaVencimientoISO: string;
};

export type FinalizarInspeccionInput = {
  ticketId: string;
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

function validarCabecera(c: CabeceraInput) {
  for (const [k, v] of Object.entries(c)) {
    if (!String(v ?? "").trim())
      throw new Error(`Falta el dato de inspección "${k}".`);
  }
}

/**
 * §2.6: la fila en `tickets` se crea cuando el supervisor pasa de la cabecera al
 * checklist ("Realizar revisión"), no al finalizar — así `numero_inspeccion` ya
 * existe y §2.8 tiene un `ticket_id` real para subir firmas/fotos a Storage.
 * El ticket nace en `en_revision` (§2.3). Es un upsert: si el supervisor vuelve
 * atrás, edita la cabecera y avanza de nuevo, actualiza la misma fila.
 * La unicidad de `numero_inspeccion` entre inspectores simultáneos la garantiza
 * el `generated always as identity` de Postgres.
 */
export async function iniciarInspeccion(
  input: IniciarInspeccionInput,
): Promise<InspeccionResultado> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    throw new Error("Solo un supervisor puede crear inspecciones.");
  const supabase = await createClient();

  validarCabecera(input.cabecera);
  if (!input.fechaVencimientoISO)
    throw new Error("Falta la fecha de vencimiento de la corrección.");

  const { data, error } = await supabase
    .from("tickets")
    .upsert(
      {
        id: input.ticketId,
        ...input.cabecera,
        estado: "en_revision",
        revision_actual: 1,
        supervisor_id: perfil.id,
        fecha_vencimiento: input.fechaVencimientoISO,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("numero_inspeccion")
    .single();
  if (error || !data)
    throw new Error(
      `No se pudo iniciar la inspección: ${error?.message ?? "sin datos"}`,
    );

  revalidatePath("/dashboard");
  return { ticketId: input.ticketId, numeroInspeccion: data.numero_inspeccion };
}

/**
 * Cierra la revisión #1 de una inspección ya iniciada: crea `ticket_revisiones`
 * y `ticket_checklist_respuestas`, y pasa el ticket al estado final según el
 * checklist. Idempotente/retryable si un intento anterior falló a mitad.
 */
export async function finalizarInspeccion(
  input: FinalizarInspeccionInput,
): Promise<InspeccionResultado> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  validarRespuestas(input.respuestas);
  if (!input.firmaConductorPath || !input.firmaFiscalizadorPath)
    throw new Error("Faltan las firmas del conductor y/o del fiscalizador.");

  const { data: ticket, error: eGet } = await supabase
    .from("tickets")
    .select(
      "estado, supervisor_id, numero_inspeccion, conductor, fecha_vencimiento",
    )
    .eq("id", input.ticketId)
    .maybeSingle();
  if (eGet || !ticket)
    throw new Error(
      "No se encontró la inspección iniciada. Volver a 'Datos de Inspección' y presionar 'Realizar revisión'.",
    );
  if (ticket.supervisor_id !== perfil.id)
    throw new Error("Solo el supervisor a cargo puede finalizar la inspección.");
  if (ticket.estado !== "en_revision")
    throw new Error("Esta inspección ya fue finalizada.");

  const hayNoConformes = input.respuestas.some(
    (r) => r.estado === "no_conforme",
  );
  const estado = estadoTrasChecklist(hayNoConformes);

  const { error: eRev } = await supabase.from("ticket_revisiones").upsert(
    {
      ticket_id: input.ticketId,
      numero_revision: 1,
      estado_resultante: estado,
      supervisor_id: perfil.id,
      // §2.6/§2.7: conductor y vencimiento se fijaron al iniciar la inspección.
      conductor: ticket.conductor,
      fecha_vencimiento: ticket.fecha_vencimiento,
      firma_conductor_url: input.firmaConductorPath,
      firma_fiscalizador_url: input.firmaFiscalizadorPath,
    },
    { onConflict: "ticket_id,numero_revision" },
  );
  if (eRev) throw new Error(`No se pudo guardar la revisión: ${eRev.message}`);

  await supabase
    .from("ticket_checklist_respuestas")
    .delete()
    .eq("ticket_id", input.ticketId)
    .eq("revision_numero", 1);
  const { error: eResp } = await supabase
    .from("ticket_checklist_respuestas")
    .insert(
      input.respuestas.map((r) => ({
        ticket_id: input.ticketId,
        revision_numero: 1,
        item_key: r.itemKey,
        estado: r.estado,
        observacion: r.estado === "no_conforme" ? r.observacion : null,
        foto_url: r.fotoPath,
      })),
    );
  if (eResp)
    throw new Error(`No se pudieron guardar las respuestas: ${eResp.message}`);

  const { error: eUpd } = await supabase
    .from("tickets")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", input.ticketId);
  if (eUpd) throw new Error(eUpd.message);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return {
    ticketId: input.ticketId,
    numeroInspeccion: ticket.numero_inspeccion,
  };
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
  return { ticketId: input.ticketId };
}
