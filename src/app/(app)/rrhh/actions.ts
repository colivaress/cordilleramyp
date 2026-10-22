"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEditarMontos, requireModuloRrhh } from "@/lib/rrhh/guardas";
import {
  fechaValida,
  leerFicha,
  leerRemuneracion,
  type FormularioFicha,
  type FormularioRemuneracion,
} from "@/lib/rrhh/ficha";
import {
  BUCKET_DOCUMENTOS,
  mimeDocumento,
  problemaDocumento,
  rutaEsDe,
} from "@/lib/rrhh/documentos";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Server Actions de la ficha del trabajador (fase 3). Cada una repite la
 * guarda de ruta aunque la RLS diga lo mismo, y vuelve a validar con las
 * mismas funciones puras que usa el formulario:
 *   - ficha, documentos, desvinculación → requireModuloRrhh
 *     (administrador y administrador de contrato);
 *   - montos de remuneración → requireEditarMontos (solo administrador).
 */

type ResultadoConErrores = ResultadoAccion | { ok: false; mensaje: string; errores: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = { ok: false as const, mensaje: "Trabajador no válido." };

function revalidarFicha(personalId: string) {
  revalidatePath(`/rrhh/${personalId}`);
  revalidatePath("/rrhh");
}

export async function guardarFicha(
  personalId: string,
  formulario: FormularioFicha,
): Promise<ResultadoConErrores> {
  const { perfil } = await requireModuloRrhh();
  if (!UUID.test(personalId)) return NO_VALIDO;
  const r = leerFicha(formulario);
  if (!r.ok) return { ok: false, mensaje: "Revisa los datos marcados antes de guardar.", errores: r.errores };

  const supabase = await createClient();
  // El contrato y la nómina del banco (§11) necesitan el RUT, que vive en
  // la cuenta de la persona: sin él no se crea el contrato.
  const { data: ruts } = await supabase.rpc("rrhh_ruts");
  if (!ruts?.some((x) => x.personal_id === personalId))
    return { ok: false, mensaje: "Primero registra el RUT de esta persona en \"Cuenta y acceso\"." };

  const { error } = await supabase.from("rrhh_fichas").upsert({
    personal_id: personalId,
    ...r.valor,
    updated_at: new Date().toISOString(),
    updated_by: perfil.id,
  });
  if (error) return errorInesperado("guardarFicha", error);
  revalidarFicha(personalId);
  return { ok: true };
}

/**
 * Registra un cambio de sueldo. Nunca edita una fila: agrega otra con su
 * vigencia, autor (de la sesión, no del cliente) y motivo. Esa tabla es el
 * historial de sueldo (§16.3).
 */
export async function registrarRemuneracion(
  personalId: string,
  formulario: FormularioRemuneracion,
): Promise<ResultadoConErrores> {
  const { perfil } = await requireEditarMontos();
  if (!UUID.test(personalId)) return NO_VALIDO;
  const r = leerRemuneracion(formulario);
  if (!r.ok) return { ok: false, mensaje: "Revisa los datos marcados antes de guardar.", errores: r.errores };

  const supabase = await createClient();
  const { error } = await supabase.from("rrhh_remuneracion_base").insert({
    personal_id: personalId,
    ...r.valor,
    created_by: perfil.id,
  });
  if (error) return errorInesperado("registrarRemuneracion", error);
  revalidarFicha(personalId);
  return { ok: true };
}

/**
 * Baja lógica (§16.8): la ficha y su historia quedan; cambia de pestaña Y
 * se corta el acceso a la app. Las dos cosas las escribe rrhh_desvincular()
 * en una sola transacción: fecha_desvinculacion es el hecho, activo la
 * bandera de acceso derivada (ver la migración 20261022020000). Nunca
 * escribir una sin la otra: la base lo rechaza.
 */
export async function desvincular(input: {
  personalId: string;
  fecha: string;
  motivo: string;
}): Promise<ResultadoAccion> {
  const { perfil } = await requireModuloRrhh();
  if (!UUID.test(input.personalId)) return NO_VALIDO;
  if (input.personalId === perfil.id) return { ok: false, mensaje: "No puedes desvincularte a ti mismo." };
  const motivo = input.motivo.trim();
  if (!fechaValida(input.fecha)) return { ok: false, mensaje: "Elige la fecha de desvinculación." };
  if (!motivo) return { ok: false, mensaje: "Escribe el motivo de la desvinculación." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rrhh_desvincular", {
    p_personal_id: input.personalId,
    p_fecha: input.fecha,
    p_motivo: motivo,
  });
  if (error) return errorDesvinculacion("desvincular", error);
  revalidarFicha(input.personalId);
  return { ok: true };
}

/** Deshace la desvinculación y devuelve el acceso, en una transacción. */
export async function reincorporar(personalId: string): Promise<ResultadoAccion> {
  await requireModuloRrhh();
  if (!UUID.test(personalId)) return NO_VALIDO;
  const supabase = await createClient();
  const { error } = await supabase.rpc("rrhh_reincorporar", { p_personal_id: personalId });
  if (error) return errorDesvinculacion("reincorporar", error);
  revalidarFicha(personalId);
  return { ok: true };
}

/** Los mensajes de rrhh_desvincular()/rrhh_reincorporar() son para leer. */
function errorDesvinculacion(contexto: string, error: { code?: string; message: string }): ResultadoAccion {
  if (error.code === "P0002" || error.code === "42501") return { ok: false, mensaje: error.message };
  if (error.code === "23514")
    return { ok: false, mensaje: "La fecha de desvinculación no puede ser anterior al ingreso." };
  return errorInesperado(contexto, error);
}

/**
 * Registra los documentos que el navegador YA subió al bucket (subir 15 MB
 * por una Server Action choca con su límite de tamaño de cuerpo). No confía
 * en lo que manda el cliente: la ruta tiene que ser de ese trabajador, el
 * archivo tiene que existir en el bucket y el tipo tiene que estar activo.
 */
export async function registrarDocumentos(input: {
  personalId: string;
  tipoId: string;
  archivos: { ruta: string; nombre: string; tamano: number }[];
}): Promise<ResultadoAccion> {
  const { perfil } = await requireModuloRrhh();
  if (!UUID.test(input.personalId)) return NO_VALIDO;
  if (!UUID.test(input.tipoId)) return { ok: false, mensaje: "Elige el tipo de documento." };
  if (input.archivos.length === 0) return { ok: false, mensaje: "No hay archivos para registrar." };

  for (const a of input.archivos) {
    const problema = problemaDocumento(a);
    if (problema) return { ok: false, mensaje: problema };
    if (!rutaEsDe(a.ruta, input.personalId)) return { ok: false, mensaje: `"${a.nombre}" no corresponde a este trabajador.` };
  }

  const supabase = await createClient();
  const { data: tipo } = await supabase
    .from("rrhh_tipos_documento")
    .select("activo")
    .eq("id", input.tipoId)
    .maybeSingle();
  if (!tipo?.activo) return { ok: false, mensaje: "Ese tipo de documento no existe o está desactivado." };

  const existen = await Promise.all(
    input.archivos.map((a) => supabase.storage.from(BUCKET_DOCUMENTOS).exists(a.ruta)),
  );
  const faltante = input.archivos.find((_, i) => !existen[i].data);
  if (faltante) return { ok: false, mensaje: `"${faltante.nombre}" no se alcanzó a subir. Intenta de nuevo.` };

  const { error } = await supabase.from("rrhh_documentos").insert(
    input.archivos.map((a) => ({
      personal_id: input.personalId,
      tipo_id: input.tipoId,
      nombre_archivo: a.nombre,
      ruta: a.ruta,
      tamano_bytes: a.tamano,
      mime: mimeDocumento(a.nombre)!,
      created_by: perfil.id,
    })),
  );
  if (error) return errorInesperado("registrarDocumentos", error);
  revalidarFicha(input.personalId);
  revalidatePath("/rrhh/tipos-documento");
  return { ok: true };
}
