"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEditarMontos } from "@/lib/rrhh/guardas";
import { AFPS, codigoPeriodo, leerFormulario, tramosParaBase, type FormularioParametros } from "@/lib/rrhh/parametros";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Guarda (crea o corrige) los parámetros de un período. Solo administrador:
 * la guarda de acá y la RLS (private.es_admin()) dicen lo mismo.
 *
 * Valida de nuevo todo el formulario en el servidor con la MISMA función que
 * usa la pantalla: lo que manda el navegador no es fuente de verdad.
 *
 * Son dos upserts (período y comisiones de AFP), no una transacción. Si el
 * segundo falla, el período queda sin comisiones y `desdeBase` lo rechaza
 * con "Faltan las comisiones de AFP…": un período a medias no se puede usar
 * para calcular, que es lo que importa. Volver a guardar lo completa.
 */
export async function guardarParametrosPeriodo(
  formulario: FormularioParametros,
): Promise<ResultadoAccion | { ok: false; mensaje: string; errores: string[] }> {
  const { perfil } = await requireEditarMontos();

  const r = leerFormulario(formulario);
  if (!r.ok) {
    return { ok: false, mensaje: "Revisa los datos marcados antes de guardar.", errores: r.errores };
  }
  const p = r.valor;
  const supabase = await createClient();

  const { error } = await supabase.from("rrhh_parametros_periodo").upsert({
    anio: p.anio,
    mes: p.mes,
    ...p.valores,
    ...tramosParaBase(p),
    updated_at: new Date().toISOString(),
    updated_by: perfil.id,
  });
  if (error) return errorInesperado("guardarParametrosPeriodo.periodo", error);

  const { error: errorAfp } = await supabase.from("rrhh_afp_periodo").upsert(
    AFPS.map((afp) => ({ anio: p.anio, mes: p.mes, afp, comision: p.comisionAfp[afp] })),
  );
  if (errorAfp) return errorInesperado("guardarParametrosPeriodo.afp", errorAfp);

  revalidatePath("/rrhh/parametros");
  revalidatePath(`/rrhh/parametros/${codigoPeriodo(p.anio, p.mes)}`);
  return { ok: true };
}
