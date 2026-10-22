import type { Enums } from "@/lib/supabase/database.types";
import { AFPS, leerDecimal, type Resultado, type RrhhAfp } from "./parametros.ts";

/**
 * Ficha del trabajador (spec RRHH fase 3). Lógica pura: validación de los
 * formularios, vigencias y antigüedad. La usan las Server Actions (que
 * vuelven a validar todo: el navegador no es fuente de verdad) y las
 * pantallas.
 */

export type TipoContrato = Enums<"rrhh_tipo_contrato">;
export type SistemaSalud = Enums<"rrhh_sistema_salud">;

export const TIPOS_CONTRATO = ["indefinido", "plazo_fijo", "obra_faena"] as const satisfies readonly TipoContrato[];
export const ETIQUETA_TIPO_CONTRATO: Record<TipoContrato, string> = {
  indefinido: "Indefinido",
  plazo_fijo: "Plazo fijo",
  obra_faena: "Obra o faena",
};

export const SISTEMAS_SALUD = ["fonasa", "isapre"] as const satisfies readonly SistemaSalud[];
export const ETIQUETA_SALUD: Record<SistemaSalud, string> = { fonasa: "Fonasa", isapre: "Isapre" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "AAAA-MM-DD" real (rechaza 2026-02-30). */
export function fechaValida(texto: string): boolean {
  if (!FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// ─────────────────────────────────────────────────────────────────────────
// Datos contractuales y previsionales
// ─────────────────────────────────────────────────────────────────────────

// El RUT ya no es parte de la ficha: identifica a la persona y vive en
// personal (sección "Cuenta y acceso"). Cargo y faena son ids de catálogo.
export type FormularioFicha = {
  cargo_id: string;
  faena_id: string;
  fecha_ingreso: string;
  tipo_contrato: string;
  fecha_termino_contrato: string;
  afp: string;
  sistema_salud: string;
  isapre: string;
  plan_isapre_uf: string;
  afecto_afc: boolean;
  cargas_familiares: string;
};

export type FichaValida = {
  cargo_id: string;
  faena_id: string | null;
  fecha_ingreso: string;
  tipo_contrato: TipoContrato;
  fecha_termino_contrato: string | null;
  afp: RrhhAfp;
  sistema_salud: SistemaSalud;
  isapre: string | null;
  plan_isapre_uf: number | null;
  afecto_afc: boolean;
  cargas_familiares: number;
};

export function leerFicha(f: FormularioFicha): Resultado<FichaValida> {
  const e: string[] = [];

  if (!UUID.test(f.cargo_id)) e.push("Elige el cargo.");
  const faena = f.faena_id.trim();
  if (faena && !UUID.test(faena)) e.push("La faena elegida no es válida.");

  if (!fechaValida(f.fecha_ingreso)) e.push("Falta la fecha de ingreso o no es válida.");

  const tipo = f.tipo_contrato as TipoContrato;
  if (!TIPOS_CONTRATO.includes(tipo)) e.push("Elige el tipo de contrato.");

  const termino = f.fecha_termino_contrato.trim();
  if (tipo === "plazo_fijo" && !termino) e.push("Un contrato a plazo fijo necesita fecha de término.");
  if (tipo === "indefinido" && termino) e.push("Un contrato indefinido no lleva fecha de término.");
  if (termino && !fechaValida(termino)) e.push("La fecha de término no es válida.");
  if (termino && fechaValida(termino) && fechaValida(f.fecha_ingreso) && termino < f.fecha_ingreso)
    e.push("La fecha de término no puede ser anterior al ingreso.");

  const afp = f.afp as RrhhAfp;
  if (!AFPS.includes(afp)) e.push("Elige la AFP.");

  const salud = f.sistema_salud as SistemaSalud;
  if (!SISTEMAS_SALUD.includes(salud)) e.push("Elige el sistema de salud.");

  const isapre = f.isapre.trim();
  let plan: number | null = null;
  if (salud === "isapre") {
    if (!isapre) e.push("Falta el nombre de la Isapre.");
    if (!f.plan_isapre_uf.trim()) e.push("Falta el plan de la Isapre en UF.");
    else {
      plan = leerDecimal(f.plan_isapre_uf);
      if (plan === null || !(plan > 0)) e.push("El plan de la Isapre debe ser un valor en UF mayor que 0, con coma decimal.");
    }
  }

  const cargas = Number(f.cargas_familiares.trim() || "0");
  if (!Number.isInteger(cargas) || cargas < 0 || cargas > 30) e.push("Las cargas familiares deben ser un número entero entre 0 y 30.");

  if (e.length) return { ok: false, errores: e };
  return {
    ok: true,
    valor: {
      cargo_id: f.cargo_id,
      faena_id: faena || null,
      fecha_ingreso: f.fecha_ingreso,
      tipo_contrato: tipo,
      fecha_termino_contrato: tipo === "indefinido" ? null : termino || null,
      afp,
      sistema_salud: salud,
      isapre: salud === "isapre" ? isapre : null,
      plan_isapre_uf: salud === "isapre" ? plan : null,
      afecto_afc: f.afecto_afc,
      cargas_familiares: cargas,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Remuneración base (solo administrador). El sueldo se pacta en LÍQUIDO
// (§4-bis): la ficha guarda el líquido pactado; el bruto es un resultado
// de cada período y lo calcula el motor (fase 4).
// ─────────────────────────────────────────────────────────────────────────

/** Pesos enteros escritos a mano ("1.234.567"). `null` si no es eso. */
export function leerPesos(texto: string): number | null {
  const n = leerDecimal(texto);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

export type FormularioRemuneracion = {
  /** "AAAA-MM": el cambio rige desde ese mes completo. */
  vigente_desde: string;
  liquido_pactado: string;
  colacion: string;
  movilizacion: string;
  comentario: string;
};

export type RemuneracionValida = {
  vigente_desde: string;
  liquido_pactado: number;
  colacion: number;
  movilizacion: number;
  comentario: string;
};

export function leerRemuneracion(f: FormularioRemuneracion): Resultado<RemuneracionValida> {
  const e: string[] = [];
  const mes = /^(\d{4})-(\d{2})$/.exec(f.vigente_desde.trim());
  if (!mes || Number(mes[2]) < 1 || Number(mes[2]) > 12) e.push("Elige el mes desde el que rige.");

  const liquido = leerPesos(f.liquido_pactado);
  if (!f.liquido_pactado.trim()) e.push("Falta el sueldo líquido pactado.");
  else if (liquido === null || liquido <= 0) e.push("El líquido pactado debe ser un monto en pesos mayor que 0.");

  // Colación y movilización pueden ser 0, pero no quedar en blanco: un
  // blanco no se interpreta como 0 en silencio.
  const colacion = leerPesos(f.colacion);
  if (!f.colacion.trim()) e.push("Falta la colación (escribe 0 si no tiene).");
  else if (colacion === null) e.push("La colación debe ser un monto en pesos.");
  const movilizacion = leerPesos(f.movilizacion);
  if (!f.movilizacion.trim()) e.push("Falta la movilización (escribe 0 si no tiene).");
  else if (movilizacion === null) e.push("La movilización debe ser un monto en pesos.");

  const comentario = f.comentario.trim();
  if (!comentario) e.push("Escribe el motivo del cambio: queda en el historial de sueldo.");

  if (e.length) return { ok: false, errores: e };
  return {
    ok: true,
    valor: {
      vigente_desde: `${f.vigente_desde.trim()}-01`,
      liquido_pactado: liquido!,
      colacion: colacion!,
      movilizacion: movilizacion!,
      comentario,
    },
  };
}

/**
 * La fila vigente en `fecha` de una tabla que solo se agrega (remuneración,
 * jornada): la de vigente_desde más reciente que no sea posterior a la
 * fecha y, si hay varias con la misma vigencia (una corrección), la
 * registrada último. `null` si ninguna rige todavía.
 */
/**
 * Cargo con que se abre el formulario del contrato, según el rol de la
 * persona. SOLO un valor inicial y editable, no una regla: rol (permisos,
 * lo cambia el administrador) y cargo (dato contractual, Art. 10 Nº3, lo
 * administra también el adm. de contrato) son cosas distintas, y el día que
 * haya dos cargos para un mismo rol este mapeo deja de valer. Por eso no se
 * impone en la base ni se recalcula al editar. Vacío si el cargo no está en
 * el catálogo o está desactivado.
 */
const CARGO_POR_ROL: Partial<Record<string, string>> = {
  administrador: "Administrador",
  administrador_contrato: "Administrador de contrato",
  supervisor: "Supervisor",
  trabajador: "Encarpador",
};

export function cargoSugerido(rol: string, cargos: readonly { id: string; nombre: string; activo: boolean }[]): string {
  const nombre = CARGO_POR_ROL[rol]?.toLowerCase();
  return (nombre && cargos.find((c) => c.activo && c.nombre.toLowerCase() === nombre)?.id) || "";
}

export function vigenteEn<T extends { vigente_desde: string; created_at: string }>(
  filas: T[],
  fecha: string,
): T | null {
  let mejor: T | null = null;
  for (const f of filas) {
    if (f.vigente_desde > fecha) continue;
    if (
      !mejor ||
      f.vigente_desde > mejor.vigente_desde ||
      (f.vigente_desde === mejor.vigente_desde && f.created_at > mejor.created_at)
    )
      mejor = f;
  }
  return mejor;
}

// ─────────────────────────────────────────────────────────────────────────
// Antigüedad (§16.8): de ella dependen el feriado progresivo y la
// indemnización, así que se muestra calculada, no se deja a la cuenta mental.
// ─────────────────────────────────────────────────────────────────────────

export function antiguedad(fechaIngreso: string, hasta: string): { anios: number; meses: number } {
  const [a1, m1, d1] = fechaIngreso.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  if (meses < 0) meses = 0;
  return { anios: Math.floor(meses / 12), meses: meses % 12 };
}

export function textoAntiguedad(fechaIngreso: string, hasta: string): string {
  const { anios, meses } = antiguedad(fechaIngreso, hasta);
  const a = `${anios} ${anios === 1 ? "año" : "años"}`;
  const m = `${meses} ${meses === 1 ? "mes" : "meses"}`;
  return `${a} y ${m} de servicio`;
}

/** "Juan Pérez" → "JP" (listado, §16.8). */
export function iniciales(nombre: string, apellido: string | null): string {
  return [nombre, apellido ?? ""]
    .map((p) => p.trim()[0] ?? "")
    .join("")
    .toUpperCase();
}

/** "AAAA-MM-DD" de hoy en Chile (el servidor corre en UTC). */
export function hoyChile(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** "2026-10-01" → "01-10-2026", como se muestran las fechas en la app. */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}-${m}-${a}`;
}
