"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSesion } from "@/lib/auth";
import {
  estadoTrasChecklist,
  puedeReinspeccionar,
} from "@/lib/ticket-state-machine";
import type { ItemEstado, TicketEstado } from "@/lib/tipos";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

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

export type GuardarRespuestaItemInput = {
  ticketId: string;
  revisionNumero: number;
  itemKey: string;
  estado: ItemEstado;
  observacion: string | null;
  fotoPath: string | null;
};

function validarCabecera(c: CabeceraInput) {
  for (const [k, v] of Object.entries(c)) {
    if (!String(v ?? "").trim())
      throw new Error(`Falta el dato de inspección "${k}".`);
  }
}

/**
 * Deja lista una revisión para que se pueda ir guardando por partes (§2.8):
 * garantiza la fila en `ticket_revisiones` (es el padre FK de las respuestas) y
 * siembra las 18 filas de `ticket_checklist_respuestas` en estado `conforme` —
 * así los ítems que el supervisor no toca igual quedan registrados y "Finalizar
 * revisión" solo tiene que cerrar sobre datos ya guardados. Es idempotente: si
 * el supervisor vuelve atrás y reingresa, no pisa lo ya marcado.
 */
async function prepararRevision(
  supabase: SupabaseServer,
  opts: {
    ticketId: string;
    numeroRevision: number;
    supervisorId: string;
    conductor: string;
    fechaVencimientoISO: string;
  },
) {
  const { data: revExistente } = await supabase
    .from("ticket_revisiones")
    .select("id")
    .eq("ticket_id", opts.ticketId)
    .eq("numero_revision", opts.numeroRevision)
    .maybeSingle();

  if (revExistente) {
    const { error } = await supabase
      .from("ticket_revisiones")
      .update({
        conductor: opts.conductor,
        fecha_vencimiento: opts.fechaVencimientoISO,
      })
      .eq("id", revExistente.id);
    if (error)
      throw new Error(`No se pudo actualizar la revisión: ${error.message}`);
  } else {
    const { error } = await supabase.from("ticket_revisiones").insert({
      ticket_id: opts.ticketId,
      numero_revision: opts.numeroRevision,
      estado_resultante: "en_revision",
      supervisor_id: opts.supervisorId,
      conductor: opts.conductor,
      fecha_vencimiento: opts.fechaVencimientoISO,
    });
    if (error)
      throw new Error(`No se pudo iniciar la revisión: ${error.message}`);
  }

  const { data: items } = await supabase.from("checklist_items").select("key");
  const filas = (items ?? []).map((i) => ({
    ticket_id: opts.ticketId,
    revision_numero: opts.numeroRevision,
    item_key: i.key,
    estado: "conforme" as const,
  }));
  if (filas.length > 0) {
    const { error } = await supabase
      .from("ticket_checklist_respuestas")
      .upsert(filas, {
        onConflict: "ticket_id,revision_numero,item_key",
        ignoreDuplicates: true,
      });
    if (error)
      throw new Error(
        `No se pudieron inicializar las respuestas: ${error.message}`,
      );
  }
}

/**
 * Verifica que la revisión tenga las 18 respuestas guardadas (§2.8: se fueron
 * guardando por ítem) y ambas firmas, calcula el estado resultante (§2.3) y lo
 * escribe en `ticket_revisiones.estado_resultante`. Devuelve el estado para que
 * el llamador actualice el ticket. NO inserta respuestas: solo cierra sobre lo
 * ya guardado.
 */
async function cerrarRevision(
  supabase: SupabaseServer,
  ticketId: string,
  numeroRevision: number,
): Promise<TicketEstado> {
  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("id, firma_conductor_url, firma_fiscalizador_url")
    .eq("ticket_id", ticketId)
    .eq("numero_revision", numeroRevision)
    .maybeSingle();
  if (!rev)
    throw new Error(
      "La revisión no está iniciada. Volver a los datos y presionar 'Realizar revisión'.",
    );
  if (!rev.firma_conductor_url || !rev.firma_fiscalizador_url)
    throw new Error("Faltan las firmas del conductor y/o del fiscalizador.");

  const { data: items } = await supabase.from("checklist_items").select("key");
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("item_key, estado, observacion, foto_url")
    .eq("ticket_id", ticketId)
    .eq("revision_numero", numeroRevision);

  const claves = (items ?? []).map((i) => i.key);
  const guardadas = respuestas ?? [];
  const respondidas = new Set(guardadas.map((r) => r.item_key));
  const faltan = claves.filter((k) => !respondidas.has(k));
  if (claves.length === 0 || faltan.length > 0)
    throw new Error(
      `Quedan ${
        faltan.length || claves.length
      } elemento(s) del checklist por completar (marcarlos, y adjuntar la foto en los no conformes).`,
    );
  for (const r of guardadas) {
    if (r.estado === "no_conforme" && (!r.observacion?.trim() || !r.foto_url))
      throw new Error("Hay un elemento no conforme sin observación o sin foto.");
  }

  const estado = estadoTrasChecklist(
    guardadas.some((r) => r.estado === "no_conforme"),
  );
  const { error } = await supabase
    .from("ticket_revisiones")
    .update({ estado_resultante: estado })
    .eq("id", rev.id);
  if (error) throw new Error(`No se pudo cerrar la revisión: ${error.message}`);
  return estado;
}

/**
 * §2.6: la fila en `tickets` se crea cuando el supervisor pasa de la cabecera al
 * checklist ("Realizar revisión"), no al finalizar — así `numero_inspeccion` ya
 * existe y §2.8 tiene un `ticket_id` real para subir firmas/fotos a Storage.
 * También deja lista la revisión #1 (fila en `ticket_revisiones` + las 18
 * respuestas sembradas) para poder guardar por ítem. El ticket nace en
 * `en_revision` (§2.3). Es un upsert idempotente: si el supervisor vuelve atrás,
 * edita la cabecera y avanza de nuevo, actualiza la misma fila sin perder lo ya
 * marcado. La unicidad de `numero_inspeccion` entre inspectores simultáneos la
 * garantiza el `generated always as identity` de Postgres.
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
        // §3.1: ciclo de vencimiento nuevo → aún no se avisó por WhatsApp.
        alerta_naranja_enviada: false,
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

  await prepararRevision(supabase, {
    ticketId: input.ticketId,
    numeroRevision: 1,
    supervisorId: perfil.id,
    conductor: input.cabecera.conductor,
    fechaVencimientoISO: input.fechaVencimientoISO,
  });

  revalidatePath("/dashboard");
  return { ticketId: input.ticketId, numeroInspeccion: data.numero_inspeccion };
}

/**
 * §2.6: puede escribir en una revisión en curso el supervisor dueño del ticket
 * O el supervisor que abrió esa revisión (`ticket_revisiones.supervisor_id`) —
 * una re-inspección la puede tomar un supervisor distinto al creador del ticket.
 */
async function autorizarRevisionEnCurso(
  supabase: SupabaseServer,
  perfilId: string,
  ticketId: string,
  revisionNumero: number,
) {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("supervisor_id, estado")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("No se encontró la inspección.");
  if (ticket.estado !== "en_revision")
    throw new Error("La revisión ya fue finalizada.");
  if (ticket.supervisor_id === perfilId) return;

  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("supervisor_id")
    .eq("ticket_id", ticketId)
    .eq("numero_revision", revisionNumero)
    .maybeSingle();
  if (rev?.supervisor_id === perfilId) return;

  throw new Error("Solo el supervisor a cargo de esta revisión puede editarla.");
}

/**
 * §2.8: guarda UNA respuesta del checklist apenas el supervisor la marca, no
 * todas juntas al final. Un ítem `no_conforme` no se puede persistir hasta que
 * tenga foto (constraint `foto_obligatoria_si_no_conforme`); mientras no la
 * tenga se borra su fila para que "Finalizar revisión" no tome un estado viejo.
 */
export async function guardarRespuestaItem(
  input: GuardarRespuestaItemInput,
): Promise<{ guardado: boolean }> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );

  const esNoConforme = input.estado === "no_conforme";

  if (esNoConforme && !input.fotoPath) {
    const { error } = await supabase
      .from("ticket_checklist_respuestas")
      .delete()
      .eq("ticket_id", input.ticketId)
      .eq("revision_numero", input.revisionNumero)
      .eq("item_key", input.itemKey);
    if (error)
      throw new Error(`No se pudo actualizar la respuesta: ${error.message}`);
    return { guardado: false };
  }

  const { error } = await supabase.from("ticket_checklist_respuestas").upsert(
    {
      ticket_id: input.ticketId,
      revision_numero: input.revisionNumero,
      item_key: input.itemKey,
      estado: input.estado,
      observacion: esNoConforme ? input.observacion?.trim() || null : null,
      foto_url: esNoConforme ? input.fotoPath : null,
    },
    { onConflict: "ticket_id,revision_numero,item_key" },
  );
  if (error)
    throw new Error(`No se pudo guardar la respuesta: ${error.message}`);
  return { guardado: true };
}

/**
 * §2.8: persiste la ruta de una firma en `ticket_revisiones` apenas se captura
 * (el PNG ya se subió a Storage), para que sobreviva a la navegación entre pasos
 * y a una falla de "Finalizar revisión".
 */
export async function guardarFirmaRevision(input: {
  ticketId: string;
  revisionNumero: number;
  quien: "conductor" | "fiscalizador";
  path: string | null;
}) {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );

  const cambio =
    input.quien === "conductor"
      ? { firma_conductor_url: input.path }
      : { firma_fiscalizador_url: input.path };
  const { error } = await supabase
    .from("ticket_revisiones")
    .update(cambio)
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero);
  if (error) throw new Error(`No se pudo guardar la firma: ${error.message}`);
}

/**
 * §2.8: "Finalizar revisión" pasa a ser SOLO el cierre — calcula el estado
 * resultante y actualiza el ticket sobre datos que ya están guardados (las
 * respuestas por ítem y las firmas se fueron guardando antes). Una falla acá ya
 * no borra el trabajo del checklist. Idempotente/retryable.
 */
export async function finalizarInspeccion(input: {
  ticketId: string;
}): Promise<InspeccionResultado> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, supervisor_id, numero_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket)
    throw new Error(
      "No se encontró la inspección iniciada. Volver a 'Datos de Inspección' y presionar 'Realizar revisión'.",
    );
  if (ticket.supervisor_id !== perfil.id)
    throw new Error("Solo el supervisor a cargo puede finalizar la inspección.");
  if (ticket.estado !== "en_revision")
    throw new Error("Esta inspección ya fue finalizada.");

  const estado = await cerrarRevision(supabase, input.ticketId, 1);

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

/**
 * §2.8: arranque de una re-inspección — mismo criterio que `iniciarInspeccion`.
 * §2.3/§2.6: se entra directo desde "Finalizada con observaciones" (o el legado
 * "En reparación de observaciones"), sin paso manual de "Iniciar reparación", y
 * la puede tomar CUALQUIER supervisor, no solo el que creó el ticket. Pasa el
 * ticket a `en_revision` con `revision_actual += 1`, deja lista la fila de
 * `ticket_revisiones` de la nueva revisión (con `supervisor_id` = quien hace
 * ESTA revisión) y siembra sus 18 respuestas. Idempotente si el mismo supervisor
 * reingresa a la revisión en curso.
 */
export async function iniciarReinspeccion(input: {
  ticketId: string;
  conductor: string;
  fechaVencimientoISO: string;
}): Promise<{ ticketId: string; numeroRevision: number }> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    throw new Error("Solo un supervisor puede registrar re-inspecciones.");
  const supabase = await createClient();

  if (!input.conductor?.trim())
    throw new Error("Falta el conductor de esta revisión.");
  if (!input.fechaVencimientoISO)
    throw new Error("Falta la fecha de vencimiento de la corrección.");

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, revision_actual, supervisor_id")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket no encontrado.");

  // Puede venir desde "finalizada_con_observaciones" (o el legado
  // "en_reparacion_de_observaciones") en el primer ingreso, o ya estar
  // "en_revision" si el supervisor volvió a los datos y reingresó.
  const yaEnCurso = ticket.estado === "en_revision";
  if (!yaEnCurso && !puedeReinspeccionar(ticket.estado))
    throw new Error(
      "Solo se puede re-inspeccionar un ticket con observaciones pendientes.",
    );

  if (yaEnCurso) {
    // Otra persona no puede continuar una re-inspección que ya arrancó otro.
    const { data: revEnCurso } = await supabase
      .from("ticket_revisiones")
      .select("supervisor_id")
      .eq("ticket_id", input.ticketId)
      .eq("numero_revision", ticket.revision_actual)
      .maybeSingle();
    if (
      revEnCurso &&
      revEnCurso.supervisor_id !== perfil.id &&
      ticket.supervisor_id !== perfil.id
    )
      throw new Error(
        "Otro supervisor ya está realizando la re-inspección de este ticket.",
      );
  }

  const numeroRevision = yaEnCurso
    ? ticket.revision_actual
    : ticket.revision_actual + 1;
  const conductor = input.conductor.trim();

  await prepararRevision(supabase, {
    ticketId: input.ticketId,
    numeroRevision,
    supervisorId: perfil.id,
    conductor,
    fechaVencimientoISO: input.fechaVencimientoISO,
  });

  if (!yaEnCurso) {
    const { error } = await supabase
      .from("tickets")
      .update({
        estado: "en_revision",
        revision_actual: numeroRevision,
        // §3.1: nuevo ciclo de vencimiento → se rehabilita el aviso automático.
        alerta_naranja_enviada: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.ticketId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return { ticketId: input.ticketId, numeroRevision };
}

/**
 * §2.8: cierre de una re-inspección sobre datos ya guardados (§2.3). El
 * conductor y el vencimiento de esta revisión se fijaron en `iniciarReinspeccion`
 * y se copian a la cabecera del ticket (para la tabla resumen y el informe).
 */
export async function finalizarReinspeccion(input: {
  ticketId: string;
  revisionNumero: number;
}): Promise<{ ticketId: string }> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, supervisor_id")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket no encontrado.");
  if (ticket.estado !== "en_revision")
    throw new Error("Esta re-inspección ya fue finalizada.");

  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("conductor, fecha_vencimiento, supervisor_id")
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero)
    .maybeSingle();
  if (!rev) throw new Error("La revisión no está iniciada.");
  // §2.6: la finaliza quien la hizo (o el creador del ticket / un admin).
  if (ticket.supervisor_id !== perfil.id && rev.supervisor_id !== perfil.id)
    throw new Error(
      "Solo el supervisor a cargo de esta re-inspección puede finalizarla.",
    );

  const estado = await cerrarRevision(
    supabase,
    input.ticketId,
    input.revisionNumero,
  );

  const { error } = await supabase
    .from("tickets")
    .update({
      estado,
      revision_actual: input.revisionNumero,
      fecha_vencimiento: rev.fecha_vencimiento,
      conductor: rev.conductor ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ticketId);
  if (error) throw new Error(error.message);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return { ticketId: input.ticketId };
}
