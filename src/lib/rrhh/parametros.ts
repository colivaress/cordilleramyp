import type { Enums, Json, Tables } from "@/lib/supabase/database.types";

/**
 * Parámetros previsionales de un período (spec RRHH §3). Lógica pura, sin
 * React ni red: la usan la pantalla de carga (/rrhh/parametros), su Server
 * Action y —desde la fase 4— el motor de cálculo.
 *
 * Regla central: un parámetro ausente ROMPE, no adivina. No hay valores por
 * defecto en ningún lado de este archivo; si un período no está cargado
 * completo, `desdeBase` devuelve un mensaje que dice qué falta.
 */

export type RrhhAfp = Enums<"rrhh_afp">;

export const AFPS = [
  "capital",
  "cuprum",
  "habitat",
  "modelo",
  "planvital",
  "provida",
  "uno",
] as const satisfies readonly RrhhAfp[];

export const NOMBRE_AFP: Record<RrhhAfp, string> = {
  capital: "Capital",
  cuprum: "Cuprum",
  habitat: "Habitat",
  modelo: "Modelo",
  planvital: "PlanVital",
  provida: "ProVida",
  uno: "Uno",
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "octubre" */
export function nombreMes(mes: number): string {
  return MESES[mes - 1];
}

/** "octubre 2026" */
export function nombrePeriodo(anio: number, mes: number): string {
  return `${nombreMes(mes)} ${anio}`;
}

/** "2026-10" ↔ { anio, mes }: así va el período en la URL. */
export function codigoPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function leerCodigoPeriodo(codigo: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(codigo);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (anio < 2020 || anio > 2100 || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

/**
 * Campos escalares del período. La `clave` es el nombre de la columna en
 * rrhh_parametros_periodo, así el mapeo a la base es directo.
 *   - "uf":    decimal > 0 (UF o topes en UF).
 *   - "pesos": entero > 0.
 *   - "tasa":  porcentaje, 0 ≤ x < 100 (10 = 10%).
 */
export const CAMPOS = [
  { clave: "uf_mes_anterior", tipo: "uf", grupo: "indicadores", etiqueta: "UF del último día del mes anterior" },
  { clave: "uf_mes", tipo: "uf", grupo: "indicadores", etiqueta: "UF del último día del mes" },
  { clave: "utm", tipo: "pesos", grupo: "indicadores", etiqueta: "UTM" },
  { clave: "imm", tipo: "pesos", grupo: "indicadores", etiqueta: "Ingreso mínimo mensual" },
  { clave: "tope_imponible_afp_uf", tipo: "uf", grupo: "topes", etiqueta: "Tope imponible AFP y salud (UF)" },
  { clave: "tope_imponible_afc_uf", tipo: "uf", grupo: "topes", etiqueta: "Tope imponible seguro de cesantía (UF)" },
  { clave: "tasa_afp_obligatoria", tipo: "tasa", grupo: "trabajador", etiqueta: "Cotización obligatoria AFP" },
  { clave: "tasa_salud_minima", tipo: "tasa", grupo: "trabajador", etiqueta: "Salud, mínimo legal" },
  { clave: "tasa_afc_trabajador_indefinido", tipo: "tasa", grupo: "trabajador", etiqueta: "Seguro de cesantía, trabajador (indefinido)" },
  { clave: "tasa_afc_empleador_indefinido", tipo: "tasa", grupo: "empleador", etiqueta: "Seguro de cesantía, empleador (indefinido)" },
  { clave: "tasa_afc_empleador_plazo_fijo", tipo: "tasa", grupo: "empleador", etiqueta: "Seguro de cesantía, empleador (plazo fijo)" },
  { clave: "tasa_sis", tipo: "tasa", grupo: "empleador", etiqueta: "SIS" },
  { clave: "tasa_expectativa_vida", tipo: "tasa", grupo: "empleador", etiqueta: "Cotización de expectativa de vida" },
  { clave: "tasa_rentabilidad_protegida", tipo: "tasa", grupo: "empleador", etiqueta: "Rentabilidad protegida" },
  { clave: "tasa_mutual_base", tipo: "tasa", grupo: "empleador", etiqueta: "Mutual, tasa base" },
  { clave: "tasa_mutual_adicional", tipo: "tasa", grupo: "empleador", etiqueta: "Mutual, adicional por riesgo" },
] as const;

export type ClaveCampo = (typeof CAMPOS)[number]["clave"];
export type GrupoCampo = (typeof CAMPOS)[number]["grupo"];

/** Factor como fracción (0,04) y rebaja en UTM: la tabla del SII. */
export type TramoImpuesto = {
  desdeUtm: number;
  hastaUtm: number | null;
  factor: number;
  rebajaUtm: number;
};

/** Tramos A, B, C, D en ese orden. Renta y monto en pesos. */
export type TramoAsignacionFamiliar = {
  rentaHasta: number | null;
  monto: number;
};

export type ParametrosPeriodo = {
  anio: number;
  mes: number;
  valores: Record<ClaveCampo, number>;
  comisionAfp: Record<RrhhAfp, number>;
  tramosImpuesto: TramoImpuesto[];
  tramosAsignacionFamiliar: TramoAsignacionFamiliar[];
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: string[] };

// ─────────────────────────────────────────────────────────────────────────
// Números escritos a mano
// ─────────────────────────────────────────────────────────────────────────

/**
 * Lee un número escrito como en Chile: coma decimal y punto de miles
 * ("39.485,65", "1,49", "69751"). Devuelve null si no es inequívoco.
 *
 * "1.49" se RECHAZA a propósito: con punto de miles, "1.49" no es un número
 * chileno válido, y adivinar si quiso decir 1,49 o 149 es justo el tipo de
 * error silencioso que esta pantalla no puede cometer. "0.135" sí calza como
 * miles (135); lo atrapa la validación del rango del campo.
 */
export function leerDecimal(texto: string): number | null {
  const t = texto.trim().replace(/[\s$%]/g, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Inverso de leerDecimal, sin separador de miles: 39485.65 → "39485,65". */
export function escribirDecimal(n: number): string {
  return String(n).replace(".", ",");
}

// ─────────────────────────────────────────────────────────────────────────
// Validación de tramos (la usan el formulario y la lectura desde la base)
// ─────────────────────────────────────────────────────────────────────────

export function validarTramosImpuesto(tramos: TramoImpuesto[]): string[] {
  const e: string[] = [];
  if (tramos.length === 0) return ["Faltan los tramos del impuesto único."];
  if (tramos[0].desdeUtm !== 0) e.push("Impuesto único: el primer tramo debe partir en 0 UTM.");
  tramos.forEach((t, i) => {
    const n = i + 1;
    const ultimo = i === tramos.length - 1;
    if (ultimo && t.hastaUtm !== null)
      e.push(`Impuesto único: el último tramo (${n}) debe quedar sin "hasta" (y más).`);
    if (!ultimo && t.hastaUtm === null)
      e.push(`Impuesto único: al tramo ${n} le falta el "hasta". Solo el último va sin tope.`);
    if (t.hastaUtm !== null && t.hastaUtm <= t.desdeUtm)
      e.push(`Impuesto único: en el tramo ${n}, "hasta" debe ser mayor que "desde".`);
    if (i > 0 && tramos[i - 1].hastaUtm !== null && t.desdeUtm !== tramos[i - 1].hastaUtm)
      e.push(`Impuesto único: el tramo ${n} debe partir donde termina el ${n - 1} (${escribirDecimal(tramos[i - 1].hastaUtm!)} UTM).`);
    if (!(t.factor >= 0 && t.factor < 1))
      e.push(`Impuesto único: el factor del tramo ${n} debe estar entre 0 y 1 (por ejemplo 0,04; usa coma para los decimales).`);
    if (i > 0 && t.factor < tramos[i - 1].factor)
      e.push(`Impuesto único: el factor del tramo ${n} no puede ser menor que el del tramo ${n - 1}.`);
    if (!(t.rebajaUtm >= 0))
      e.push(`Impuesto único: la rebaja del tramo ${n} no puede ser negativa.`);
  });
  return e;
}

export function validarTramosAsignacion(tramos: TramoAsignacionFamiliar[]): string[] {
  const e: string[] = [];
  if (tramos.length === 0) return ["Faltan los tramos de asignación familiar."];
  tramos.forEach((t, i) => {
    const nombre = `tramo ${letraTramo(i)}`;
    const ultimo = i === tramos.length - 1;
    if (ultimo && t.rentaHasta !== null)
      e.push(`Asignación familiar: el último tramo (${letraTramo(i)}) debe quedar sin renta tope.`);
    if (!ultimo && t.rentaHasta === null)
      e.push(`Asignación familiar: al ${nombre} le falta la renta tope. Solo el último va sin tope.`);
    if (t.rentaHasta !== null && !(Number.isInteger(t.rentaHasta) && t.rentaHasta > 0))
      e.push(`Asignación familiar: la renta tope del ${nombre} debe ser un monto en pesos.`);
    const anterior = tramos[i - 1]?.rentaHasta;
    if (i > 0 && t.rentaHasta !== null && anterior != null && t.rentaHasta <= anterior)
      e.push(`Asignación familiar: la renta tope del ${nombre} debe ser mayor que la del tramo ${letraTramo(i - 1)}.`);
    if (!(Number.isInteger(t.monto) && t.monto >= 0))
      e.push(`Asignación familiar: el monto del ${nombre} debe ser un monto en pesos (0 si no tiene).`);
    if (i > 0 && t.monto > tramos[i - 1].monto)
      e.push(`Asignación familiar: el monto del ${nombre} no puede ser mayor que el del tramo ${letraTramo(i - 1)}.`);
  });
  return e;
}

export function letraTramo(i: number): string {
  return String.fromCharCode(65 + i);
}

function validarValor(tipo: (typeof CAMPOS)[number]["tipo"], n: number): boolean {
  if (tipo === "pesos") return Number.isInteger(n) && n > 0;
  if (tipo === "uf") return n > 0;
  return n >= 0 && n < 100;
}

const MENSAJE_RANGO: Record<(typeof CAMPOS)[number]["tipo"], string> = {
  pesos: "debe ser un monto en pesos, sin decimales",
  uf: "debe ser mayor que 0",
  tasa: "debe ser un porcentaje entre 0 y 100 (10 = 10%)",
};

// ─────────────────────────────────────────────────────────────────────────
// Formulario (todo texto) → parámetros
// ─────────────────────────────────────────────────────────────────────────

export type FormularioParametros = {
  anio: number;
  mes: number;
  valores: Record<ClaveCampo, string>;
  comisionAfp: Record<RrhhAfp, string>;
  tramosImpuesto: { desde: string; hasta: string; factor: string; rebaja: string }[];
  tramosAsignacionFamiliar: { hasta: string; monto: string }[];
};

/**
 * Lee y valida el formulario completo. La Server Action lo vuelve a llamar
 * con lo que manda el cliente: el navegador no es fuente de verdad.
 */
export function leerFormulario(f: FormularioParametros): Resultado<ParametrosPeriodo> {
  const e: string[] = [];
  if (!leerCodigoPeriodo(codigoPeriodo(f.anio, f.mes))) e.push("El período no es válido.");

  const valores = {} as Record<ClaveCampo, number>;
  for (const c of CAMPOS) {
    const texto = f.valores[c.clave] ?? "";
    if (!texto.trim()) {
      e.push(`Falta: ${c.etiqueta}.`);
      continue;
    }
    const n = leerDecimal(texto);
    if (n === null) {
      e.push(`${c.etiqueta}: "${texto}" no es un número (usa coma para los decimales).`);
      continue;
    }
    if (!validarValor(c.tipo, n)) e.push(`${c.etiqueta}: ${MENSAJE_RANGO[c.tipo]}.`);
    valores[c.clave] = n;
  }

  const comisionAfp = {} as Record<RrhhAfp, number>;
  for (const afp of AFPS) {
    const texto = f.comisionAfp[afp] ?? "";
    const n = texto.trim() ? leerDecimal(texto) : null;
    if (!texto.trim()) e.push(`Falta la comisión de AFP ${NOMBRE_AFP[afp]}.`);
    else if (n === null || !validarValor("tasa", n))
      e.push(`Comisión de AFP ${NOMBRE_AFP[afp]}: "${texto}" debe ser un porcentaje (usa coma para los decimales).`);
    else comisionAfp[afp] = n;
  }

  const tramosImpuesto: TramoImpuesto[] = [];
  f.tramosImpuesto.forEach((t, i) => {
    const n = i + 1;
    const desde = leerDecimal(t.desde);
    const hasta = t.hasta.trim() ? leerDecimal(t.hasta) : null;
    const factor = leerDecimal(t.factor);
    const rebaja = leerDecimal(t.rebaja);
    if (desde === null || factor === null || rebaja === null || (t.hasta.trim() && hasta === null)) {
      e.push(`Impuesto único: al tramo ${n} le faltan datos o tiene un número mal escrito.`);
      return;
    }
    tramosImpuesto.push({ desdeUtm: desde, hastaUtm: hasta, factor, rebajaUtm: rebaja });
  });
  if (tramosImpuesto.length === f.tramosImpuesto.length) e.push(...validarTramosImpuesto(tramosImpuesto));

  const tramosAsignacionFamiliar: TramoAsignacionFamiliar[] = [];
  f.tramosAsignacionFamiliar.forEach((t, i) => {
    const hasta = t.hasta.trim() ? leerDecimal(t.hasta) : null;
    const monto = leerDecimal(t.monto);
    if (monto === null || (t.hasta.trim() && hasta === null)) {
      e.push(`Asignación familiar: al tramo ${letraTramo(i)} le faltan datos o tiene un número mal escrito.`);
      return;
    }
    tramosAsignacionFamiliar.push({ rentaHasta: hasta, monto });
  });
  if (tramosAsignacionFamiliar.length === f.tramosAsignacionFamiliar.length)
    e.push(...validarTramosAsignacion(tramosAsignacionFamiliar));

  if (e.length) return { ok: false, errores: e };
  return {
    ok: true,
    valor: { anio: f.anio, mes: f.mes, valores, comisionAfp, tramosImpuesto, tramosAsignacionFamiliar },
  };
}

export function formularioVacio(anio: number, mes: number): FormularioParametros {
  return {
    anio,
    mes,
    valores: Object.fromEntries(CAMPOS.map((c) => [c.clave, ""])) as Record<ClaveCampo, string>,
    comisionAfp: Object.fromEntries(AFPS.map((a) => [a, ""])) as Record<RrhhAfp, string>,
    tramosImpuesto: [{ desde: "0", hasta: "", factor: "", rebaja: "" }],
    tramosAsignacionFamiliar: [{ hasta: "", monto: "" }],
  };
}

export function aFormulario(p: ParametrosPeriodo): FormularioParametros {
  return {
    anio: p.anio,
    mes: p.mes,
    valores: Object.fromEntries(
      CAMPOS.map((c) => [c.clave, escribirDecimal(p.valores[c.clave])]),
    ) as Record<ClaveCampo, string>,
    comisionAfp: Object.fromEntries(
      AFPS.map((a) => [a, escribirDecimal(p.comisionAfp[a])]),
    ) as Record<RrhhAfp, string>,
    tramosImpuesto: p.tramosImpuesto.map(tramoImpuestoATexto),
    tramosAsignacionFamiliar: p.tramosAsignacionFamiliar.map(tramoAsignacionATexto),
  };
}

function tramoImpuestoATexto(t: TramoImpuesto) {
  return {
    desde: escribirDecimal(t.desdeUtm),
    hasta: t.hastaUtm === null ? "" : escribirDecimal(t.hastaUtm),
    factor: escribirDecimal(t.factor),
    rebaja: escribirDecimal(t.rebajaUtm),
  };
}

function tramoAsignacionATexto(t: TramoAsignacionFamiliar) {
  return {
    hasta: t.rentaHasta === null ? "" : escribirDecimal(t.rentaHasta),
    monto: escribirDecimal(t.monto),
  };
}

/** Campos que cambian todos los meses: NO se copian del período anterior. */
export const CAMPOS_SIEMPRE_NUEVOS = ["uf_mes_anterior", "uf_mes", "utm"] as const satisfies readonly ClaveCampo[];

/**
 * Base para cargar un período nuevo a partir del anterior: copia todo menos
 * UF y UTM, que quedan vacías y obligan a escribirlas. El resto (tasas,
 * topes, tramos) también puede cambiar; la pantalla avisa que hay que
 * revisarlo contra el PDF de Previred del mes.
 */
export function copiarParaNuevoPeriodo(
  anterior: ParametrosPeriodo,
  anio: number,
  mes: number,
): FormularioParametros {
  const f = aFormulario(anterior);
  for (const c of CAMPOS_SIEMPRE_NUEVOS) f.valores[c] = "";
  return { ...f, anio, mes };
}

// ─────────────────────────────────────────────────────────────────────────
// Base de datos → parámetros
// ─────────────────────────────────────────────────────────────────────────

type FilaPeriodo = Tables<"rrhh_parametros_periodo">;
type FilaAfp = Pick<Tables<"rrhh_afp_periodo">, "afp" | "comision">;

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function leerTramosImpuesto(json: Json): TramoImpuesto[] | null {
  if (!Array.isArray(json)) return null;
  const out: TramoImpuesto[] = [];
  for (const t of json) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return null;
    const { desde_utm, hasta_utm, factor, rebaja_utm } = t;
    if (!esNumero(desde_utm) || !esNumero(factor) || !esNumero(rebaja_utm)) return null;
    const hasta = hasta_utm === null ? null : esNumero(hasta_utm) ? hasta_utm : undefined;
    if (hasta === undefined) return null;
    out.push({ desdeUtm: desde_utm, hastaUtm: hasta, factor, rebajaUtm: rebaja_utm });
  }
  return out;
}

function leerTramosAsignacion(json: Json): TramoAsignacionFamiliar[] | null {
  if (!Array.isArray(json)) return null;
  const out: TramoAsignacionFamiliar[] = [];
  for (const t of json) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return null;
    const { renta_hasta, monto } = t;
    if (!esNumero(monto)) return null;
    const hasta = renta_hasta === null ? null : esNumero(renta_hasta) ? renta_hasta : undefined;
    if (hasta === undefined) return null;
    out.push({ rentaHasta: hasta, monto });
  }
  return out;
}

/** Forma de los jsonb en la base (snake_case, como el resto de la tabla). */
export function tramosParaBase(p: ParametrosPeriodo) {
  return {
    tramos_impuesto: p.tramosImpuesto.map((t) => ({
      desde_utm: t.desdeUtm,
      hasta_utm: t.hastaUtm,
      factor: t.factor,
      rebaja_utm: t.rebajaUtm,
    })),
    tramos_asignacion_familiar: p.tramosAsignacionFamiliar.map((t) => ({
      renta_hasta: t.rentaHasta,
      monto: t.monto,
    })),
  };
}

/**
 * Para EDITAR un período ya guardado: vuelca a texto todo lo que haya, sin
 * exigir que esté completo (si quedó a medias, la pantalla tiene que poder
 * mostrar lo que hay y completarlo). Nunca se usa para calcular: eso pasa
 * solo por `desdeBase`.
 */
export function formularioDesdeBase(fila: FilaPeriodo, afps: FilaAfp[]): FormularioParametros {
  const f = formularioVacio(fila.anio, fila.mes);
  for (const c of CAMPOS) {
    const v = fila[c.clave];
    if (esNumero(v)) f.valores[c.clave] = escribirDecimal(v);
  }
  for (const a of afps) f.comisionAfp[a.afp] = escribirDecimal(a.comision);
  const ti = leerTramosImpuesto(fila.tramos_impuesto);
  const ta = leerTramosAsignacion(fila.tramos_asignacion_familiar);
  if (ti?.length) f.tramosImpuesto = ti.map(tramoImpuestoATexto);
  if (ta?.length) f.tramosAsignacionFamiliar = ta.map(tramoAsignacionATexto);
  return f;
}

/**
 * Arma los parámetros de un período desde las filas de la base, o explica
 * qué falta. Es el ÚNICO camino por el que el cálculo obtiene parámetros:
 * sin fila, con una AFP sin comisión o con tramos mal formados, no hay
 * cálculo — hay un mensaje que se puede mostrar tal cual.
 */
export function desdeBase(
  anio: number,
  mes: number,
  fila: FilaPeriodo | null,
  afps: FilaAfp[],
): Resultado<ParametrosPeriodo> {
  const periodo = nombrePeriodo(anio, mes);
  if (!fila) return { ok: false, errores: [`Faltan los parámetros previsionales de ${periodo}.`] };

  const e: string[] = [];
  const valores = {} as Record<ClaveCampo, number>;
  for (const c of CAMPOS) {
    const v = fila[c.clave];
    if (!esNumero(v) || !validarValor(c.tipo, v)) e.push(`${c.etiqueta} de ${periodo} no es válido.`);
    else valores[c.clave] = v;
  }

  const comisionAfp = {} as Record<RrhhAfp, number>;
  for (const a of afps) comisionAfp[a.afp] = a.comision;
  const faltantes = AFPS.filter((a) => !esNumero(comisionAfp[a]));
  if (faltantes.length)
    e.push(
      `Faltan las comisiones de AFP ${faltantes.map((a) => NOMBRE_AFP[a]).join(", ")} de ${periodo}.`,
    );

  const tramosImpuesto = leerTramosImpuesto(fila.tramos_impuesto);
  if (!tramosImpuesto) e.push(`Los tramos del impuesto único de ${periodo} están mal formados.`);
  else e.push(...validarTramosImpuesto(tramosImpuesto).map((m) => `${m} (${periodo})`));

  const tramosAsignacionFamiliar = leerTramosAsignacion(fila.tramos_asignacion_familiar);
  if (!tramosAsignacionFamiliar) e.push(`Los tramos de asignación familiar de ${periodo} están mal formados.`);
  else e.push(...validarTramosAsignacion(tramosAsignacionFamiliar).map((m) => `${m} (${periodo})`));

  if (e.length) return { ok: false, errores: e };
  return {
    ok: true,
    valor: {
      anio,
      mes,
      valores,
      comisionAfp,
      tramosImpuesto: tramosImpuesto!,
      tramosAsignacionFamiliar: tramosAsignacionFamiliar!,
    },
  };
}
