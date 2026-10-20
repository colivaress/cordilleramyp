import type { Json } from "@/lib/supabase/database.types";
import type { Resultado } from "./parametros.ts";

/**
 * Jornadas (spec RRHH §8): patrones con horario por día. Lógica pura.
 *
 * Las horas semanales NO se guardan: se derivan siempre del horario, para
 * que no existan dos versiones del mismo dato. Las horas extra (fase 6) se
 * miden contra la jornada asignada al trabajador ese día, no contra un
 * divisor fijo.
 */

/** 1 = lunes … 7 = domingo (ISO). */
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const;
export const NOMBRE_DIA: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export type DiaJornada = {
  dia: number;
  /** "HH:MM" */
  entrada: string;
  /** "HH:MM". Si es menor que la entrada, el turno cruza la medianoche. */
  salida: string;
  colacion_minutos: number;
};

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos efectivos de un día: de entrada a salida, menos la colación. */
export function minutosDia(d: DiaJornada): number {
  let duracion = aMinutos(d.salida) - aMinutos(d.entrada);
  if (duracion <= 0) duracion += 24 * 60; // cruza la medianoche
  return duracion - d.colacion_minutos;
}

export function horasSemanales(dias: DiaJornada[]): number {
  return dias.reduce((total, d) => total + minutosDia(d), 0) / 60;
}

export function validarDias(dias: DiaJornada[]): string[] {
  const e: string[] = [];
  if (dias.length === 0) return ["La jornada necesita al menos un día de trabajo."];
  const vistos = new Set<number>();
  for (const d of dias) {
    const nombre = NOMBRE_DIA[d.dia] ?? `día ${d.dia}`;
    if (!DIAS_SEMANA.includes(d.dia as (typeof DIAS_SEMANA)[number])) {
      e.push(`Día inválido: ${d.dia}.`);
      continue;
    }
    if (vistos.has(d.dia)) e.push(`${nombre} está repetido.`);
    vistos.add(d.dia);
    if (!HORA.test(d.entrada) || !HORA.test(d.salida)) {
      e.push(`${nombre}: la entrada y la salida van en formato HH:MM (por ejemplo 08:30).`);
      continue;
    }
    if (d.entrada === d.salida) e.push(`${nombre}: la entrada y la salida no pueden ser iguales.`);
    if (!Number.isInteger(d.colacion_minutos) || d.colacion_minutos < 0)
      e.push(`${nombre}: la colación va en minutos enteros (0 si no tiene).`);
    else if (d.entrada !== d.salida && minutosDia(d) <= 0)
      e.push(`${nombre}: la colación es más larga que el turno.`);
  }
  return e;
}

/** Lee el jsonb de rrhh_jornadas.dias; `null` si no tiene la forma esperada. */
export function leerDias(json: Json): DiaJornada[] | null {
  if (!Array.isArray(json)) return null;
  const out: DiaJornada[] = [];
  for (const d of json) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const { dia, entrada, salida, colacion_minutos } = d;
    if (typeof dia !== "number" || typeof entrada !== "string" || typeof salida !== "string" || typeof colacion_minutos !== "number")
      return null;
    out.push({ dia, entrada, salida, colacion_minutos });
  }
  return out;
}

export type FormularioJornada = {
  nombre: string;
  dias: { dia: number; trabaja: boolean; entrada: string; salida: string; colacion: string }[];
};

export function formularioJornadaVacio(): FormularioJornada {
  return {
    nombre: "",
    dias: DIAS_SEMANA.map((dia) => ({ dia, trabaja: false, entrada: "", salida: "", colacion: "" })),
  };
}

export function leerFormularioJornada(
  f: FormularioJornada,
): Resultado<{ nombre: string; dias: DiaJornada[] }> {
  const e: string[] = [];
  const nombre = f.nombre.trim();
  if (!nombre) e.push("Falta el nombre de la jornada.");
  const dias: DiaJornada[] = [];
  for (const d of f.dias.filter((x) => x.trabaja)) {
    const colacion = d.colacion.trim() === "" ? NaN : Number(d.colacion.trim());
    if (Number.isNaN(colacion)) {
      e.push(`${NOMBRE_DIA[d.dia]}: falta la colación en minutos (0 si no tiene).`);
      continue;
    }
    dias.push({ dia: d.dia, entrada: d.entrada.trim(), salida: d.salida.trim(), colacion_minutos: colacion });
  }
  e.push(...validarDias(dias));
  if (e.length) return { ok: false, errores: e };
  return { ok: true, valor: { nombre, dias: dias.sort((a, b) => a.dia - b.dia) } };
}

/** Horario día por día ("Lun 08:00–17:30 (−30 min) · …"), sin agrupar días
 *  para no esconder diferencias entre ellos. */
export function describirDias(dias: DiaJornada[]): string {
  return dias
    .map((d) => `${NOMBRE_DIA[d.dia].slice(0, 3)} ${d.entrada}–${d.salida}${d.colacion_minutos ? ` (−${d.colacion_minutos} min)` : ""}`)
    .join(" · ");
}
