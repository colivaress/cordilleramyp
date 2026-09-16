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
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";
import { firmarRutas } from "@/lib/storage";
import { normalizarPatente } from "@/lib/patentes";
import { nombreCompleto } from "@/lib/mensajes";

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

function validarCabecera(c: CabeceraInput): ResultadoAccion {
  for (const [k, v] of Object.entries(c)) {
    if (!String(v ?? "").trim())
      return { ok: false, mensaje: `Falta el dato de inspección "${k}".` };
  }
  return { ok: true };
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
): ResultadoAccion {
  if (tipo === "control_salida") {
    if (!campos.nombreEncarpador?.trim())
      return { ok: false, mensaje: 'Falta el "Nombre Encarpador".' };
    if (!campos.nombreGuardia?.trim())
      return { ok: false, mensaje: 'Falta el "Nombre Guardia".' };
  }
  if (tipo === "exportacion_chimolsa") {
    if (!campos.nroContenedor?.trim())
      return { ok: false, mensaje: 'Falta el "Nro de Contenedor".' };
  }
  return { ok: true };
}

/**
 * Deja lista una revisión para que se pueda ir guardando por partes (§2.8):
 * garantiza la fila en `ticket_revisiones` (es el padre FK de las respuestas) y
 * siembra las FILAS del checklist DEL TIPO de esta inspección — así hay algo
 * que actualizar por ítem apenas el supervisor lo marca, y "Finalizar
 * revisión" solo tiene que cerrar sobre datos ya guardados. Es idempotente
 * (`ignoreDuplicates`): si el supervisor vuelve atrás y reingresa, no pisa lo
 * ya marcado.
 *
 * Todas las filas se siembran con `estado = null` — ítems de modo 'fotos'
 * (nunca tienen Conforme/No conforme/No aplica, §7 de la fase) y también
 * ítems de modo 'estado' (§2.7: sin valor preseleccionado — el supervisor
 * elige. Antes se sembraban en "conforme": si no tocaba nada, el informe
 * salía afirmando que todo estaba conforme sin que nadie lo hubiera
 * revisado. `cerrarRevision` exige que todo ítem modo 'estado' tenga un
 * `estado` real antes de poder cerrar — ver ahí).
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
): Promise<ResultadoAccion> {
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
    if (error) return errorInesperado("prepararRevision.update", error);
  } else {
    const { error } = await supabase.from("ticket_revisiones").insert({
      ticket_id: opts.ticketId,
      numero_revision: opts.numeroRevision,
      estado_resultante: "en_revision",
      supervisor_id: opts.supervisorId,
      conductor: opts.conductor,
      fecha_vencimiento: opts.fechaVencimientoISO,
    });
    if (error) return errorInesperado("prepararRevision.insert", error);
  }

  const { data: items } = await supabase
    .from("checklist_items")
    .select("key, modo")
    .eq("tipo", opts.tipoInspeccion);
  const filas = (items ?? []).map((i) => ({
    ticket_id: opts.ticketId,
    revision_numero: opts.numeroRevision,
    item_key: i.key,
    estado: null,
  }));
  if (filas.length > 0) {
    const { error } = await supabase
      .from("ticket_checklist_respuestas")
      .upsert(filas, {
        onConflict: "ticket_id,revision_numero,item_key",
        ignoreDuplicates: true,
      });
    if (error) return errorInesperado("prepararRevision.upsertRespuestas", error);
  }
  return { ok: true };
}

/**
 * Verifica que la revisión tenga todas las respuestas del checklist de SU
 * TIPO guardadas (§2.8: se fueron guardando por ítem) y ambas firmas, calcula
 * el estado resultante y lo escribe en `ticket_revisiones.estado_resultante`.
 * Devuelve el estado para que el llamador actualice el ticket. NO inserta
 * respuestas: solo cierra sobre lo ya guardado.
 *
 * Validación por modo de ítem: modo 'estado' exige un `estado` real (§2.7 —
 * ya no hay valor preseleccionado, un ítem sin responder tiene `estado =
 * null`) y observación+foto si quedó no_conforme (como siempre); modo
 * 'fotos' exige checklist_items.fotos_requeridas fotos en
 * ticket_checklist_fotos (no en foto_url — esa columna solo espeja la
 * primera, ver guardarFotoChecklistItem) — la cantidad varía por ítem, no es
 * una constante.
 *
 * 🔴 Esta es la regla que hace que quitar el valor preseleccionado valga la
 * pena: sin ella, un ítem sin responder simplemente queda con `estado = null`
 * para siempre y el informe termina con huecos silenciosos — peor que el
 * problema original (que al menos afirmaba algo de forma pareja, aunque
 * fuera falso). No basta con que el cliente lo valide: esto se re-verifica
 * acá porque es el único punto por el que TODOS los caminos para cerrar una
 * revisión pasan (InspeccionForm y BotonFinalizarPendiente).
 *
 * Estado resultante: si el checklist de este tipo es TODO modo 'fotos' (hoy,
 * únicamente exportacion_chimolsa — §7 de la fase), lo define si hay texto en
 * `ticket_revisiones.observacion_general` (ver guardarObservacionGeneral). Si
 * no, la regla de siempre (no_conforme en algún ítem).
 *
 * IMPORTANTE — esta asimetría es intencional, no un descuido: para los otros
 * 3 tipos (Encarpe, Desencarpe, Control de Salida) `observacion_general` es
 * SOLO una nota libre — nunca debe influir en el estado resultante. Si
 * alguien "generaliza" esto para que cualquier tipo con observación general
 * quede `finalizada_con_observaciones`, rompe la regla de negocio: un
 * supervisor podría convertir una inspección impecable en "con
 * observaciones" (y disparar el ciclo de alertas de vencimiento) solo por
 * anotar algo como "el conductor llegó atrasado". Para Chimolsa, en cambio,
 * el textarea es el ÚNICO canal para señalar un problema (no hay
 * Conforme/No conforme por ítem), así que ahí sí debe pesar.
 */
async function cerrarRevision(
  supabase: SupabaseServer,
  ticketId: string,
  numeroRevision: number,
  tipoInspeccion: string,
): Promise<ResultadoAccion<{ estado: TicketEstado }>> {
  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("id, firma_conductor_url, firma_fiscalizador_url, observacion_general")
    .eq("ticket_id", ticketId)
    .eq("numero_revision", numeroRevision)
    .maybeSingle();
  if (!rev)
    return {
      ok: false,
      mensaje:
        "La revisión no está iniciada. Volver a los datos y presionar 'Realizar revisión'.",
    };
  if (!rev.firma_conductor_url || !rev.firma_fiscalizador_url)
    return {
      ok: false,
      mensaje: "Faltan las firmas del conductor y/o del fiscalizador.",
    };

  const { data: items } = await supabase
    .from("checklist_items")
    .select("key, modo, fotos_requeridas")
    .eq("tipo", tipoInspeccion);
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("id, item_key, estado, observacion, foto_url")
    .eq("ticket_id", ticketId)
    .eq("revision_numero", numeroRevision);

  const claves = (items ?? []).map((i) => i.key);
  const modoPorKey = new Map((items ?? []).map((i) => [i.key, i.modo]));
  const fotosRequeridasPorKey = new Map(
    (items ?? []).map((i) => [i.key, i.fotos_requeridas ?? 0]),
  );
  const guardadas = respuestas ?? [];
  // "Pendiente" = no hay fila todavía, O la hay pero (ítem modo 'estado')
  // `estado` sigue en null — un ítem nunca respondido y uno con fila sembrada
  // pero sin tocar (§2.7) son el mismo caso para este chequeo.
  const respondidas = new Set(
    guardadas
      .filter((r) => modoPorKey.get(r.item_key) === "fotos" || r.estado != null)
      .map((r) => r.item_key),
  );
  const faltan = claves.filter((k) => !respondidas.has(k));
  if (claves.length === 0 || faltan.length > 0)
    return {
      ok: false,
      mensaje: `Quedan ${
        faltan.length || claves.length
      } elemento(s) del checklist por completar (marcarlos, y adjuntar la foto en los no conformes).`,
    };

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
      const requeridas = fotosRequeridasPorKey.get(r.item_key) ?? 0;
      if ((cantidadFotosPorRespuesta.get(r.id) ?? 0) < requeridas)
        return {
          ok: false,
          mensaje: "Faltan fotos en algún elemento del checklist.",
        };
    } else if (r.estado === "no_conforme" && (!r.observacion?.trim() || !r.foto_url)) {
      return {
        ok: false,
        mensaje: "Hay un elemento no conforme sin observación o sin foto.",
      };
    }
  }

  const esSoloFotos = claves.length > 0 && claves.every((k) => modoPorKey.get(k) === "fotos");
  const estado: TicketEstado = esSoloFotos
    ? (rev.observacion_general ?? "").trim() !== ""
      ? "finalizada_con_observaciones"
      : "finalizada_sin_observaciones"
    : estadoTrasChecklist(guardadas.some((r) => r.estado === "no_conforme"));

  const { error } = await supabase
    .from("ticket_revisiones")
    .update({ estado_resultante: estado })
    .eq("id", rev.id);
  if (error) return errorInesperado("cerrarRevision.update", error);
  return { ok: true, estado };
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
): Promise<ResultadoAccion<InspeccionResultado>> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    return { ok: false, mensaje: "Solo un supervisor puede crear inspecciones." };
  const supabase = await createClient();

  // Normaliza ANTES de validar "no vacío" (un valor de solo espacios tiene
  // que fallar la validación tras normalizar, no colarse como "" vacío) y
  // antes del upsert de más abajo, que hace spread de `input.cabecera` tal
  // cual — así la fila que se guarda ya queda con el valor normalizado, sin
  // un segundo paso. Única fuente de la regla: `normalizarPatente` (src/lib).
  input.cabecera.patente_camion = normalizarPatente(input.cabecera.patente_camion);
  input.cabecera.patente_rampla = normalizarPatente(input.cabecera.patente_rampla);

  const valCabecera = validarCabecera(input.cabecera);
  if (!valCabecera.ok) return valCabecera;
  if (!input.fechaVencimientoISO)
    return { ok: false, mensaje: "Falta la fecha de vencimiento de la corrección." };
  if (!input.tipoInspeccion)
    return { ok: false, mensaje: "Falta el tipo de inspección." };
  if (!(ORDEN_TIPOS_INSPECCION as readonly string[]).includes(input.tipoInspeccion))
    return { ok: false, mensaje: "Tipo de inspección inválido." };
  const valCampos = validarCamposPorTipo(input.tipoInspeccion, input);
  if (!valCampos.ok) return valCampos;

  // Fase "tipos de inspección" — parte 4/4: mensaje amigable ANTES del
  // INSERT, respaldado por la política RLS de tickets_insert (que rechazaría
  // igual, pero con un error crudo de Postgres). Sin ninguna fila en
  // personal_tipos_inspeccion, el supervisor no tiene permiso para NINGÚN
  // tipo — no es "sin restricción" (la pantalla de "Nueva inspección" ya
  // filtra el combo a los tipos permitidos, así que llegar acá sin permiso
  // solo pasa si algo bypasea la UI).
  const { data: permitidos } = await supabase
    .from("personal_tipos_inspeccion")
    .select("tipo_inspeccion")
    .eq("personal_id", perfil.id);
  const clavesPermitidas = new Set((permitidos ?? []).map((p) => p.tipo_inspeccion));
  if (!clavesPermitidas.has(input.tipoInspeccion))
    return {
      ok: false,
      mensaje:
        "No tenés permiso para realizar este tipo de inspección. Pedile a un administrador que te lo asigne en Usuarios.",
    };

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
  if (error || !data) return errorInesperado("iniciarInspeccion.upsert", error);

  const prep = await prepararRevision(supabase, {
    ticketId: input.ticketId,
    numeroRevision: 1,
    supervisorId: perfil.id,
    conductor: input.cabecera.conductor,
    fechaVencimientoISO: input.fechaVencimientoISO,
    tipoInspeccion: input.tipoInspeccion,
  });
  if (!prep.ok) return prep;

  revalidatePath("/dashboard");
  return {
    ok: true,
    ticketId: input.ticketId,
    numeroInspeccion: data.numero_inspeccion,
  };
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
): Promise<ResultadoAccion> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("supervisor_id, estado")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { ok: false, mensaje: "No se encontró la inspección." };
  if (ticket.estado !== "en_revision")
    return { ok: false, mensaje: "La revisión ya fue finalizada." };
  if (ticket.supervisor_id === perfilId) return { ok: true };

  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("supervisor_id")
    .eq("ticket_id", ticketId)
    .eq("numero_revision", revisionNumero)
    .maybeSingle();
  if (rev?.supervisor_id === perfilId) return { ok: true };

  return {
    ok: false,
    mensaje: "Solo el supervisor a cargo de esta revisión puede editarla.",
  };
}

export type ItemHidratado = {
  itemKey: string;
  estado: ItemEstado | null;
  observacion: string;
  fotoPath: string | null;
  /** URL firmada — la foto ya sube a Storage apenas se toma (§2.8); esto es
   *  solo para poder mostrar la vista previa de nuevo tras recargar. */
  fotoUrlFirmada: string | null;
  /** Solo modo 'fotos'. Una entrada por foto ya guardada (orden 1..N). */
  fotos: { orden: number; path: string; urlFirmada: string | null }[];
};

export type EstadoRevisionHidratado = {
  tipoInspeccion: string;
  numeroInspeccion: number;
  /** Cabecera del TICKET — solo la usa el modo "nueva" al recuperar una
   *  sesión (en reinspección, la cabecera ya llega por props del servidor,
   *  §2.14, así que esto queda de más ahí pero no molesta traerlo igual). Sin
   *  esto, "Volver a los datos" tras recuperar una sesión mostraría el paso 1
   *  en blanco — y volver a enviarlo pisaría con blancos la cabecera real
   *  del ticket (mismo upsert que lo creó).
   */
  cabecera: CabeceraInput;
  nombreEncarpador: string | null;
  nombreGuardia: string | null;
  nroContenedor: string | null;
  conductorRevision: string;
  fechaVencimientoRevision: string | null;
  items: ItemHidratado[];
  observacionGeneral: string;
  firmaConductorUrl: string | null;
  firmaFiscalizadorUrl: string | null;
};

/**
 * Recupera todo lo que ya se guardó de una revisión EN CURSO — checklist,
 * observación general y firmas — para poder reconstruir el formulario tal
 * como estaba si la página se recarga a mitad de camino (el celular se
 * queda sin batería, Safari mata la pestaña en segundo plano, el supervisor
 * la recarga a mano porque algo dejó de responder). Sin esto, recargar
 * significa perder de vista todo lo ya guardado del lado del servidor —
 * "perder de vista", no "perder": los datos siguen en la base, pero el
 * formulario los vuelve a mostrar en blanco y el supervisor no tiene forma
 * de saber que su ticket ya existe con progreso real.
 *
 * Se apoya en `autorizarRevisionEnCurso` para el mismo criterio de acceso
 * (dueño del ticket o de la revisión, y solo si sigue `en_revision`) — si
 * el ticket no existe todavía (nunca se llegó a crear) o ya se cerró,
 * devuelve `ok: false` y el llamador simplemente no hidrata nada; no es un
 * error que el supervisor deba ver, es la señal de "no hay nada que
 * recuperar acá".
 */
export async function obtenerEstadoRevision(input: {
  ticketId: string;
  revisionNumero: number;
}): Promise<ResultadoAccion<EstadoRevisionHidratado>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  const auth = await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );
  if (!auth.ok) return auth;

  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "tipo_inspeccion, numero_inspeccion, transporte, conductor, fecha, procedencia, tipo_camion, patente_camion, patente_rampla, nombre_encarpador, nombre_guardia, nro_contenedor",
    )
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket?.tipo_inspeccion)
    return { ok: false, mensaje: "Falta el tipo de inspección del ticket." };

  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select(
      "conductor, fecha_vencimiento, observacion_general, firma_conductor_url, firma_fiscalizador_url",
    )
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero)
    .maybeSingle();

  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select(
      "item_key, estado, observacion, foto_url, fotos:ticket_checklist_fotos(url, orden)",
    )
    .eq("ticket_id", input.ticketId)
    .eq("revision_numero", input.revisionNumero);

  const rutasAFirmar = [
    ...(respuestas ?? []).map((r) => r.foto_url),
    ...(respuestas ?? []).flatMap((r) => (r.fotos ?? []).map((f) => f.url)),
  ];
  const urlFotos = await firmarRutas(supabase, "fallas", rutasAFirmar);
  const urlFirmas = await firmarRutas(supabase, "firmas", [
    rev?.firma_conductor_url,
    rev?.firma_fiscalizador_url,
  ]);

  const items: ItemHidratado[] = (respuestas ?? []).map((r) => ({
    itemKey: r.item_key,
    estado: r.estado,
    observacion: r.observacion ?? "",
    fotoPath: r.foto_url,
    fotoUrlFirmada: r.foto_url ? (urlFotos[r.foto_url] ?? null) : null,
    fotos: (r.fotos ?? [])
      .filter((f): f is { url: string; orden: number } => !!f.url)
      .map((f) => ({
        orden: f.orden,
        path: f.url,
        urlFirmada: urlFotos[f.url] ?? null,
      })),
  }));

  return {
    ok: true,
    tipoInspeccion: ticket.tipo_inspeccion,
    numeroInspeccion: ticket.numero_inspeccion,
    cabecera: {
      transporte: ticket.transporte,
      conductor: ticket.conductor,
      fecha: ticket.fecha,
      procedencia: ticket.procedencia,
      tipo_camion: ticket.tipo_camion,
      patente_camion: ticket.patente_camion,
      patente_rampla: ticket.patente_rampla,
    },
    nombreEncarpador: ticket.nombre_encarpador,
    nombreGuardia: ticket.nombre_guardia,
    nroContenedor: ticket.nro_contenedor,
    conductorRevision: rev?.conductor ?? ticket.conductor,
    fechaVencimientoRevision: rev?.fecha_vencimiento ?? null,
    items,
    observacionGeneral: rev?.observacion_general ?? "",
    firmaConductorUrl: rev?.firma_conductor_url
      ? (urlFirmas[rev.firma_conductor_url] ?? null)
      : null,
    firmaFiscalizadorUrl: rev?.firma_fiscalizador_url
      ? (urlFirmas[rev.firma_fiscalizador_url] ?? null)
      : null,
  };
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
): Promise<ResultadoAccion<{ guardado: boolean }>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  const auth = await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );
  if (!auth.ok) return auth;

  const esNoConforme = input.estado === "no_conforme";

  if (esNoConforme && !input.fotoPath) {
    const { error } = await supabase
      .from("ticket_checklist_respuestas")
      .delete()
      .eq("ticket_id", input.ticketId)
      .eq("revision_numero", input.revisionNumero)
      .eq("item_key", input.itemKey);
    if (error) return errorInesperado("guardarRespuestaItem.delete", error);
    return { ok: true, guardado: false };
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
  if (error) return errorInesperado("guardarRespuestaItem.upsert", error);
  return { ok: true, guardado: true };
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
 * política/trigger todavía no ve) — ver también src/lib/resultado-accion.ts,
 * que documenta el otro síntoma que dejó ese mismo incidente.
 */
export async function guardarFotoChecklistItem(input: {
  ticketId: string;
  revisionNumero: number;
  itemKey: string;
  /** Explícito siempre (1..checklist_items.fotos_requeridas del ítem) — el
   *  default de la columna (1) no alcanza para la segunda foto y siguientes,
   *  por el unique(respuesta_id, orden). */
  orden: number;
  /** null = quitar esa foto. */
  path: string | null;
}): Promise<ResultadoAccion<{ guardado: boolean }>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  const auth = await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );
  if (!auth.ok) return auth;

  const { data: respuesta, error: errResp } = await supabase
    .from("ticket_checklist_respuestas")
    .select("id")
    .eq("ticket_id", input.ticketId)
    .eq("revision_numero", input.revisionNumero)
    .eq("item_key", input.itemKey)
    .maybeSingle();
  if (errResp || !respuesta)
    return {
      ok: false,
      mensaje:
        "No se encontró la respuesta de este ítem. Volver a 'Datos de Inspección' y presionar 'Realizar revisión'.",
    };

  if (input.path === null) {
    const { error } = await supabase
      .from("ticket_checklist_fotos")
      .delete()
      .eq("respuesta_id", respuesta.id)
      .eq("orden", input.orden);
    if (error) return errorInesperado("guardarFotoChecklistItem.delete", error);
  } else {
    const { error } = await supabase.from("ticket_checklist_fotos").upsert(
      { respuesta_id: respuesta.id, orden: input.orden, url: input.path },
      { onConflict: "respuesta_id,orden" },
    );
    if (error) return errorInesperado("guardarFotoChecklistItem.upsert", error);
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
    return errorInesperado("guardarFotoChecklistItem.updateFotoUrl", errFotoUrl);

  return { ok: true, guardado: true };
}

/**
 * Observación general de la revisión — un textarea siempre visible, uno por
 * inspección (no por ítem), opcional, para los 4 tipos de inspección. Vive en
 * `ticket_revisiones.observacion_general`, una columna propia por revisión
 * (nace vacía en cada revisión nueva, igual que las respuestas por ítem — ver
 * prepararRevision). Se guarda debounced apenas se escribe, igual que el
 * resto de §2.8.
 *
 * NO confundir con la observación por ítem (`ticket_checklist_respuestas.observacion`,
 * solo visible cuando un ítem queda `no_conforme`) — son campos y propósitos
 * distintos. Este es para lo que no encaja en ningún ítem del checklist.
 *
 * Su efecto sobre el estado resultante de la revisión es asimétrico entre
 * tipos — ver el comentario en cerrarRevision, no lo repitas acá.
 */
export async function guardarObservacionGeneral(input: {
  ticketId: string;
  revisionNumero: number;
  texto: string;
}): Promise<ResultadoAccion<{ guardado: boolean }>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  const auth = await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );
  if (!auth.ok) return auth;

  const { error } = await supabase
    .from("ticket_revisiones")
    .update({ observacion_general: input.texto.trim() || null })
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero);
  if (error) return errorInesperado("guardarObservacionGeneral.update", error);
  return { ok: true, guardado: true };
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
}): Promise<ResultadoAccion> {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  const auth = await autorizarRevisionEnCurso(
    supabase,
    perfil.id,
    input.ticketId,
    input.revisionNumero,
  );
  if (!auth.ok) return auth;

  const cambio =
    input.quien === "conductor"
      ? { firma_conductor_url: input.path }
      : { firma_fiscalizador_url: input.path };
  const { error } = await supabase
    .from("ticket_revisiones")
    .update(cambio)
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero);
  if (error) return errorInesperado("guardarFirmaRevision.update", error);
  return { ok: true };
}

/**
 * §2.8: "Finalizar revisión" pasa a ser SOLO el cierre — calcula el estado
 * resultante y actualiza el ticket sobre datos que ya están guardados (las
 * respuestas por ítem y las firmas se fueron guardando antes). Una falla acá ya
 * no borra el trabajo del checklist. Idempotente/retryable.
 */
export async function finalizarInspeccion(input: {
  ticketId: string;
}): Promise<ResultadoAccion<InspeccionResultado>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, supervisor_id, numero_inspeccion, tipo_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket)
    return {
      ok: false,
      mensaje:
        "No se encontró la inspección iniciada. Volver a 'Datos de Inspección' y presionar 'Realizar revisión'.",
    };
  if (ticket.supervisor_id !== perfil.id)
    return {
      ok: false,
      mensaje: "Solo el supervisor a cargo puede finalizar la inspección.",
    };
  if (ticket.estado !== "en_revision")
    return { ok: false, mensaje: "Esta inspección ya fue finalizada." };
  if (!ticket.tipo_inspeccion)
    return { ok: false, mensaje: "Falta el tipo de inspección del ticket." };

  const cierre = await cerrarRevision(
    supabase,
    input.ticketId,
    1,
    ticket.tipo_inspeccion,
  );
  if (!cierre.ok) return cierre;

  const { error: eUpd } = await supabase
    .from("tickets")
    .update({ estado: cierre.estado, updated_at: new Date().toISOString() })
    .eq("id", input.ticketId);
  if (eUpd) return errorInesperado("finalizarInspeccion.update", eUpd);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
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
}): Promise<ResultadoAccion<{ ticketId: string; numeroRevision: number }>> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    return {
      ok: false,
      mensaje: "Solo un supervisor puede registrar re-inspecciones.",
    };
  const supabase = await createClient();

  if (!input.conductor?.trim())
    return { ok: false, mensaje: "Falta el conductor de esta revisión." };
  if (!input.fechaVencimientoISO)
    return { ok: false, mensaje: "Falta la fecha de vencimiento de la corrección." };

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, revision_actual, supervisor_id, tipo_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) return { ok: false, mensaje: "Ticket no encontrado." };
  if (!ticket.tipo_inspeccion)
    return { ok: false, mensaje: "Falta el tipo de inspección del ticket." };

  // Puede venir desde "finalizada_con_observaciones" (o el legado
  // "en_reparacion_de_observaciones") en el primer ingreso, o ya estar
  // "en_revision" si el supervisor volvió a los datos y reingresó.
  const yaEnCurso = ticket.estado === "en_revision";
  if (!yaEnCurso && !puedeReinspeccionar(ticket.estado))
    return {
      ok: false,
      mensaje: "Solo se puede re-inspeccionar un ticket con observaciones pendientes.",
    };

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
      return {
        ok: false,
        mensaje: "Otro supervisor ya está realizando la re-inspección de este ticket.",
      };
  }

  const numeroRevision = yaEnCurso
    ? ticket.revision_actual
    : ticket.revision_actual + 1;
  const conductor = input.conductor.trim();

  const prep = await prepararRevision(supabase, {
    ticketId: input.ticketId,
    numeroRevision,
    supervisorId: perfil.id,
    conductor,
    fechaVencimientoISO: input.fechaVencimientoISO,
    tipoInspeccion: ticket.tipo_inspeccion,
  });
  if (!prep.ok) return prep;

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
    if (error) return errorInesperado("iniciarReinspeccion.update", error);
  }

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return { ok: true, ticketId: input.ticketId, numeroRevision };
}

/**
 * §2.8: cierre de una re-inspección sobre datos ya guardados (§2.3). El
 * conductor y el vencimiento de esta revisión se fijaron en `iniciarReinspeccion`
 * y se copian a la cabecera del ticket (para la tabla resumen y el informe).
 */
export async function finalizarReinspeccion(input: {
  ticketId: string;
  revisionNumero: number;
}): Promise<ResultadoAccion<{ ticketId: string }>> {
  const { perfil } = await getSesion();
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("estado, supervisor_id, tipo_inspeccion")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (!ticket) return { ok: false, mensaje: "Ticket no encontrado." };
  if (ticket.estado !== "en_revision")
    return { ok: false, mensaje: "Esta re-inspección ya fue finalizada." };
  if (!ticket.tipo_inspeccion)
    return { ok: false, mensaje: "Falta el tipo de inspección del ticket." };

  const { data: rev } = await supabase
    .from("ticket_revisiones")
    .select("conductor, fecha_vencimiento, supervisor_id")
    .eq("ticket_id", input.ticketId)
    .eq("numero_revision", input.revisionNumero)
    .maybeSingle();
  if (!rev) return { ok: false, mensaje: "La revisión no está iniciada." };
  // §2.6: la finaliza quien la hizo (o el creador del ticket / un admin).
  if (ticket.supervisor_id !== perfil.id && rev.supervisor_id !== perfil.id)
    return {
      ok: false,
      mensaje: "Solo el supervisor a cargo de esta re-inspección puede finalizarla.",
    };

  const cierre = await cerrarRevision(
    supabase,
    input.ticketId,
    input.revisionNumero,
    ticket.tipo_inspeccion,
  );
  if (!cierre.ok) return cierre;

  const cambios = {
    estado: cierre.estado,
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
  if (errFinal) return errorInesperado("finalizarReinspeccion.update", errFinal);

  revalidatePath(`/tickets/${input.ticketId}`);
  revalidatePath("/dashboard");
  return { ok: true, ticketId: input.ticketId };
}

// ═══════════════════════════════════════════════════════════════════════
// Buscador de patentes — pantalla de inspecciones del supervisor, para usar
// ANTES de crear una inspección nueva.
// ═══════════════════════════════════════════════════════════════════════

const ESTADOS_RELEVANTES_BUSQUEDA = [
  "en_revision",
  "finalizada_con_observaciones",
  "en_reparacion_de_observaciones",
] as const;

/**
 * String de filtro `.or()` para patente_camion/patente_rampla — UNA sola
 * función, usada tanto por la consulta con RLS como por la consulta sin RLS
 * de §5 (ver hayCoincidenciaOcultaPara), para que el predicado de las dos
 * sea EXACTAMENTE el mismo y la resta de conteos sea válida.
 *
 * Requiere `normalizado` restringido a [A-Z0-9]+ (ver la validación en
 * buscarPorPatente, antes de llamar esta función) — el filtro `.or()` de
 * PostgREST se arma interpolando el string a mano; sin esa restricción,
 * una coma o un paréntesis en el término permitiría inyectar condiciones
 * adicionales al filtro.
 */
function filtroPatente(normalizado: string): string {
  return `patente_camion.ilike.%${normalizado}%,patente_rampla.ilike.%${normalizado}%`;
}

export type ItemNoConformeResumen = {
  itemKey: string;
  nombre: string;
  observacion: string | null;
};

export type ResultadoBusquedaTicket = {
  ticketId: string;
  numeroInspeccion: number;
  tipoInspeccion: string;
  estado: TicketEstado;
  patenteCamion: string;
  patenteRampla: string;
  /** Fecha de la revisión más reciente (no la de creación del ticket). */
  fecha: string;
  quienLaHizoNombre: string;
  /** Identidad del camión = patente_camion (§1). patente_rampla puede
   *  coincidir también — se informa cuál, nunca se mezclan en un solo
   *  veredicto. */
  coincidioEn: ("camion" | "rampla")[];
  itemsNoConformes: ItemNoConformeResumen[];
};

export type ResultadoBusquedaPatente = {
  misInspecciones: ResultadoBusquedaTicket[];
  conObservaciones: ResultadoBusquedaTicket[];
  /** Claves de tipos_inspeccion que este supervisor puede revisar — para el
   *  mensaje de estado vacío (§5: nunca "la patente está limpia", siempre
   *  acotado a lo que este supervisor puede ver). */
  tiposPermitidos: string[];
  /** §5: true si existe AL MENOS un ticket que matchea el término en un tipo
   *  que este supervisor no puede ver — sin número, sin detalle, sin
   *  contenido (ver hayCoincidenciaOcultaPara). */
  hayCoincidenciaOculta: boolean;
};

async function tiposPermitidosDe(
  supabase: SupabaseServer,
  personalId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("personal_tipos_inspeccion")
    .select("tipo_inspeccion")
    .eq("personal_id", personalId);
  return (data ?? []).map((p) => p.tipo_inspeccion);
}

/**
 * §5: compara, para la patente EXACTA (no substring — ver el comentario de
 * la migración 20260916040000), el conteo SIN RLS
 * (public.contar_tickets_con_patente_exacta, security definer, llamada por
 * `.rpc()`) contra `conteoVisibleExacto` — la diferencia es el conjunto
 * oculto. Nunca expone cuál: solo un booleano.
 *
 * Por qué esta versión y no las dos anteriores (histórico, no borrar sin
 * releer antes de tocar esto):
 *   v1 — función con `p_tipos_permitidos` como parámetro: descartada, una
 *        security definer no puede recibir su propio alcance de
 *        autorización como input.
 *   v2 — sacado ese parámetro, pero como `private` no está expuesto por
 *        PostgREST (`schemas` en supabase/config.toml), se llamaba con
 *        `createAdminClient()` en vez de como función: descartada también
 *        — eso le daba a esta ruta de código acceso a la base entera (el
 *        radio de un error futuro en `buscarPorPatente` pasa de "una
 *        consulta de conteo" a "cualquier cosa"), y el término seguía
 *        concatenado en un `.or()` en vez de ir como parámetro ligado.
 *   v3 (esta) — función en `public` (si expuesta por PostgREST), llamada
 *        por `.rpc()` con el término como parámetro ligado — la inyección
 *        queda eliminada por construcción. Exponerla a `authenticated` no
 *        filtra nada que la pantalla no muestre ya: sin el parámetro de
 *        alcance, solo responde "¿existe algo para esta patente EXACTA?".
 *
 * IMPORTANTE — por qué exacto y no substring, y por qué su propio conteo
 * visible en vez de reusar `lista`/`filtroPatente` de arriba: la resta de
 * conteos solo es válida si los dos lados usan EXACTAMENTE el mismo
 * predicado salvo la RLS. El listado visible es substring (ILIKE) a
 * propósito — ahí la RLS ya es el límite real, substring es solo
 * conveniencia. Pero para la señal de "hay algo oculto", un substring de
 * 2-3 letras dispara en casi cualquier búsqueda (no informa nada) y sirve
 * de sonda para enumerar coincidencias letra por letra. Por eso este
 * conteo es aparte, con su PROPIO par (RPC sin RLS vs. `lista` filtrada a
 * coincidencia exacta) — nunca mezclado con el conteo del listado
 * substring, que mentiría si se restara contra un total calculado con un
 * predicado distinto.
 *
 * `conteoVisibleExacto` no necesita una consulta aparte: se deriva
 * filtrando en JS los resultados de `lista` (ya venían con RLS aplicada, y
 * filtrar más en memoria nunca puede "revelar" una fila que RLS ya había
 * excluido) a los que matchean exacto — sigue siendo el mismo total de
 * consultas de la función que llama a esta.
 *
 * Si el RPC falla, no se rompe la búsqueda entera por esto: se loguea y se
 * asume "no hay coincidencia oculta" (falso negativo aceptable acá — es un
 * aviso adicional, no la fuente de verdad de qué mostrar).
 */
async function hayCoincidenciaOcultaPara(
  supabase: SupabaseServer,
  patenteNormalizada: string,
  conteoVisibleExacto: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("contar_tickets_con_patente_exacta", {
    p_patente_normalizada: patenteNormalizada,
  });
  if (error) {
    console.error("[hayCoincidenciaOcultaPara]", error);
    return false;
  }
  return Number(data ?? 0) > conteoVisibleExacto;
}

/**
 * Busca tickets pendientes/con observaciones por patente (camión o rampla).
 * Sin N+1: como mucho 3 consultas sin importar cuántos tickets coincidan
 * (tickets, sus revisiones, sus respuestas no_conforme) — nunca una consulta
 * por resultado.
 *
 * FUERA DE ALCANCE a propósito: no toca patente_rampla en ningún lado (vive
 * en `tickets`, no en `ticket_revisiones` — mover eso es un problema
 * conocido y aparte, no se lo empeora acá).
 *
 * §5: además del mensaje de estado vacío (nunca "la patente está limpia",
 * siempre acotado a los tipos que este supervisor puede revisar), avisa
 * cuando el término coincide con un ticket de un tipo que no puede ver — sin
 * número, sin detalle, sin contenido. Ver `hayCoincidenciaOcultaPara`.
 */
export async function buscarPorPatente(
  termino: string,
): Promise<ResultadoAccion<ResultadoBusquedaPatente>> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    return { ok: false, mensaje: "Solo un supervisor puede buscar por patente." };

  const normalizado = normalizarPatente(termino);
  if (!normalizado)
    return { ok: false, mensaje: "Escribí al menos parte de una patente." };
  // Restringido a alfanumérico: el filtro .or() de PostgREST se arma
  // interpolando este string a mano (filtroPatente) — sin esta validación,
  // una coma o un paréntesis en el término permitiría inyectar condiciones
  // adicionales al filtro. Una patente real nunca necesita otro carácter.
  if (!/^[A-Z0-9]+$/.test(normalizado))
    return { ok: false, mensaje: "La búsqueda solo puede tener letras y números." };

  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(
      "id, numero_inspeccion, tipo_inspeccion, estado, patente_camion, patente_rampla, revision_actual, supervisor_id",
    )
    .in("estado", ESTADOS_RELEVANTES_BUSQUEDA)
    .or(filtroPatente(normalizado));
  if (error) return errorInesperado("buscarPorPatente.tickets", error);

  const lista = tickets ?? [];
  if (lista.length === 0) {
    return {
      ok: true,
      misInspecciones: [],
      conObservaciones: [],
      hayCoincidenciaOculta: await hayCoincidenciaOcultaPara(supabase, normalizado, 0),
      tiposPermitidos: await tiposPermitidosDe(supabase, perfil.id),
    };
  }

  const ids = lista.map((t) => t.id);

  // Todas las revisiones de los tickets encontrados — UNA consulta, se
  // reduce a "la más reciente por ticket" en JS (no una consulta por
  // ticket).
  const { data: revisiones } = await supabase
    .from("ticket_revisiones")
    .select(
      "ticket_id, numero_revision, created_at, supervisor:personal!ticket_revisiones_supervisor_id_fkey(nombre, apellido)",
    )
    .in("ticket_id", ids);

  type FilaRevision = NonNullable<typeof revisiones>[number];
  const ultimaRevisionPorTicket = new Map<string, FilaRevision>();
  for (const r of revisiones ?? []) {
    const actual = ultimaRevisionPorTicket.get(r.ticket_id);
    if (!actual || r.numero_revision > actual.numero_revision)
      ultimaRevisionPorTicket.set(r.ticket_id, r);
  }

  // Ítems no conformes de TODAS las revisiones de estos tickets — UNA
  // consulta, filtrada en JS a la revisión más reciente de cada uno (ver
  // arriba). Con esto y las dos consultas de arriba, son 3 en total sin
  // importar cuántos tickets hayan coincidido.
  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select(
      "ticket_id, revision_numero, item_key, observacion, item:checklist_items(nombre)",
    )
    .in("ticket_id", ids)
    .eq("estado", "no_conforme");

  const itemsPorTicket = new Map<string, ItemNoConformeResumen[]>();
  for (const r of respuestas ?? []) {
    const ultima = ultimaRevisionPorTicket.get(r.ticket_id);
    if (!ultima || r.revision_numero !== ultima.numero_revision) continue;
    const arr = itemsPorTicket.get(r.ticket_id) ?? [];
    arr.push({
      itemKey: r.item_key,
      nombre: r.item?.nombre ?? r.item_key,
      observacion: r.observacion,
    });
    itemsPorTicket.set(r.ticket_id, arr);
  }

  const misInspecciones: ResultadoBusquedaTicket[] = [];
  const conObservaciones: ResultadoBusquedaTicket[] = [];

  for (const t of lista) {
    const ultima = ultimaRevisionPorTicket.get(t.id);
    const coincidioEn: ("camion" | "rampla")[] = [];
    if (t.patente_camion.includes(normalizado)) coincidioEn.push("camion");
    if (t.patente_rampla.includes(normalizado)) coincidioEn.push("rampla");

    const resultado: ResultadoBusquedaTicket = {
      ticketId: t.id,
      numeroInspeccion: t.numero_inspeccion,
      tipoInspeccion: t.tipo_inspeccion ?? "",
      estado: t.estado,
      patenteCamion: t.patente_camion,
      patenteRampla: t.patente_rampla,
      fecha: ultima?.created_at ?? "",
      quienLaHizoNombre: ultima?.supervisor
        ? nombreCompleto(ultima.supervisor.nombre, ultima.supervisor.apellido)
        : "—",
      coincidioEn,
      itemsNoConformes: itemsPorTicket.get(t.id) ?? [],
    };

    if (t.supervisor_id === perfil.id) misInspecciones.push(resultado);
    else conObservaciones.push(resultado);
  }

  // §5: conteo visible propio, por coincidencia EXACTA — no el largo de
  // `lista` (que es substring). Derivado de `lista` en JS, sin consulta
  // aparte: filtrar más adentro de lo que RLS ya devolvió nunca puede
  // revelar una fila que RLS había excluido.
  const conteoVisibleExacto = lista.filter(
    (t) => t.patente_camion === normalizado || t.patente_rampla === normalizado,
  ).length;

  return {
    ok: true,
    misInspecciones,
    conObservaciones,
    hayCoincidenciaOculta: await hayCoincidenciaOcultaPara(
      supabase,
      normalizado,
      conteoVisibleExacto,
    ),
    tiposPermitidos: await tiposPermitidosDe(supabase, perfil.id),
  };
}

/**
 * "Tomar" una inspección con observaciones de OTRO supervisor, desde el
 * buscador de patentes. Transición ÚNICA y acotada a propósito: la RLS de
 * `tickets_update` permite más de lo que este flujo debería (un supervisor
 * con permiso de tipo podría, en teoría, escribir cualquier columna
 * permitida por la política — incluidas patentes, o saltar directo a
 * `finalizada_sin_observaciones` sin pasar por una revisión real). Este
 * action nunca expone esos campos: el único cambio posible es
 * `finalizada_con_observaciones` -> `en_reparacion_de_observaciones`, nada
 * más.
 *
 * No crea la fila de `ticket_revisiones` ni toca `revision_actual` — eso ya
 * lo hace `iniciarReinspeccion` (sin cambios) cuando el supervisor llega a
 * `/tickets/[id]/reinspeccion`: `puedeReinspeccionar` ya acepta
 * `en_reparacion_de_observaciones` como punto de partida válido, y esa
 * función ya registra `ticket_revisiones.supervisor_id` como quien llama
 * (nunca sobrescribe `tickets.supervisor_id`, que conserva el origen del
 * ticket) — no hacía falta tocar ese código.
 *
 * El doble filtro en el `update` (`.eq("estado", "finalizada_con_observaciones")`)
 * es la defensa real contra dos supervisores tomando la misma inspección a
 * la vez: si otro ya la tomó entre que este supervisor la vio en los
 * resultados y apretó "Tomar", el update no afecta ninguna fila y se avisa
 * en vez de fingir éxito.
 */
export async function tomarInspeccionConObservaciones(input: {
  ticketId: string;
}): Promise<ResultadoAccion> {
  const { perfil } = await getSesion();
  if (perfil.rol !== "supervisor")
    return { ok: false, mensaje: "Solo un supervisor puede tomar una inspección." };

  const supabase = await createClient();

  const { data: actualizado, error } = await supabase
    .from("tickets")
    .update({
      estado: "en_reparacion_de_observaciones",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ticketId)
    .eq("estado", "finalizada_con_observaciones")
    .select("id")
    .maybeSingle();
  if (error) return errorInesperado("tomarInspeccionConObservaciones.update", error);
  if (!actualizado)
    return {
      ok: false,
      mensaje:
        "No se pudo tomar — puede que otro supervisor ya la haya tomado, o que ya no esté disponible. Volvé a buscar.",
    };

  revalidatePath("/dashboard");
  return { ok: true };
}
