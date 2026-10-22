"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Catálogos de RRHH con el mismo patrón: tipos de documento (§16.1), cargos
 * y faenas. Baja lógica: un ítem se desactiva, nunca se borra (una ficha o
 * un documento histórico nunca apunta a nada). El catálogo llega como
 * clave y se traduce a tabla ACÁ, nunca se usa un nombre de tabla que
 * mande el navegador.
 */
const CATALOGOS = {
  "tipos-documento": { tabla: "rrhh_tipos_documento", articulo: "un tipo de documento" },
  cargos: { tabla: "rrhh_cargos", articulo: "un cargo" },
  faenas: { tabla: "rrhh_faenas", articulo: "una faena" },
} as const;

export type Catalogo = keyof typeof CATALOGOS;

function resolver(catalogo: Catalogo) {
  return Object.hasOwn(CATALOGOS, catalogo) ? CATALOGOS[catalogo] : null;
}

const NO_VALIDO = { ok: false as const, mensaje: "Catálogo no válido." };

export async function agregarItemCatalogo(input: { catalogo: Catalogo; nombre: string }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const c = resolver(input.catalogo);
  if (!c) return NO_VALIDO;
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, mensaje: "Falta el nombre." };

  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from(c.tabla)
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from(c.tabla).insert({ nombre, orden: (ultimo?.orden ?? 0) + 1 });
  if (error) {
    if (error.code === "23505") return { ok: false, mensaje: `Ya existe ${c.articulo} con ese nombre.` };
    return errorInesperado("agregarItemCatalogo", error);
  }
  revalidatePath(`/rrhh/${input.catalogo}`);
  return { ok: true };
}

export async function renombrarItemCatalogo(input: { catalogo: Catalogo; id: string; nombre: string }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const c = resolver(input.catalogo);
  if (!c) return NO_VALIDO;
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, mensaje: "Falta el nombre." };
  const supabase = await createClient();
  const { error } = await supabase.from(c.tabla).update({ nombre }).eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { ok: false, mensaje: `Ya existe ${c.articulo} con ese nombre.` };
    return errorInesperado("renombrarItemCatalogo", error);
  }
  revalidatePath(`/rrhh/${input.catalogo}`);
  return { ok: true };
}

export async function cambiarActivoItemCatalogo(input: { catalogo: Catalogo; id: string; activo: boolean }): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  const c = resolver(input.catalogo);
  if (!c) return NO_VALIDO;
  const supabase = await createClient();
  const { error } = await supabase.from(c.tabla).update({ activo: input.activo }).eq("id", input.id);
  if (error) return errorInesperado("cambiarActivoItemCatalogo", error);
  revalidatePath(`/rrhh/${input.catalogo}`);
  return { ok: true };
}
