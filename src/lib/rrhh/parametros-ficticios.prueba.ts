/**
 * ⚠️⚠️ VALORES FICTICIOS — SOLO PARA PRUEBAS ⚠️⚠️
 *
 * Ninguno de estos números es un indicador real (UF, UTM, IMM, topes, tasas,
 * comisiones de AFP, tramos de impuesto o de asignación familiar). Son
 * redondos a propósito para que nadie los confunda con los de Previred/SII.
 *
 * Los usan parametros.test.ts y los scripts de prueba contra la base LOCAL
 * (scripts/prueba-rls-rrhh.mjs, scripts/prueba-ruta-rrhh.mjs). No lo importa
 * ningún código de la app, así que no entra al build, y no es un seed de
 * Supabase: no llega a staging ni a producción. Los valores reales se cargan
 * desde /rrhh/parametros.
 */
import {
  AFPS,
  leerFormulario,
  tramosParaBase,
  type FormularioParametros,
} from "./parametros.ts";

/** Formulario completo y válido, todo en texto (como lo escribe una persona). */
export function formularioFicticio(anio = 2026, mes = 10): FormularioParametros {
  return {
    anio,
    mes,
    valores: {
      uf_mes_anterior: "10.000,50",
      uf_mes: "10.100,25",
      utm: "50.000",
      imm: "400.000",
      tope_imponible_afp_uf: "80,5",
      tope_imponible_afc_uf: "120,5",
      tasa_afp_obligatoria: "10",
      tasa_salud_minima: "7",
      tasa_afc_trabajador_indefinido: "1",
      tasa_afc_empleador_indefinido: "2",
      tasa_afc_empleador_plazo_fijo: "3",
      tasa_sis: "1,5",
      tasa_expectativa_vida: "1",
      tasa_rentabilidad_protegida: "1",
      tasa_mutual_base: "1",
    },
    comisionAfp: Object.fromEntries(
      AFPS.map((a, i) => [a, `0,${i + 1}`]),
    ) as FormularioParametros["comisionAfp"],
    tramosImpuesto: [
      { desde: "0", hasta: "10", factor: "0", rebaja: "0" },
      { desde: "10", hasta: "20", factor: "0,1", rebaja: "1" },
      { desde: "20", hasta: "", factor: "0,2", rebaja: "3" },
    ],
    tramosAsignacionFamiliar: [
      { hasta: "100.000", monto: "5.000" },
      { hasta: "200.000", monto: "1.000" },
      { hasta: "", monto: "0" },
    ],
  };
}

/** Lo mismo, con la forma de las filas de la base (para insertar directo). */
export function filasFicticias(anio = 2026, mes = 10) {
  const r = leerFormulario(formularioFicticio(anio, mes));
  if (!r.ok) throw new Error("Los valores ficticios no pasan la validación: " + r.errores.join(" "));
  const p = r.valor;
  return {
    parametros: p,
    periodo: { anio, mes, ...p.valores, ...tramosParaBase(p) },
    afps: AFPS.map((afp) => ({ anio, mes, afp, comision: p.comisionAfp[afp] })),
  };
}
