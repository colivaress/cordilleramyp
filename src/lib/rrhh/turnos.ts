import { fechaCorta, fechaValida } from "./ficha.ts";
import type { Resultado } from "./parametros.ts";

/**
 * Turnos rotativos (spec RRHH §8). Lógica pura.
 *
 * Una asignación cubre el rango CERRADO [vigente_desde, vigente_hasta];
 * hasta nulo = hasta nuevo aviso. Las anuladas no cubren nada. La base
 * impide que dos asignaciones vigentes de una persona cubran el mismo día
 * (rrhh_jornada_trabajador_sin_solape); acá se valida ANTES de escribir,
 * para poder decir quién choca con qué en vez de un error de restricción.
 *
 * Un día sin asignación es un ERROR con nombre y fecha, nunca un valor por
 * defecto: si no se sabe qué jornada tenía, no se pueden medir sus horas.
 */

export type Asignacion = {
  id: string;
  personal_id: string;
  jornada_id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  anulada_en: string | null;
};

export type Rango = { desde: string; hasta: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Suma días a una fecha "YYYY-MM-DD" (sin husos: aritmética de calendario). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** ¿Se tocan dos rangos cerrados? Un día en común basta. */
export function seSolapan(a: Rango, b: Rango): boolean {
  return (a.hasta === null || b.desde <= a.hasta) && (b.hasta === null || a.desde <= b.hasta);
}

export function cubre(a: Asignacion, fecha: string): boolean {
  return a.anulada_en === null && a.vigente_desde <= fecha && (a.vigente_hasta === null || fecha <= a.vigente_hasta);
}

/** La asignación vigente ese día, o null. Nunca hay dos (lo impide la base). */
export function asignacionDelDia<T extends Asignacion>(asignaciones: readonly T[], fecha: string): T | null {
  return asignaciones.find((a) => cubre(a, fecha)) ?? null;
}

/**
 * La jornada de una persona un día dado, o el error que hay que mostrar.
 * Es la única puerta para el cálculo de horas: un hueco falla aquí.
 */
export function jornadaDelDia<T extends Asignacion>(
  asignaciones: readonly T[],
  fecha: string,
  nombrePersona: string,
): Resultado<T> {
  const a = asignacionDelDia(asignaciones, fecha);
  if (!a) return { ok: false, errores: [`El ${fechaCorta(fecha)} ${nombrePersona} no tiene jornada asignada.`] };
  return { ok: true, valor: a };
}

/** Tramos de días seguidos SIN asignación dentro de [desde, hasta]. */
export function tramosSinJornada(asignaciones: readonly Asignacion[], desde: string, hasta: string): { desde: string; hasta: string }[] {
  const tramos: { desde: string; hasta: string }[] = [];
  let abierto: { desde: string; hasta: string } | null = null;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    if (asignacionDelDia(asignaciones, d)) {
      abierto = null;
    } else if (abierto) {
      abierto.hasta = d;
    } else {
      abierto = { desde: d, hasta: d };
      tramos.push(abierto);
    }
  }
  return tramos;
}

/** "El 14-11-2026 Juan Pérez…" o "Del 14-11-2026 al 20-11-2026 Juan Pérez…". */
export function textoSinJornada(tramo: { desde: string; hasta: string }, nombrePersona: string): string {
  return tramo.desde === tramo.hasta
    ? `El ${fechaCorta(tramo.desde)} ${nombrePersona} no tiene jornada asignada.`
    : `Del ${fechaCorta(tramo.desde)} al ${fechaCorta(tramo.hasta)} ${nombrePersona} no tiene jornada asignada.`;
}

/** Lunes a domingo de la semana de `hoy`. */
export function rangoSemana(hoy: string): { desde: string; hasta: string } {
  const diaIso = ((new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = lunes
  const desde = sumarDias(hoy, 1 - diaIso);
  return { desde, hasta: sumarDias(desde, 6) };
}

/** Primer y último día del mes de `fecha` (o de "YYYY-MM"). */
export function rangoMes(fecha: string): { desde: string; hasta: string } {
  const [a, m] = fecha.split("-").map(Number);
  const desde = `${a}-${String(m).padStart(2, "0")}-01`;
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

export type FormularioTurno = {
  jornadaId: string;
  desde: string;
  /** Vacío = hasta nuevo aviso. */
  hasta: string;
  personalIds: string[];
};

export type TurnoValido = { jornadaId: string; desde: string; hasta: string | null; personalIds: string[] };

export function leerTurno(f: FormularioTurno): Resultado<TurnoValido> {
  const e: string[] = [];
  if (!UUID.test(f.jornadaId)) e.push("Elige la jornada.");
  if (!fechaValida(f.desde)) e.push("Elige desde qué fecha.");
  const hasta = f.hasta.trim() || null;
  if (hasta !== null && !fechaValida(hasta)) e.push("La fecha de término no es válida.");
  else if (hasta !== null && fechaValida(f.desde) && hasta < f.desde) e.push("La fecha de término es anterior a la de inicio.");
  const ids = [...new Set(f.personalIds)];
  if (ids.length === 0) e.push("Marca al menos un trabajador.");
  if (ids.some((id) => !UUID.test(id))) e.push("Hay un trabajador no válido en la lista.");
  if (e.length) return { ok: false, errores: e };
  return { ok: true, valor: { jornadaId: f.jornadaId, desde: f.desde, hasta, personalIds: ids } };
}

/** Asignaciones vigentes de esas personas que chocan con el rango nuevo. */
export function conflictos<T extends Asignacion>(existentes: readonly T[], personalIds: readonly string[], rango: Rango): T[] {
  const ids = new Set(personalIds);
  return existentes.filter(
    (a) => ids.has(a.personal_id) && a.anulada_en === null && seSolapan({ desde: a.vigente_desde, hasta: a.vigente_hasta }, rango),
  );
}
