import { test } from "node:test";
import assert from "node:assert/strict";
import {
  antiguedad,
  fechaValida,
  leerFicha,
  leerRemuneracion,
  textoAntiguedad,
  vigenteEn,
  type FormularioFicha,
} from "./ficha.ts";
import {
  horasSemanales,
  leerFormularioJornada,
  formularioJornadaVacio,
  minutosDia,
  validarDias,
} from "./jornadas.ts";
import { mimeDocumento, nombreSeguro, problemaDocumento, rutaDocumento, rutaEsDe } from "./documentos.ts";

// RUT de prueba con dígito verificador correcto, inventado.
const fichaBase = (): FormularioFicha => ({
  rut: "11.111.111-1",
  cargo: "Supervisor de encarpe",
  area: "Operaciones",
  fecha_ingreso: "2019-03-15",
  tipo_contrato: "indefinido",
  fecha_termino_contrato: "",
  afp: "modelo",
  sistema_salud: "fonasa",
  isapre: "",
  plan_isapre_uf: "",
  afecto_afc: true,
  cargas_familiares: "2",
});

test("ficha válida: RUT normalizado y sin datos de Isapre si es Fonasa", () => {
  const r = leerFicha({ ...fichaBase(), isapre: "Colmena", plan_isapre_uf: "3,5" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.valor.rut, "111111111");
  assert.equal(r.valor.isapre, null);
  assert.equal(r.valor.plan_isapre_uf, null);
  assert.equal(r.valor.cargas_familiares, 2);
});

test("ficha: RUT con dígito verificador malo se rechaza", () => {
  const r = leerFicha({ ...fichaBase(), rut: "11.111.111-2" });
  assert.deepEqual(r, { ok: false, errores: ["El RUT no es válido (revisa el dígito verificador)."] });
});

test("ficha: plazo fijo exige término; indefinido no lo admite", () => {
  let r = leerFicha({ ...fichaBase(), tipo_contrato: "plazo_fijo" });
  assert.deepEqual(r, { ok: false, errores: ["Un contrato a plazo fijo necesita fecha de término."] });
  r = leerFicha({ ...fichaBase(), fecha_termino_contrato: "2027-01-01" });
  assert.deepEqual(r, { ok: false, errores: ["Un contrato indefinido no lleva fecha de término."] });
  r = leerFicha({ ...fichaBase(), tipo_contrato: "plazo_fijo", fecha_termino_contrato: "2018-01-01" });
  assert.deepEqual(r, { ok: false, errores: ["La fecha de término no puede ser anterior al ingreso."] });
});

test("ficha: Isapre exige nombre y plan en UF con coma", () => {
  const r = leerFicha({ ...fichaBase(), sistema_salud: "isapre", isapre: "Colmena", plan_isapre_uf: "3.5" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errores[0], /plan de la Isapre/);
  const ok = leerFicha({ ...fichaBase(), sistema_salud: "isapre", isapre: "Colmena", plan_isapre_uf: "3,5" });
  assert.equal(ok.ok && ok.valor.plan_isapre_uf, 3.5);
});

test("fechaValida rechaza fechas que no existen", () => {
  assert.equal(fechaValida("2026-02-28"), true);
  assert.equal(fechaValida("2026-02-30"), false);
  assert.equal(fechaValida("2026-2-3"), false);
});

test("remuneración: colación en blanco no es 0 en silencio", () => {
  const r = leerRemuneracion({ vigente_desde: "2026-10", liquido_pactado: "800.000", colacion: "", movilizacion: "0", comentario: "Ingreso" });
  assert.deepEqual(r, { ok: false, errores: ["Falta la colación (escribe 0 si no tiene)."] });
});

test("remuneración: rige desde el día 1 del mes y exige motivo", () => {
  const r = leerRemuneracion({ vigente_desde: "2026-10", liquido_pactado: "800.000", colacion: "0", movilizacion: "25.000", comentario: " Ingreso " });
  assert.deepEqual(r, {
    ok: true,
    valor: { vigente_desde: "2026-10-01", liquido_pactado: 800000, colacion: 0, movilizacion: 25000, comentario: "Ingreso" },
  });
  const sin = leerRemuneracion({ vigente_desde: "2026-10", liquido_pactado: "800.000", colacion: "0", movilizacion: "0", comentario: "" });
  assert.equal(sin.ok, false);
});

test("vigenteEn: la vigencia más reciente no futura; en empate, la registrada último", () => {
  const filas = [
    { id: "a", vigente_desde: "2026-01-01", created_at: "2026-01-02T10:00:00Z" },
    { id: "b", vigente_desde: "2026-06-01", created_at: "2026-05-20T10:00:00Z" },
    { id: "c", vigente_desde: "2026-06-01", created_at: "2026-06-03T10:00:00Z" }, // corrección
    { id: "d", vigente_desde: "2027-01-01", created_at: "2026-06-04T10:00:00Z" }, // futura
  ];
  assert.equal(vigenteEn(filas, "2025-12-31"), null);
  assert.equal(vigenteEn(filas, "2026-05-31")?.id, "a");
  assert.equal(vigenteEn(filas, "2026-06-01")?.id, "c");
  assert.equal(vigenteEn(filas, "2026-12-31")?.id, "c");
  assert.equal(vigenteEn(filas, "2027-01-01")?.id, "d");
});

test("antigüedad: años y meses cumplidos", () => {
  assert.deepEqual(antiguedad("2019-03-15", "2026-03-14"), { anios: 6, meses: 11 });
  assert.deepEqual(antiguedad("2019-03-15", "2026-03-15"), { anios: 7, meses: 0 });
  assert.equal(textoAntiguedad("2025-09-01", "2026-10-20"), "1 año y 1 mes de servicio");
  assert.equal(textoAntiguedad("2026-10-20", "2026-10-20"), "0 años y 0 meses de servicio");
});

// ── Jornadas ────────────────────────────────────────────────────────────

test("jornada: horas semanales derivadas del horario, descontando colación", () => {
  const dias = [1, 2, 3, 4, 5].map((dia) => ({ dia, entrada: "08:00", salida: "17:30", colacion_minutos: 60 }));
  assert.equal(horasSemanales(dias), 42.5);
});

test("jornada: un turno que cruza la medianoche se cuenta bien", () => {
  assert.equal(minutosDia({ dia: 1, entrada: "22:00", salida: "06:00", colacion_minutos: 30 }), 450);
});

test("jornada: días repetidos, horas mal escritas y colación más larga que el turno", () => {
  const e = validarDias([
    { dia: 1, entrada: "08:00", salida: "09:00", colacion_minutos: 90 },
    { dia: 1, entrada: "8:00", salida: "17:00", colacion_minutos: 0 },
  ]);
  assert.deepEqual(e, [
    "Lunes: la colación es más larga que el turno.",
    "Lunes está repetido.",
    "Lunes: la entrada y la salida van en formato HH:MM (por ejemplo 08:30).",
  ]);
});

test("jornada: el formulario exige al menos un día y colación explícita", () => {
  const f = formularioJornadaVacio();
  f.nombre = "Turno mañana";
  assert.deepEqual(leerFormularioJornada(f), { ok: false, errores: ["La jornada necesita al menos un día de trabajo."] });
  f.dias[0] = { dia: 1, trabaja: true, entrada: "08:00", salida: "16:00", colacion: "" };
  assert.deepEqual(leerFormularioJornada(f), {
    ok: false,
    errores: ["Lunes: falta la colación en minutos (0 si no tiene).", "La jornada necesita al menos un día de trabajo."],
  });
  f.dias[0].colacion = "30";
  const r = leerFormularioJornada(f);
  assert.deepEqual(r, {
    ok: true,
    valor: { nombre: "Turno mañana", dias: [{ dia: 1, entrada: "08:00", salida: "16:00", colacion_minutos: 30 }] },
  });
});

// ── Documentos ──────────────────────────────────────────────────────────

test("documentos: el tipo se decide por la extensión, no por lo que diga el navegador", () => {
  assert.equal(mimeDocumento("planilla.CSV"), "text/csv");
  assert.equal(mimeDocumento("contrato.pdf"), "application/pdf");
  assert.equal(mimeDocumento("virus.exe"), null);
  assert.equal(mimeDocumento("sin-extension"), null);
});

test("documentos: más de 15 MB o tipo no permitido se rechaza antes de subir", () => {
  assert.equal(problemaDocumento({ nombre: "a.pdf", tamano: 15 * 1024 * 1024 }), null);
  assert.match(problemaDocumento({ nombre: "a.pdf", tamano: 15 * 1024 * 1024 + 1 })!, /15 MB/);
  assert.match(problemaDocumento({ nombre: "a.exe", tamano: 10 })!, /no permitido/);
});

test("documentos: ruta segura bajo la carpeta del trabajador", () => {
  assert.equal(nombreSeguro("Cédula de identidad (1).pdf"), "Cedula_de_identidad_1_.pdf");
  const ruta = rutaDocumento("p-1", "x", "../../otro/a.pdf");
  // Las barras del nombre no crean carpetas: todo queda bajo p-1/.
  assert.equal(ruta, "p-1/x-otro_a.pdf");
  assert.equal(rutaEsDe(ruta, "p-1"), true);
  assert.equal(rutaEsDe("p-2/x-a.pdf", "p-1"), false);
  assert.equal(rutaEsDe("p-1/../p-2/a.pdf", "p-1"), false);
});
