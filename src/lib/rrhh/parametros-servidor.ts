import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { desdeBase, type ParametrosPeriodo, type Resultado } from "@/lib/rrhh/parametros";

type Cliente = SupabaseClient<Database>;

/**
 * Trae los parámetros de un período desde la base. Es la puerta por la que
 * el cálculo (fase 4) obtiene sus indicadores: si el período no está o está
 * incompleto, devuelve `{ ok: false, errores }` con mensajes listos para
 * mostrar ("Faltan los parámetros previsionales de octubre 2026."). Un
 * error de red/RLS también es `ok: false`: nunca se calcula a medias.
 */
export async function cargarParametrosPeriodo(
  supabase: Cliente,
  anio: number,
  mes: number,
): Promise<Resultado<ParametrosPeriodo>> {
  const [periodo, afps] = await Promise.all([
    supabase.from("rrhh_parametros_periodo").select("*").eq("anio", anio).eq("mes", mes).maybeSingle(),
    supabase.from("rrhh_afp_periodo").select("afp, comision").eq("anio", anio).eq("mes", mes),
  ]);
  if (periodo.error || afps.error) {
    console.error("[cargarParametrosPeriodo]", periodo.error ?? afps.error);
    return { ok: false, errores: ["No se pudieron leer los parámetros previsionales. Intenta de nuevo."] };
  }
  return desdeBase(anio, mes, periodo.data, afps.data);
}

/** El período cargado más reciente ANTERIOR a (anio, mes), si existe. */
export async function periodoAnterior(
  supabase: Cliente,
  anio: number,
  mes: number,
): Promise<{ anio: number; mes: number } | null> {
  const { data } = await supabase
    .from("rrhh_parametros_periodo")
    .select("anio, mes")
    .or(`anio.lt.${anio},and(anio.eq.${anio},mes.lt.${mes})`)
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
