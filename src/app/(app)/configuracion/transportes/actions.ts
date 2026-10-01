"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRol } from "@/lib/auth";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

const RUTA = "/configuracion/transportes";

/**
 * Agrega un transporte al catálogo. El índice único sobre `lower(nombre)`
 * (migración 20260930010000) no distingue activo/inactivo a propósito — si
 * ya existe un transporte con ese nombre mas desactivado, se reactiva en vez
 * de rechazar el alta: es el caso real ("lo desactivé por error, lo vuelvo a
 * necesitar"), y evita que reactivar termine siendo "bórralo y escribilo de
 * nuevo" con el riesgo de ortografía distinta que motivó el soft delete.
 */
export async function agregarTransporte(input: {
  nombre: string;
}): Promise<ResultadoAccion> {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, mensaje: 'Falta el nombre del transporte.' };

  const { data: existente } = await supabase
    .from("transportes")
    .select("id, activo")
    .ilike("nombre", nombre)
    .maybeSingle();

  if (existente) {
    if (existente.activo)
      return { ok: false, mensaje: "Ya existe un transporte con ese nombre." };
    const { error } = await supabase
      .from("transportes")
      .update({ activo: true })
      .eq("id", existente.id);
    if (error) return errorInesperado("agregarTransporte.reactivar", error);
    revalidatePath(RUTA);
    return { ok: true };
  }

  const { error } = await supabase.from("transportes").insert({ nombre, activo: true });
  if (error) {
    // El chequeo de arriba (ilike) evita el caso normal, pero no gana la
    // carrera si dos administradores agregan el mismo nombre casi al mismo
    // tiempo — el índice único sobre lower(nombre) es la verdad final.
    if (error.code === "23505")
      return { ok: false, mensaje: "Ya existe un transporte con ese nombre." };
    return errorInesperado("agregarTransporte.insert", error);
  }

  revalidatePath(RUTA);
  return { ok: true };
}

/**
 * Renombra un transporte existente. NO toca ningún ticket ya creado —
 * tickets.transporte es texto copiado al momento de crear el ticket, no una
 * llave foránea a esta tabla (ver la migración). El cambio de nombre solo
 * afecta cómo se ve este transporte en el selector de inspecciones nuevas
 * de ahora en más.
 */
export async function renombrarTransporte(input: {
  id: string;
  nombre: string;
}): Promise<ResultadoAccion> {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, mensaje: "Falta el nombre del transporte." };

  const { data: existente } = await supabase
    .from("transportes")
    .select("id")
    .ilike("nombre", nombre)
    .neq("id", input.id)
    .maybeSingle();
  if (existente)
    return { ok: false, mensaje: "Ya existe otro transporte con ese nombre." };

  const { error } = await supabase
    .from("transportes")
    .update({ nombre })
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505")
      return { ok: false, mensaje: "Ya existe otro transporte con ese nombre." };
    return errorInesperado("renombrarTransporte.update", error);
  }

  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarActivoTransporte(input: {
  id: string;
  activo: boolean;
}): Promise<ResultadoAccion> {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const { error } = await supabase
    .from("transportes")
    .update({ activo: input.activo })
    .eq("id", input.id);
  if (error) return errorInesperado("cambiarActivoTransporte.update", error);

  revalidatePath(RUTA);
  return { ok: true };
}
