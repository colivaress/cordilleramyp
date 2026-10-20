import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aFormulario,
  copiarParaNuevoPeriodo,
  desdeBase,
  formularioDesdeBase,
  leerCodigoPeriodo,
  leerDecimal,
  leerFormulario,
  mutualAdicionalVigente,
  planCambioMutual,
  type FormularioParametros,
} from "./parametros.ts";
// Valores FICTICIOS: viven en un archivo aparte que lo dice en el nombre.
import { filasFicticias, formularioFicticio } from "./parametros-ficticios.prueba.ts";

function conFormulario(cambio: (f: FormularioParametros) => void) {
  const f = formularioFicticio();
  cambio(f);
  return leerFormulario(f);
}

test("leerDecimal: coma decimal y punto de miles, como en Chile", () => {
  assert.equal(leerDecimal("39.485,65"), 39485.65);
  assert.equal(leerDecimal("1,49"), 1.49);
  assert.equal(leerDecimal("69751"), 69751);
  assert.equal(leerDecimal("69.751"), 69751);
  assert.equal(leerDecimal(" $ 1.234.567 "), 1234567);
  assert.equal(leerDecimal("10 %"), 10);
});

test("leerDecimal: rechaza lo ambiguo en vez de adivinar", () => {
  // "1.49" puede ser 1,49 o 149: no se adivina.
  assert.equal(leerDecimal("1.49"), null);
  assert.equal(leerDecimal("81.6"), null);
  assert.equal(leerDecimal("1,2,3"), null);
  assert.equal(leerDecimal("-5"), null);
  assert.equal(leerDecimal(""), null);
  assert.equal(leerDecimal("abc"), null);
});

test("leerCodigoPeriodo valida año y mes", () => {
  assert.deepEqual(leerCodigoPeriodo("2026-10"), { anio: 2026, mes: 10 });
  assert.equal(leerCodigoPeriodo("2026-13"), null);
  assert.equal(leerCodigoPeriodo("2026-1"), null);
  assert.equal(leerCodigoPeriodo("1999-01"), null);
});

test("un formulario completo se lee con los números correctos", () => {
  const r = leerFormulario(formularioFicticio());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.valor.valores.uf_mes_anterior, 10000.5);
  assert.equal(r.valor.valores.utm, 50000);
  assert.equal(r.valor.valores.tasa_sis, 1.5);
  assert.equal(r.valor.comisionAfp.uno, 0.7);
  assert.deepEqual(r.valor.tramosImpuesto[2], { desdeUtm: 20, hastaUtm: null, factor: 0.2, rebajaUtm: 3 });
  assert.deepEqual(r.valor.tramosAsignacionFamiliar[0], { rentaHasta: 100000, monto: 5000 });
});

test("un campo vacío no cae a un valor por defecto: es un error con nombre", () => {
  const r = conFormulario((f) => (f.valores.utm = ""));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errores, ["Falta: UTM."]);
});

test("una AFP sin comisión impide guardar", () => {
  const r = conFormulario((f) => (f.comisionAfp.modelo = " "));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errores, ["Falta la comisión de AFP Modelo."]);
});

test("rangos: UTM con decimales, tasa sobre 100 y punto decimal se rechazan", () => {
  const r = conFormulario((f) => {
    f.valores.utm = "50.000,5";
    f.valores.tasa_sis = "150";
    f.valores.tasa_salud_minima = "7.5";
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errores.length, 3);
  assert.match(r.errores.join("\n"), /UTM: debe ser un monto en pesos/);
  assert.match(r.errores.join("\n"), /SIS: debe ser un porcentaje/);
  assert.match(r.errores.join("\n"), /"7.5" no es un número/);
});

test("tramos de impuesto: deben ser contiguos, partir en 0 y terminar sin tope", () => {
  let r = conFormulario((f) => (f.tramosImpuesto[1].desde = "11"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /tramo 2 debe partir donde termina el 1/);

  r = conFormulario((f) => (f.tramosImpuesto[0].desde = "1"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /primer tramo debe partir en 0/);

  r = conFormulario((f) => (f.tramosImpuesto[2].hasta = "30"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /último tramo \(3\) debe quedar sin "hasta"/);

  r = conFormulario((f) => (f.tramosImpuesto[1].hasta = ""));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /al tramo 2 le falta el "hasta"/);
});

test("tramos de impuesto: un factor escrito como porcentaje (10 en vez de 0,1) se rechaza", () => {
  const r = conFormulario((f) => (f.tramosImpuesto[1].factor = "10"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /factor del tramo 2 debe estar entre 0 y 1/);
});

test("asignación familiar: rentas crecientes y montos que no suben", () => {
  let r = conFormulario((f) => (f.tramosAsignacionFamiliar[1].hasta = "50.000"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /renta tope del tramo B debe ser mayor que la del tramo A/);

  r = conFormulario((f) => (f.tramosAsignacionFamiliar[1].monto = "9.000"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores.join("\n"), /monto del tramo B no puede ser mayor que el del tramo A/);
});

// ── Lectura desde la base: lo que usará el cálculo ──────────────────────

function filaDePrueba() {
  const { parametros, periodo, afps } = filasFicticias();
  return {
    p: parametros,
    fila: { ...periodo, created_at: "", updated_at: "", updated_by: null },
    afps: afps.map(({ afp, comision }) => ({ afp, comision })),
  };
}

test("con un período a medias, al editarlo se ve lo que hay y falta lo demás", () => {
  const { fila } = filaDePrueba();
  const f = formularioDesdeBase(fila, [{ afp: "uno", comision: 0.7 }]);
  assert.equal(f.valores.utm, "50000");
  assert.equal(f.comisionAfp.uno, "0,7");
  assert.equal(f.comisionAfp.capital, "");
  assert.equal(f.tramosImpuesto.length, 3);
});

test("sin fila del período, el cálculo recibe un mensaje claro y no un default", () => {
  const r = desdeBase(2026, 10, null, []);
  assert.deepEqual(r, { ok: false, errores: ["Faltan los parámetros previsionales de octubre 2026."] });
});

test("ida y vuelta: lo guardado se lee igual a lo que se validó", () => {
  const { p, fila, afps } = filaDePrueba();
  assert.deepEqual(desdeBase(2026, 10, fila, afps), { ok: true, valor: p });
});

test("una AFP que falta en la base se nombra en el error", () => {
  const { fila, afps } = filaDePrueba();
  const r = desdeBase(2026, 10, fila, afps.filter((a) => a.afp !== "uno" && a.afp !== "capital"));
  assert.deepEqual(r, {
    ok: false,
    errores: ["Faltan las comisiones de AFP Capital, Uno de octubre 2026."],
  });
});

test("tramos mal formados en la base no se usan", () => {
  const { fila, afps } = filaDePrueba();
  const r = desdeBase(2026, 10, { ...fila, tramos_impuesto: [{ desde_utm: "0" }] }, afps);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.errores, ["Los tramos del impuesto único de octubre 2026 están mal formados."]);
});

test("copiar al período siguiente deja UF y UTM vacías y copia lo demás", () => {
  const { p } = filaDePrueba();
  const f = copiarParaNuevoPeriodo(p, 2026, 11);
  assert.equal(f.mes, 11);
  assert.equal(f.valores.uf_mes_anterior, "");
  assert.equal(f.valores.uf_mes, "");
  assert.equal(f.valores.utm, "");
  assert.equal(f.valores.imm, "400000");
  assert.equal(f.comisionAfp.uno, "0,7");
  assert.deepEqual(f.tramosImpuesto, aFormulario(p).tramosImpuesto);
  // Y así como queda, no se puede guardar: falta lo que cambia cada mes.
  const r = leerFormulario(f);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errores.length, 3);
});

// ── Tasa adicional de mutual (de la empresa, con vigencia) ──────────────

const tramosMutual = [
  { id: "a", vigenteDesde: "2026-01-01", vigenteHasta: "2027-01-01", tasa: 0.5 },
  { id: "b", vigenteDesde: "2027-01-01", vigenteHasta: null, tasa: 0.9 },
];

test("mutual adicional: se toma la del tramo que cubre el mes", () => {
  assert.deepEqual(mutualAdicionalVigente(tramosMutual, 2026, 12), { ok: true, valor: 0.5 });
  assert.deepEqual(mutualAdicionalVigente(tramosMutual, 2027, 1), { ok: true, valor: 0.9 });
  assert.deepEqual(mutualAdicionalVigente(tramosMutual, 2030, 6), { ok: true, valor: 0.9 });
});

test("mutual adicional: un mes sin tramo es un error con nombre, no 0", () => {
  assert.deepEqual(mutualAdicionalVigente(tramosMutual, 2025, 12), {
    ok: false,
    errores: ["Falta la tasa adicional de mutual vigente en diciembre 2025."],
  });
  assert.equal(mutualAdicionalVigente([], 2026, 10).ok, false);
});

test("mutual adicional: un cambio a mitad de un tramo lo corta ahí", () => {
  assert.deepEqual(planCambioMutual(tramosMutual, 2026, 7, 0.7), {
    tipo: "nuevo",
    cortar: { id: "a", vigenteHasta: "2026-07-01" },
    insertar: { vigenteDesde: "2026-07-01", vigenteHasta: "2027-01-01", tasa: 0.7 },
  });
  assert.deepEqual(planCambioMutual(tramosMutual, 2029, 1, 1.1), {
    tipo: "nuevo",
    cortar: { id: "b", vigenteHasta: "2029-01-01" },
    insertar: { vigenteDesde: "2029-01-01", vigenteHasta: null, tasa: 1.1 },
  });
});

test("mutual adicional: el mismo mes de inicio corrige; un hueco llega hasta el siguiente", () => {
  assert.deepEqual(planCambioMutual(tramosMutual, 2027, 1, 0.95), { tipo: "corregir", id: "b", tasa: 0.95 });
  assert.deepEqual(planCambioMutual(tramosMutual, 2025, 3, 0.4), {
    tipo: "nuevo",
    cortar: null,
    insertar: { vigenteDesde: "2025-03-01", vigenteHasta: "2026-01-01", tasa: 0.4 },
  });
  assert.deepEqual(planCambioMutual([], 2026, 10, 0.5), {
    tipo: "nuevo",
    cortar: null,
    insertar: { vigenteDesde: "2026-10-01", vigenteHasta: null, tasa: 0.5 },
  });
});
