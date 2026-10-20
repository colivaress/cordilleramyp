"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { leerFormularioJornada, type FormularioJornada } from "@/lib/rrhh/jornadas";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Crea un patrón de jornada. Su horario queda fijo para siempre (trigger en
 * la base): para cambiar un turno se crea otra jornada y se asigna desde una
 * fecha, así los meses ya liquidados no cambian.
 */
export async function crearJornada(
  formulario: FormularioJornada,
): Promise<ResultadoAccion | { ok: false; mensaje: string; errores: string[] }> {
  const { perfil } = await requireModuloRrhh();
  const r = leerFormularioJornada(formulario);
  if (!r.ok) return { ok: false, mensaje: "Revisa los datos marcados antes de guardar.", errores: r.errores };

  const supabase = await createClient();
  const { error } = await supabase.from("rrhh_jornadas").insert({
    nombre: r.valor.nombre,
    dias: r.valor.dias,
    created_by: perfil.id,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, mensaje: "Ya existe una jornada con ese nombre." };
    return errorInesperado("crearJornada", error);
  }
  revalidatePath("/rrhh/jornadas");
  return { ok: true };
}

/** Desactivar solo la saca del selector de asignación; quien la tiene la conserva. */
export async function cambiarActivoJornada(input: { id: string; activo: boolean }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const supabase = await createClient();
  const { error } = await supabase.from("rrhh_jornadas").update({ activo: input.activo }).eq("id", input.id);
  if (error) return errorInesperado("cambiarActivoJornada", error);
  revalidatePath("/rrhh/jornadas");
  return { ok: true };
}
