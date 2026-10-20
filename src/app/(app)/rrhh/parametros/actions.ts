"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEditarMontos } from "@/lib/rrhh/guardas";
import {
  AFPS,
  codigoPeriodo,
  leerCodigoPeriodo,
  leerDecimal,
  leerFormulario,
  planCambioMutual,
  tramosParaBase,
  type FormularioParametros,
} from "@/lib/rrhh/parametros";
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

/**
 * Registra la tasa adicional de mutual de la empresa desde un mes. No es un
 * dato del período (§ migración): vive con vigencia en rrhh_mutual_adicional
 * y `planCambioMutual` decide si se corrige un tramo o se corta otro.
 *
 * Al cortar son dos escrituras sin transacción: si la segunda falla queda un
 * hueco, y el cálculo de esos meses falla con "Falta la tasa adicional de
 * mutual…" en vez de usar un valor equivocado. Repetir la carga lo cierra
 * (el mes cae en el hueco y el tramo nuevo llega hasta el siguiente).
 */
export async function registrarMutualAdicional(input: {
  anio: number;
  mes: number;
  tasa: string;
}): Promise<ResultadoAccion> {
  const { perfil } = await requireEditarMontos();

  if (!leerCodigoPeriodo(codigoPeriodo(input.anio, input.mes)))
    return { ok: false, mensaje: "El mes de inicio no es válido." };
  const tasa = leerDecimal(input.tasa);
  if (tasa === null || !(tasa >= 0 && tasa < 100))
    return { ok: false, mensaje: "La tasa debe ser un porcentaje entre 0 y 100, con coma para los decimales." };

  const supabase = await createClient();
  const { data: tramos, error } = await supabase
    .from("rrhh_mutual_adicional")
    .select("id, vigente_desde, vigente_hasta, tasa");
  if (error) return errorInesperado("registrarMutualAdicional.leer", error);

  const plan = planCambioMutual(
    tramos.map((t) => ({ id: t.id, vigenteDesde: t.vigente_desde, vigenteHasta: t.vigente_hasta, tasa: t.tasa })),
    input.anio,
    input.mes,
    tasa,
  );

  if (plan.tipo === "corregir") {
    const { error } = await supabase
      .from("rrhh_mutual_adicional")
      .update({ tasa: plan.tasa, updated_by: perfil.id })
      .eq("id", plan.id);
    if (error) return errorInesperado("registrarMutualAdicional.corregir", error);
  } else {
    if (plan.cortar) {
      const { error } = await supabase
        .from("rrhh_mutual_adicional")
        .update({ vigente_hasta: plan.cortar.vigenteHasta, updated_by: perfil.id })
        .eq("id", plan.cortar.id);
      if (error) return errorInesperado("registrarMutualAdicional.cortar", error);
    }
    const { error } = await supabase.from("rrhh_mutual_adicional").insert({
      vigente_desde: plan.insertar.vigenteDesde,
      vigente_hasta: plan.insertar.vigenteHasta,
      tasa: plan.insertar.tasa,
      updated_by: perfil.id,
    });
    if (error) return errorInesperado("registrarMutualAdicional.insertar", error);
  }

  revalidatePath("/rrhh/parametros");
  return { ok: true };
}
