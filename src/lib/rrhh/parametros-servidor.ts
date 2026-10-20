import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  desdeBase,
  mutualAdicionalVigente,
  type ParametrosPeriodo,
  type Resultado,
} from "@/lib/rrhh/parametros";

type Cliente = SupabaseClient<Database>;

/**
 * Trae los parámetros de un período desde la base. El cálculo (fase 4) no la
 * llama directo sino por `cargarParametrosCalculo`, que además exige la tasa
 * adicional de mutual vigente. Si el período no está o está
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

/**
 * Todo lo que el cálculo de un mes necesita leer de configuración: los
 * parámetros del período y la tasa adicional de mutual de la empresa
 * vigente ese mes. Si falta cualquiera de los dos, junta los mensajes de
 * ambos y no devuelve nada utilizable.
 */
export async function cargarParametrosCalculo(
  supabase: Cliente,
  anio: number,
  mes: number,
): Promise<Resultado<{ periodo: ParametrosPeriodo; tasaMutualAdicional: number }>> {
  const [periodo, mutual] = await Promise.all([
    cargarParametrosPeriodo(supabase, anio, mes),
    supabase.from("rrhh_mutual_adicional").select("vigente_desde, vigente_hasta, tasa"),
  ]);
  if (mutual.error) {
    console.error("[cargarParametrosCalculo]", mutual.error);
    return { ok: false, errores: ["No se pudo leer la tasa adicional de mutual. Intenta de nuevo."] };
  }
  const tasa = mutualAdicionalVigente(
    mutual.data.map((t) => ({ vigenteDesde: t.vigente_desde, vigenteHasta: t.vigente_hasta, tasa: t.tasa })),
    anio,
    mes,
  );
  const errores = [...(periodo.ok ? [] : periodo.errores), ...(tasa.ok ? [] : tasa.errores)];
  if (!periodo.ok || !tasa.ok) return { ok: false, errores };
  return { ok: true, valor: { periodo: periodo.valor, tasaMutualAdicional: tasa.valor } };
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
