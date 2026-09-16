"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRol } from "@/lib/auth";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/** "informes" = destinatarios_correo_tipos.recibe_informes (§4.1, el botón
 *  "Enviar por correo" del informe). "vencimientos" = recibe_vencimientos
 *  (§3.2, el correo automático del cron cuando una inspección está por
 *  vencer). Dos columnas del mismo join, nunca la misma pantalla. */
export type CanalCorreo = "informes" | "vencimientos";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rutaDe(canal: CanalCorreo): string {
  return canal === "informes"
    ? "/configuracion/correos/informes"
    : "/configuracion/correos/alertas";
}

/**
 * INVARIANTE DE REPRESENTACIÓN de `destinatarios_correo_tipos` — un solo
 * lugar (este archivo, las dos funciones de abajo) decide esto en todo el
 * proyecto: la fila del join existe SOLO SI al menos uno de los dos flags
 * (`recibe_informes`, `recibe_vencimientos`) es true. Si un flag se apaga y
 * el otro ya estaba en false, la fila se borra — nunca queda una fila con
 * los dos flags en false conviviendo con la ausencia de fila para el mismo
 * (destinatario, tipo). Dejar coexistir esas dos representaciones del mismo
 * estado ("este destinatario no recibe nada de este tipo") es exactamente
 * la forma del agujero del PR #32: dos lugares decidiendo lo mismo, sin
 * garantía de que se muevan juntos.
 *
 * `habilitarEnTipo` solo ENCIENDE un flag (upsert de una sola columna — no
 * toca la otra, aunque la fila ya exista con la otra en true). `apagarEnTipo`
 * apaga un flag y, en un segundo paso, borra la fila si con eso quedó con
 * los dos en false — nunca al revés (nunca se decide con una lectura previa
 * que podría estar vieja; el DELETE vuelve a evaluar el estado real de la
 * fila en el momento en que se ejecuta).
 */
async function habilitarEnTipo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destinatarioId: string,
  tipoInspeccion: string,
  canal: CanalCorreo,
): Promise<ResultadoAccion> {
  // Dos ramas completas, cada una con su propia llamada a `.upsert(...)`
  // literal (ni clave computada ni una variable de tipo unión pasada a
  // `.upsert`) a propósito: en ambos casos TS deja de poder resolver el
  // excess-property-check de supabase-js contra el tipo real de la fila
  // (termina viendo un índice `{ [x: string]: ... }` o una unión que no
  // distribuye sobre la sobrecarga). Con el literal inline en cada rama, TS
  // sabe exactamente qué columna se toca.
  const { error } =
    canal === "informes"
      ? await supabase
          .from("destinatarios_correo_tipos")
          .upsert(
            { destinatario_id: destinatarioId, tipo_inspeccion: tipoInspeccion, recibe_informes: true },
            { onConflict: "destinatario_id,tipo_inspeccion" },
          )
      : await supabase
          .from("destinatarios_correo_tipos")
          .upsert(
            { destinatario_id: destinatarioId, tipo_inspeccion: tipoInspeccion, recibe_vencimientos: true },
            { onConflict: "destinatario_id,tipo_inspeccion" },
          );
  if (error) return errorInesperado("habilitarEnTipo", error);
  return { ok: true };
}

async function apagarEnTipo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destinatarioId: string,
  tipoInspeccion: string,
  canal: CanalCorreo,
): Promise<ResultadoAccion> {
  // Mismo motivo que en habilitarEnTipo: dos ramas completas en vez de una
  // variable de tipo unión pasada a `.update(...)`.
  const { error: errUpdate } =
    canal === "informes"
      ? await supabase
          .from("destinatarios_correo_tipos")
          .update({ recibe_informes: false })
          .eq("destinatario_id", destinatarioId)
          .eq("tipo_inspeccion", tipoInspeccion)
      : await supabase
          .from("destinatarios_correo_tipos")
          .update({ recibe_vencimientos: false })
          .eq("destinatario_id", destinatarioId)
          .eq("tipo_inspeccion", tipoInspeccion);
  if (errUpdate) return errorInesperado("apagarEnTipo.update", errUpdate);

  // Solo borra si, con el apagado de arriba ya aplicado, los dos flags
  // quedaron en false — si el otro canal seguía en true, este where no
  // matchea ninguna fila y no pasa nada más.
  const { error: errDelete } = await supabase
    .from("destinatarios_correo_tipos")
    .delete()
    .eq("destinatario_id", destinatarioId)
    .eq("tipo_inspeccion", tipoInspeccion)
    .eq("recibe_informes", false)
    .eq("recibe_vencimientos", false);
  if (errDelete) return errorInesperado("apagarEnTipo.delete", errDelete);

  return { ok: true };
}

/**
 * Agrega (o reutiliza) un destinatario por correo y lo habilita para
 * `tipoInspeccion` en `canal`. El mismo correo puede repetirse en varios
 * tipos/secciones a propósito — reutiliza la fila de `destinatarios_correo`
 * si ya existe (por `email`, sin distinguir mayúsculas) en vez de crear un
 * duplicado de la persona.
 */
export async function agregarDestinatario(input: {
  nombre: string;
  email: string;
  cargo: string;
  tipoInspeccion: string;
  canal: CanalCorreo;
}): Promise<ResultadoAccion> {
  await requireRol("administrador");

  const nombre = input.nombre.trim();
  const email = input.email.trim().toLowerCase();
  const cargo = input.cargo.trim();

  if (!nombre) return { ok: false, mensaje: 'Falta completar "Nombre".' };
  if (!EMAIL_RE.test(email))
    return { ok: false, mensaje: "El correo no tiene un formato válido." };

  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("destinatarios_correo")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  let destinatarioId = existente?.id as string | undefined;

  if (!destinatarioId) {
    const { data: nuevo, error } = await supabase
      .from("destinatarios_correo")
      .insert({ nombre, email, cargo: cargo || null, activo: true })
      .select("id")
      .single();
    if (error) {
      // El chequeo de arriba (ilike) evita el caso normal, pero no gana la
      // carrera si dos administradores agregan el mismo correo casi al
      // mismo tiempo — el índice único sobre lower(email) es la verdad
      // final, así que se captura su violación (23505) acá, no solo el
      // chequeo en memoria de arriba.
      if (error.code === "23505")
        return { ok: false, mensaje: "Ya existe un destinatario con ese correo." };
      return errorInesperado("agregarDestinatario.insert", error);
    }
    destinatarioId = nuevo.id;
  }

  const res = await habilitarEnTipo(supabase, destinatarioId, input.tipoInspeccion, input.canal);
  if (!res.ok) return res;

  revalidatePath(rutaDe(input.canal));
  return { ok: true };
}

/** Quita un destinatario de un tipo/canal puntual — no lo desactiva ni lo
 *  saca de los demás tipos donde esté habilitado. Ver el comentario grande
 *  de `apagarEnTipo` arriba para el invariante que aplica. */
export async function quitarDeTipo(input: {
  destinatarioId: string;
  tipoInspeccion: string;
  canal: CanalCorreo;
}): Promise<ResultadoAccion> {
  await requireRol("administrador");
  const supabase = await createClient();

  const res = await apagarEnTipo(supabase, input.destinatarioId, input.tipoInspeccion, input.canal);
  if (!res.ok) return res;

  revalidatePath(rutaDe(input.canal));
  return { ok: true };
}

/** Activar/desactivar es GLOBAL a la persona (mismo campo que ya leen la
 *  ruta de envío de informe y el cron de vencimiento) — afecta sus cuatro
 *  tipos y los dos canales a la vez. Desactivar no borra nada: el
 *  destinatario y su historial de tipos quedan, solo deja de recibir. */
export async function cambiarActivoDestinatario(input: {
  id: string;
  activo: boolean;
}): Promise<ResultadoAccion> {
  await requireRol("administrador");
  const supabase = await createClient();

  const { error } = await supabase
    .from("destinatarios_correo")
    .update({ activo: input.activo })
    .eq("id", input.id);
  if (error) return errorInesperado("cambiarActivoDestinatario.update", error);

  revalidatePath("/configuracion/correos/informes");
  revalidatePath("/configuracion/correos/alertas");
  return { ok: true };
}
