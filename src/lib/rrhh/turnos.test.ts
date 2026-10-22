import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conflictos,
  erroresAntesDelIngreso,
  jornadaDelDia,
  leerTurno,
  rangoMes,
  rangoSemana,
  seSolapan,
  textoSinJornada,
  tramosSinJornada,
  type Asignacion,
} from "./turnos.ts";

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const J = "33333333-3333-4333-8333-333333333333";

const asig = (id: string, desde: string, hasta: string | null, extra: Partial<Asignacion> = {}): Asignacion => ({
  id,
  personal_id: P,
  jornada_id: J,
  vigente_desde: desde,
  vigente_hasta: hasta,
  anulada_en: null,
  ...extra,
});

test("solape: rangos cerrados, un día en común basta; hasta nulo es infinito", () => {
  assert.equal(seSolapan({ desde: "2026-11-01", hasta: "2026-11-07" }, { desde: "2026-11-07", hasta: "2026-11-14" }), true);
  assert.equal(seSolapan({ desde: "2026-11-01", hasta: "2026-11-07" }, { desde: "2026-11-08", hasta: "2026-11-14" }), false);
  assert.equal(seSolapan({ desde: "2026-11-01", hasta: null }, { desde: "2030-01-01", hasta: "2030-01-02" }), true);
  assert.equal(seSolapan({ desde: "2026-11-10", hasta: null }, { desde: "2026-11-01", hasta: "2026-11-09" }), false);
});

test("un día sin jornada falla con la persona y la fecha, nunca con un valor por defecto", () => {
  const filas = [asig("a", "2026-11-01", "2026-11-13"), asig("b", "2026-11-15", null)];
  assert.deepEqual(jornadaDelDia(filas, "2026-11-14", "Juan Pérez"), {
    ok: false,
    errores: ["El 14-11-2026 Juan Pérez no tiene jornada asignada."],
  });
  const r = jornadaDelDia(filas, "2026-11-13", "Juan Pérez");
  assert.equal(r.ok && r.valor.id, "a");
  assert.equal(jornadaDelDia(filas, "2027-03-01", "Juan Pérez").ok, true);
});

test("una asignación anulada no cubre ningún día", () => {
  const filas = [asig("a", "2026-11-01", "2026-11-30", { anulada_en: "2026-10-30T12:00:00Z" })];
  assert.equal(jornadaDelDia(filas, "2026-11-05", "Ana").ok, false);
});

test("tramos sin jornada: días seguidos agrupados, con texto legible", () => {
  const filas = [asig("a", "2026-11-03", "2026-11-05"), asig("b", "2026-11-08", null)];
  const tramos = tramosSinJornada(filas, "2026-11-01", "2026-11-10");
  assert.deepEqual(tramos, [
    { desde: "2026-11-01", hasta: "2026-11-02" },
    { desde: "2026-11-06", hasta: "2026-11-07" },
  ]);
  assert.equal(textoSinJornada(tramos[0], "Ana Soto"), "Del 01-11-2026 al 02-11-2026 Ana Soto no tiene jornada asignada.");
  assert.equal(textoSinJornada({ desde: "2026-11-14", hasta: "2026-11-14" }, "Ana Soto"), "El 14-11-2026 Ana Soto no tiene jornada asignada.");
});

test("atajos: semana de lunes a domingo, mes completo (incluido febrero bisiesto)", () => {
  assert.deepEqual(rangoSemana("2026-10-22"), { desde: "2026-10-19", hasta: "2026-10-25" }); // jueves
  assert.deepEqual(rangoSemana("2026-10-25"), { desde: "2026-10-19", hasta: "2026-10-25" }); // domingo
  assert.deepEqual(rangoMes("2026-12-15"), { desde: "2026-12-01", hasta: "2026-12-31" });
  assert.deepEqual(rangoMes("2028-02"), { desde: "2028-02-01", hasta: "2028-02-29" });
});

test("conflictos: solo las vigentes de las personas marcadas que tocan el rango", () => {
  const existentes = [
    asig("a", "2026-11-01", "2026-11-07"),
    asig("b", "2026-11-20", null),
    asig("c", "2026-11-01", "2026-11-30", { personal_id: Q }),
    asig("d", "2026-11-08", "2026-11-14", { anulada_en: "2026-10-01T00:00:00Z" }),
  ];
  const r = conflictos(existentes, [P], { desde: "2026-11-07", hasta: "2026-11-14" });
  assert.deepEqual(r.map((x) => x.id), ["a"]);
  const abierto = conflictos(existentes, [P, Q], { desde: "2026-11-15", hasta: null });
  assert.deepEqual(abierto.map((x) => x.id), ["b", "c"]);
});

test("un turno no empieza antes del ingreso: error por persona, con su nombre", () => {
  const personas = [
    { nombre: "Ana Soto", fecha_ingreso: "2026-12-01" },
    { nombre: "Luis Rojas", fecha_ingreso: "2026-11-01" },
    { nombre: "Juan Pérez", fecha_ingreso: "2019-03-15" },
  ];
  assert.deepEqual(erroresAntesDelIngreso(personas, "2026-11-01"), [
    "Ana Soto ingresó el 01-12-2026: el turno no puede empezar antes.",
  ]);
  assert.deepEqual(erroresAntesDelIngreso(personas, "2026-10-31").length, 2);
  // Empezar el mismo día del ingreso sí vale.
  assert.deepEqual(erroresAntesDelIngreso(personas, "2026-12-01"), []);
});

test("formulario de turno: valida jornada, fechas, orden y al menos un trabajador", () => {
  assert.deepEqual(leerTurno({ jornadaId: "", desde: "2026-02-30", hasta: "", personalIds: [] }), {
    ok: false,
    errores: ["Elige la jornada.", "Elige desde qué fecha.", "Marca al menos un trabajador."],
  });
  assert.deepEqual(leerTurno({ jornadaId: J, desde: "2026-11-10", hasta: "2026-11-09", personalIds: [P] }), {
    ok: false,
    errores: ["La fecha de término es anterior a la de inicio."],
  });
  const r = leerTurno({ jornadaId: J, desde: "2026-11-10", hasta: "", personalIds: [P, P, Q] });
  assert.deepEqual(r, { ok: true, valor: { jornadaId: J, desde: "2026-11-10", hasta: null, personalIds: [P, Q] } });
});
