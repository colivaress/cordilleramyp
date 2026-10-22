"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { fechaValida } from "@/lib/rrhh/ficha";
import { conflictos, leerTurno, type FormularioTurno, type Rango } from "@/lib/rrhh/turnos";
import { nombreCompleto } from "@/lib/mensajes";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Turnos (spec RRHH §8): asignación masiva, corrección y anulación. Las tres
 * entran con requireModuloRrhh (administrador y adm. de contrato), igual
 * que la RLS de rrhh_jornada_trabajador. Ninguna borra: el historial es la
 * evidencia para revisar un cálculo de horas.
 */

export type Conflicto = { persona: string; jornada: string; desde: string; hasta: string | null };

export type ResultadoTurno =
  | { ok: true; asignadas: number }
  | { ok: false; mensaje: string; errores?: string[]; conflictos?: Conflicto[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCLUSION = "23P01";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidar(personalIds: readonly string[]) {
  revalidatePath("/rrhh/turnos");
  for (const id of personalIds) revalidatePath(`/rrhh/${id}`);
}

/** Asignaciones vigentes de esas personas que chocan con el rango, con
 *  nombres legibles: es lo que se le muestra a quien asigna. */
async function buscarConflictos(supabase: Supabase, personalIds: readonly string[], rango: Rango, excepto?: string) {
  const { data, error } = await supabase
    .from("rrhh_jornada_trabajador")
    .select("id, personal_id, jornada_id, vigente_desde, vigente_hasta, anulada_en, persona:personal!rrhh_jornada_trabajador_personal_id_fkey(nombre, apellido), jornada:rrhh_jornadas(nombre)")
    .in("personal_id", [...personalIds])
    .is("anulada_en", null);
  if (error) return { error };
  const chocan = conflictos((data ?? []).filter((a) => a.id !== excepto), personalIds, rango);
  return {
    conflictos: chocan.map((a) => ({
      persona: a.persona ? nombreCompleto(a.persona.nombre, a.persona.apellido) : "—",
      jornada: a.jornada?.nombre ?? "—",
      desde: a.vigente_desde,
      hasta: a.vigente_hasta,
    })),
  };
}

/**
 * Asigna UNA jornada a VARIAS personas en un rango. Todo o nada: primero
 * valida y, si alguien choca, no escribe nada y devuelve quién y con qué.
 * La escritura es un único INSERT de varias filas — una sola sentencia, una
 * sola transacción —, así que si entre la validación y la escritura otra
 * persona asignó algo, la exclusión de la base rechaza el lote completo.
 */
export async function asignarTurno(formulario: FormularioTurno): Promise<ResultadoTurno> {
  const { perfil } = await requireModuloRrhh();
  const r = leerTurno(formulario);
  if (!r.ok) return { ok: false, mensaje: "Revisa los datos marcados.", errores: r.errores };
  const t = r.valor;
  const rango = { desde: t.desde, hasta: t.hasta };

  const supabase = await createClient();
  const [{ data: jornada }, { data: fichas, error: errFichas }, { data: personas }] = await Promise.all([
    supabase.from("rrhh_jornadas").select("activo").eq("id", t.jornadaId).maybeSingle(),
    supabase.from("rrhh_fichas").select("personal_id, fecha_desvinculacion").in("personal_id", t.personalIds),
    supabase.from("personal").select("id, nombre, apellido").in("id", t.personalIds),
  ]);
  if (errFichas) return errorInesperado("asignarTurno.fichas", errFichas);
  if (!jornada?.activo) return { ok: false, mensaje: "Esa jornada no existe o está desactivada." };

  // Solo a quien tiene contrato vigente: sin contrato no hay horas que medir.
  const nombreDe = new Map((personas ?? []).map((p) => [p.id, nombreCompleto(p.nombre, p.apellido)]));
  const fichaDe = new Map((fichas ?? []).map((f) => [f.personal_id, f]));
  const sinContrato = t.personalIds.filter((id) => !fichaDe.has(id));
  const desvinculados = t.personalIds.filter((id) => fichaDe.get(id)?.fecha_desvinculacion);
  const errores = [
    ...sinContrato.map((id) => `${nombreDe.get(id) ?? "Una de las personas marcadas"} no tiene contrato registrado.`),
    ...desvinculados.map((id) => `${nombreDe.get(id) ?? "Una de las personas marcadas"} está desvinculado.`),
  ];
  if (errores.length) return { ok: false, mensaje: "No se asignó a nadie.", errores };

  const previo = await buscarConflictos(supabase, t.personalIds, rango);
  if (previo.error) return errorInesperado("asignarTurno.conflictos", previo.error);
  if (previo.conflictos.length)
    return {
      ok: false,
      mensaje: "No se asignó a nadie: hay personas que ya tienen jornada en esas fechas.",
      conflictos: previo.conflictos,
    };

  const { error } = await supabase.from("rrhh_jornada_trabajador").insert(
    t.personalIds.map((personal_id) => ({
      personal_id,
      jornada_id: t.jornadaId,
      vigente_desde: t.desde,
      vigente_hasta: t.hasta,
      created_by: perfil.id,
    })),
  );
  if (error) {
    if (error.code === EXCLUSION) {
      const ahora = await buscarConflictos(supabase, t.personalIds, rango);
      return {
        ok: false,
        mensaje: "No se asignó a nadie: mientras tanto alguien asignó jornada a una de estas personas en esas fechas.",
        conflictos: ahora.conflictos ?? [],
      };
    }
    if (error.code === "42501") return { ok: false, mensaje: "No tienes permiso para asignar turnos." };
    return errorInesperado("asignarTurno.insert", error);
  }
  revalidar(t.personalIds);
  return { ok: true, asignadas: t.personalIds.length };
}

type Cargada = { personal_id: string; anulada_en: string | null };

async function cargarAsignacion(supabase: Supabase, id: string): Promise<Cargada | null> {
  const { data } = await supabase
    .from("rrhh_jornada_trabajador")
    .select("personal_id, anulada_en")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Corrige el rango de una asignación. El trigger guarda quién, cuándo y
 *  el motivo en rrhh_jornada_trabajador_cambios. */
export async function corregirAsignacion(input: {
  id: string;
  desde: string;
  hasta: string;
  motivo: string;
}): Promise<ResultadoTurno> {
  await requireModuloRrhh();
  if (!UUID.test(input.id)) return { ok: false, mensaje: "Asignación no válida." };
  const motivo = input.motivo.trim();
  const hasta = input.hasta.trim() || null;
  if (!fechaValida(input.desde)) return { ok: false, mensaje: "Elige desde qué fecha." };
  if (hasta !== null && !fechaValida(hasta)) return { ok: false, mensaje: "La fecha de término no es válida." };
  if (hasta !== null && hasta < input.desde) return { ok: false, mensaje: "La fecha de término es anterior a la de inicio." };
  if (!motivo) return { ok: false, mensaje: "Escribe el motivo del cambio." };

  const supabase = await createClient();
  const actual = await cargarAsignacion(supabase, input.id);
  if (!actual) return { ok: false, mensaje: "Esa asignación no existe." };
  if (actual.anulada_en) return { ok: false, mensaje: "Esta asignación está anulada y ya no se puede modificar." };

  const rango = { desde: input.desde, hasta };
  const previo = await buscarConflictos(supabase, [actual.personal_id], rango, input.id);
  if (previo.error) return errorInesperado("corregirAsignacion.conflictos", previo.error);
  if (previo.conflictos.length)
    return { ok: false, mensaje: "El nuevo rango choca con otra asignación de esta persona.", conflictos: previo.conflictos };

  const { data, error } = await supabase
    .from("rrhh_jornada_trabajador")
    .update({ vigente_desde: input.desde, vigente_hasta: hasta, motivo_cambio: motivo })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === EXCLUSION) return { ok: false, mensaje: "El nuevo rango choca con otra asignación de esta persona." };
    return errorInesperado("corregirAsignacion", error);
  }
  if (!data) return { ok: false, mensaje: "No tienes permiso para corregir turnos." };
  revalidar([actual.personal_id]);
  return { ok: true, asignadas: 1 };
}

/** Anula una asignación (no la borra): deja de cubrir días y libera el
 *  rango para asignar otra jornada en su lugar. */
export async function anularAsignacion(input: { id: string; motivo: string }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  if (!UUID.test(input.id)) return { ok: false, mensaje: "Asignación no válida." };
  const motivo = input.motivo.trim();
  if (!motivo) return { ok: false, mensaje: "Escribe por qué se anula." };

  const supabase = await createClient();
  const actual = await cargarAsignacion(supabase, input.id);
  if (!actual) return { ok: false, mensaje: "Esa asignación no existe." };
  if (actual.anulada_en) return { ok: false, mensaje: "Esta asignación ya estaba anulada." };

  // anulada_en/anulada_por los fija el trigger con la hora del servidor y
  // quien llama; lo que se manda acá solo marca la intención.
  const { data, error } = await supabase
    .from("rrhh_jornada_trabajador")
    .update({ anulada_en: new Date().toISOString(), motivo_cambio: motivo })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return errorInesperado("anularAsignacion", error);
  if (!data) return { ok: false, mensaje: "No tienes permiso para anular turnos." };
  revalidar([actual.personal_id]);
  return { ok: true };
}
