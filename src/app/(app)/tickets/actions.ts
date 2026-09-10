"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSesion } from "@/lib/auth";
import {
  estadoTrasChecklist,
  puedeReinspeccionar,
} from "@/lib/ticket-state-machine";
import { ORDEN_TIPOS_INSPECCION } from "@/lib/tipos";
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
  // Fase "tipos de inspección" — parte 2/4. Obligatorio: el combo del
  // formulario siempre manda uno de los 4 valores de tipos_inspeccion.
  tipoInspeccion: string;
  // Campos condicionales por tipo — ver validarCamposPorTipo() más abajo.
  nombreEncarpador?: string | null;
  nombreGuardia?: string | null;
  nroContenedor?: string | null;
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
 * Campos de cabecera que solo aplican a algunos tipos de inspección — parte
 * 2/4 de "tipos de inspección con checklist propio". El combo del cliente ya
 * los deshabilita/oculta según corresponda, pero esto es la validación real
 * (nunca confiar solo en el cliente, mismo criterio que validarCabecera).
 */
function validarCamposPorTipo(
  tipo: string,
  campos: {
    nombreEncarpador?: string | null;
    nombreGuardia?: string | null;
    nroContenedor?: string | null;
  },
) {
  if (tipo === "control_salida") {
    if (!campos.nombreEncarpador?.trim())
      throw new Error('Falta el "Nombre Encarpador".');
    if (!campos.nombreGuardia?.trim())
      throw new Error('Falta el "Nombre Guardia".');
  }
  if (tipo === "exportacion_chimolsa") {
    if (!campos.nroContenedor?.trim())
      throw new Error('Falta el "Nro de Contenedor".');
  }
}

/**
 * Deja lista una revisión para que se pueda ir guardando por partes (§2.8):
 * garantiza la fila en `ticket_revisiones` (es el padre FK de las respuestas) y
 * siembra las respuestas del checklist DEL TIPO de esta inspección — así los
 * ítems que el supervisor no toca igual quedan registrados y "Finalizar
 * revisión" solo tiene que cerrar sobre datos ya guardados. Es idempotente: si
 * el supervisor vuelve atrás y reingresa, no pisa lo ya marcado.
 *
 * Los ítems de modo 'fotos' se siembran con `estado = null` — no tienen
 * Conforme/No conforme/No aplica (§7 de la fase, el estado resultante de esas
 * inspecciones lo define la observación general, no un estado por ítem).
 */
async function prepararRevision(
  supabase: SupabaseServer,
  opts: {
    ticketId: string;
    numeroRevision: number;
    supervisorId: string;
    conductor: string;
    fechaVencimientoISO: string;
    tipoInspeccion: string;
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

  const { data: items } = await supabase
    .from("checklist_items")
    .select("key, modo")
    .eq("tipo", opts.tipoInspeccion);
  const filas = (items ?? []).map((i) => ({
    ticket_id: opts.ticketId,
    revision_numero: opts.numeroRevision,
    item_key: i.key,
    estado: i.modo === "fotos" ? null : ("conforme" as const),
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
 * Verifica que la revisión tenga todas las respuestas del checklist de SU
 * TIPO guardadas (§2.8: se fueron guardando por ítem) y ambas firmas, calcula
 * el estado resultante y lo escribe en `ticket_revisiones.estado_resultante`.
 * Devuelve el estado para que el llamador actualice el ticket. NO inserta
 * respuestas: solo cierra sobre lo ya guardado.
 *
 * Validación por modo de ítem: modo 'estado' exige observación+foto si quedó
 * no_conforme (como siempre); modo 'fotos' exige 2 fotos en
 * ticket_checklist_fotos (no en foto_url — esa columna solo espeja la
 * primera, ver guardarFotoChecklistItem).
 *
 * Estado resultante: si el checklist de este tipo es TODO modo 'fotos' (hoy,
 * únicamente exportacion_chimolsa — §7 de la fase), lo define si hay texto en
 * la observación general (cualquier respuesta, todas comparten el mismo
 * texto — ver guardarObservacionGeneral). Si no, la regla de siempre
 * (no_conforme en algún ítem).
 */
async function cerrarRevision(
  supabase: SupabaseServer,
  ticketId: string,
  numeroRevision: number,
  tipoInspeccion: string,
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

  const { data: items } = await supabase
    .from("checklist_items")
    .select("key, modo")
    .eq("tipo", tipoInspeccion);
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("id, item_key, estado, observacion, foto_url")
    .eq("ticket_id", ticketId)
    .eq("revision_numero", numeroRevision);

  const claves = (items ?? []).map((i) => i.key);
  const modoPorKey = new Map((items ?? []).map((i) => [i.key, i.modo]));
  const guardadas = respuestas ?? [];
  const respondidas = new Set(guardadas.map((r) => r.item_key));
  const faltan = claves.filter((k) => !respondidas.has(k));
  if (claves.length === 0 || faltan.length > 0)
    throw new Error(
      `Quedan ${
        faltan.length || claves.length
      } elemento(s) del checklist por completar (marcarlos, y adjuntar la foto en los no conformes).`,
    );

  const idsRespuestasFotos = guardadas
    .filter((r) => modoPorKey.get(r.item_key) === "fotos")
    .map((r) => r.id);
  const cantidadFotosPorRespuesta = new Map<string, number>();
  if (idsRespuestasFotos.length > 0) {
    const { data: fotos } = await supabase
      .from("ticket_checklist_fotos")
      .select("respuesta_id")
      .in("respuesta_id", idsRespuestasFotos);
    for (const f of fotos ?? []) {
      cantidadFotosPorRespuesta.set(
        f.respuesta_id,
        (cantidadFotosPorRespuesta.get(f.respuesta_id) ?? 0) + 1,
      );
    }
  }

  for (const r of guardadas) {
    const modo = modoPorKey.get(r.item_key);
    if (modo === "fotos") {
      if ((cantidadFotosPorRespuesta.get(r.id) ?? 0) < 2)
        throw new Error(
          "Faltan fotos en algún elemento del checklist (se requieren 2 por ítem).",
        );
    } else if (r.estado === "no_conforme" && (!r.observacion?.trim() || !r.foto_url)) {
      throw new Error("Hay un elemento no conforme sin observación o sin foto.");
    }
  }

  const esSoloFotos = claves.length > 0 && claves.every((k) => modoPorKey.get(k) === "fotos");
  const estado: TicketEstado = esSoloFotos
    ? guardadas.some((r) => (r.observacion ?? "").trim() !== "")
      ? "finalizada_con_observaciones"
      : "finalizada_sin_observaciones"
    : estadoTrasChecklist(guardadas.some((r) => r.estado === "no_conforme"));

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
 * También deja lista la revisión #1 (fila en `ticket_revisiones` + las
 * respuestas del tipo elegido sembradas) para poder guardar por ítem. El
 * ticket nace en `en_revision` (§2.3). Es un upsert idempotente: si el
 * supervisor vuelve atrás, edita la cabecera y avanza de nuevo, actualiza la
 * misma fila sin perder lo ya marcado. La unicidad de `numero_inspeccion`
 * entre inspectores simultáneos la garantiza el `generated always as
 * identity` de Postgres.
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
  if (!input.tipoInspeccion)
    throw new Error("Falta el tipo de inspección.");
  if (!(ORDEN_TIPOS_INSPECCION as readonly string[]).includes(input.tipoInspeccion))
    throw new Error("Tipo de inspección inválido.");
  validarCamposPorTipo(input.tipoInspeccion, input);

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
        tipo_inspeccion: input.tipoInspeccion,
        nombre_encarpador: input.nombreEncarpador?.trim() || null,
        nombre_guardia: input.nombreGuardia?.trim() || null,
        nro_contenedor: input.nroContenedor?.trim() || null,
        // §3.1/§3.2: ciclo de vencimiento nuevo → aún no se avisó (WhatsApp al
        // supervisor y correos automáticos a administradores en 48h/24h/vencido).
        alerta_naranja_enviada: false,
        alerta_admin_48h_enviada: false,
        alerta_admin_24h_enviada: false,
        alerta_admin_vencido_enviada: false,
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
    tipoInspeccion: input.tipoInspeccion,
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
 *
 * Solo para ítems de modo 'estado' — los de modo 'fotos' usan
 * `guardarFotoChecklistItem` y `guardarObservacionGeneral`, no esta función.
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
 * Fase "tipos de inspección" — parte 2/4. Guarda (o quita) UNA de las dos
 * fotos obligatorias de un ítem de modo 'fotos' — orden 1 o 2 en
 * `ticket_checklist_fotos` (unique(respuesta_id, orden): el orden se manda
 * siempre explícito, nunca se confía en el default). `foto_url` en
 * `ticket_checklist_respuestas` se mantiene en espejo con la foto de orden 1
 * — el trigger `chk_foto_obligatoria_si_no_conforme` (BEFORE INSERT/UPDATE
 * sobre esa tabla) sigue validando contra esa columna vieja; para no
 * romperlo, este PR escribe las dos cosas. `estado` de la respuesta NO se
 * toca acá — queda en `null` (sembrado por prepararRevision), un ítem de
 * modo 'fotos' nunca tiene Conforme/No conforme/No aplica.
 *
 * Deuda técnica (no se resuelve en este PR): `chk_foto_obligatoria_si_no_conforme`
 * debería pasar a `AFTER ... DEFERRABLE INITIALLY DEFERRED` cuando se elimine
 * `foto_url` — una validación que depende de filas hijas (`ticket_checklist_fotos`)
 * no puede vivir en un BEFORE INSERT sobre el padre, porque esas filas
 * todavía no existen en ese momento. Misma forma del problema de las
 * migraciones 21/22 (INSERT ... RETURNING sobre una fila que la propia
 * política/trigger todavía no ve).
 */
export async function guardarFotoChecklistItem(input: {
  ticketId: string;
  revisionNumero: number;
  itemKey: string;
  orden: 1 | 2;
  /** null = quitar esa foto. */
  path: string | null;
}): Promise<{ guardado: boolean }> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );

  const { data: respuesta, error: errResp } = await supabase
    .from("ticket_checklist_respuestas")
    .select("id")
    .eq("ticket_id", input.ticketId)
    .eq("revision_numero", input.revisionNumero)
    .eq("item_key", input.itemKey)
    .maybeSingle();
  if (errResp || !respuesta)
    throw new Error(
      "No se encontró la respuesta de este ítem. Volver a 'Datos de Inspección' y presionar 'Realizar revisión'.",
    );

  if (input.path === null) {
    const { error } = await supabase
      .from("ticket_checklist_fotos")
      .delete()
      .eq("respuesta_id", respuesta.id)
      .eq("orden", input.orden);
    if (error) throw new Error(`No se pudo quitar la foto: ${error.message}`);
  } else {
    const { error } = await supabase.from("ticket_checklist_fotos").upsert(
      { respuesta_id: respuesta.id, orden: input.orden, url: input.path },
      { onConflict: "respuesta_id,orden" },
    );
    if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
  }

  const { data: primera } = await supabase
    .from("ticket_checklist_fotos")
    .select("url")
    .eq("respuesta_id", respuesta.id)
    .eq("orden", 1)
    .maybeSingle();
  const { error: errFotoUrl } = await supabase
    .from("ticket_checklist_respuestas")
    .update({ foto_url: primera?.url ?? null })
    .eq("id", respuesta.id);
  if (errFotoUrl)
    throw new Error(`No se pudo actualizar la respuesta: ${errFotoUrl.message}`);

  return { guardado: true };
}

/**
 * Fase "tipos de inspección" — parte 2/4, §7. Para checklists TODO modo
 * 'fotos' (hoy, exportacion_chimolsa) no hay una observación por ítem — hay
 * UNA sola para toda la revisión, que además define el estado resultante al
 * cerrar (cerrarRevision). Se guarda en `ticket_checklist_respuestas.observacion`
 * de LOS 4 ítems de la revisión (reutiliza la columna existente, no agrega
 * ninguna nueva) — el llamador (InspeccionForm) solo invoca esto cuando el
 * checklist actual es todo modo 'fotos'.
 */
export async function guardarObservacionGeneral(input: {
  ticketId: string;
  revisionNumero: number;
  texto: string;
}): Promise<{ guardado: boolean }> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );

  const { error } = await supabase
    .from("ticket_checklist_respuestas")
    .update({ observacion: input.texto.trim() || null })
    .eq("ticket_id", input.ticketId)
    .eq("revision_numero", input.revisionNumero);
  if (error)
    throw new Error(`No se pudo guardar la observación: ${error.message}`);
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
    .select("estado, supervisor_id, numero_inspeccion, tipo_inspeccion")
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
  if (!ticket.tipo_inspeccion)
    throw new Error("Falta el tipo de inspección del ticket.");

  const estado = await cerrarRevision(
    supabase,
    input.ticketId,
    1,
    ticket.tipo_inspeccion,
  );

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
 * ESTA revisión) y siembra sus respuestas. Idempotente si el mismo supervisor
 * reingresa a la revisión en curso.
 *
 * El tipo de inspección NO se vuelve a pedir — es fijo desde que se creó el
 * ticket (`tickets.tipo_inspeccion`), se re-lee de ahí.
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
    .select("estado, revision_actual, supervisor_id, tipo_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket no encontrado.");
  if (!ticket.tipo_inspeccion)
    throw new Error("Falta el tipo de inspección del ticket.");

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
    tipoInspeccion: ticket.tipo_inspeccion,
  });

  if (!yaEnCurso) {
    const { error } = await supabase
      .from("tickets")
      .update({
        estado: "en_revision",
        revision_actual: numeroRevision,
        // §3.1/§3.2: nuevo ciclo de vencimiento → se rehabilitan todos los avisos
        // automáticos (WhatsApp al supervisor y correos a administradores).
        alerta_naranja_enviada: false,
        alerta_admin_48h_enviada: false,
        alerta_admin_24h_enviada: false,
        alerta_admin_vencido_enviada: false,
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
    .select("estado, supervisor_id, tipo_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket no encontrado.");
  if (ticket.estado !== "en_revision")
    throw new Error("Esta re-inspección ya fue finalizada.");
  if (!ticket.tipo_inspeccion)
    throw new Error("Falta el tipo de inspección del ticket.");

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
    ticket.tipo_inspeccion,
  );

  const cambios = {
    estado,
    revision_actual: input.revisionNumero,
    fecha_vencimiento: rev.fecha_vencimiento,
    conductor: rev.conductor ?? undefined,
    updated_at: new Date().toISOString(),
  };
  // §2.6: la RLS de `update` en `tickets` ya permite cerrar la re-inspección de
  // un ticket ajeno "con observaciones" al supervisor que la está haciendo
  // (private.hizo_revision(id) en USING/WITH CHECK, y también en la policy de
  // `select` para que Postgres no rechace la fila resultante). No hace falta el
  // cliente de servicio para este flujo.
  const { error: errFinal } = await supabase
    .from("tickets")
    .update(cambios)
    .eq("id", input.ticketId);
  if (errFinal) throw new Error(errFinal.message);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return { ticketId: input.ticketId };
}
