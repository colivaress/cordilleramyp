"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

const RUTA = "/rrhh/tipos-documento";
const DUPLICADO = { ok: false as const, mensaje: "Ya existe un tipo de documento con ese nombre." };

/** Catálogo de tipos (§16.1). Baja lógica: un tipo se desactiva, nunca se borra. */
export async function agregarTipoDocumento(input: { nombre: string }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, mensaje: "Falta el nombre del tipo." };

  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("rrhh_tipos_documento")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("rrhh_tipos_documento")
    .insert({ nombre, orden: (ultimo?.orden ?? 0) + 1 });
  if (error) {
    if (error.code === "23505") return DUPLICADO;
    return errorInesperado("agregarTipoDocumento", error);
  }
  revalidatePath(RUTA);
  return { ok: true };
}

export async function renombrarTipoDocumento(input: { id: string; nombre: string }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, mensaje: "Falta el nombre del tipo." };
  const supabase = await createClient();
  const { error } = await supabase.from("rrhh_tipos_documento").update({ nombre }).eq("id", input.id);
  if (error) {
    if (error.code === "23505") return DUPLICADO;
    return errorInesperado("renombrarTipoDocumento", error);
  }
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarActivoTipoDocumento(input: { id: string; activo: boolean }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const supabase = await createClient();
  const { error } = await supabase.from("rrhh_tipos_documento").update({ activo: input.activo }).eq("id", input.id);
  if (error) return errorInesperado("cambiarActivoTipoDocumento", error);
  revalidatePath(RUTA);
  return { ok: true };
}
