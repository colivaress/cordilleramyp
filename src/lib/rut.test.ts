import { test } from "node:test";
import assert from "node:assert/strict";
import {
  digitoVerificador,
  formatearRut,
  normalizarRut,
  rutValido,
} from "./rut.ts";

// RUTs de empresas chilenas publicados, usados como referencia externa: el
// dígito verificador de cada uno es conocido y verificable fuera de este
// repo. Si alguien "optimiza" el módulo 11 y lo rompe, esto lo delata —
// a diferencia de un test armado con RUTs que inventó la misma función.
// Incluye a propósito los dos casos borde: DV = K y DV = 0.
const RUTS_REALES: [cuerpo: string, dv: string, quien: string][] = [
  ["90222000", "3", "Empresas CMPC"],
  ["61704000", "K", "Codelco"],
  ["81201000", "K", "SQM"],
  ["96505760", "9", "LATAM"],
  ["97004000", "5", "Banco de Chile"],
  ["99500410", "0", "Entel"],
];

test("el dígito verificador calza con RUTs publicados", () => {
  for (const [cuerpo, dv, quien] of RUTS_REALES) {
    assert.equal(digitoVerificador(cuerpo), dv, `${quien} (${cuerpo})`);
  }
});

test("acepta el RUT con puntos, con guion y pelado", () => {
  assert.ok(rutValido("90.222.000-3"));
  assert.ok(rutValido("90222000-3"));
  assert.ok(rutValido("902220003"));
});

test("la K vale en minúscula", () => {
  assert.ok(rutValido("61.704.000-k"));
  assert.ok(rutValido("61704000K"));
});

test("rechaza un dígito verificador equivocado", () => {
  // Mismo cuerpo que CMPC, pero con cada uno de los otros DV posibles.
  for (const dv of ["0", "1", "2", "4", "5", "6", "7", "8", "9", "K"]) {
    assert.ok(!rutValido(`90222000-${dv}`), `90222000-${dv} no debería valer`);
  }
});

test("rechaza vacío, basura y campos a medio escribir", () => {
  assert.ok(!rutValido(""));
  assert.ok(!rutValido("-"));
  assert.ok(!rutValido("hola"));
  // Un cuerpo demasiado corto no debe colarse: "1-9" calza con el módulo 11
  // pero no es un RUT de nadie, y aparecería mientras alguien todavía teclea.
  assert.ok(!rutValido("1-9"));
  assert.ok(!rutValido("12-4"));
  // Demasiado largo.
  assert.ok(!rutValido("1234567890-1"));
});

test("la K solo vale al final, nunca dentro del cuerpo", () => {
  assert.ok(!rutValido("9K222000-3"));
});

test("normalizar deja solo dígitos y DV, con K en mayúscula", () => {
  assert.equal(normalizarRut("12.345.678-9"), "123456789");
  assert.equal(normalizarRut(" 61.704.000-k "), "61704000K");
});

test("formatear arma 12.345.678-9", () => {
  assert.equal(formatearRut("902220003"), "90.222.000-3");
  assert.equal(formatearRut("61704000k"), "61.704.000-K");
  // Un RUT de 7 dígitos lleva un solo punto.
  assert.equal(formatearRut("76543210"), "7.654.321-0");
});

test("formatear no reordena un valor que todavía no es RUT", () => {
  // Mientras la persona teclea, el campo no debe saltar: lo que no se puede
  // formatear se devuelve tal cual, no se recorta ni se inventa.
  assert.equal(formatearRut(""), "");
  assert.equal(formatearRut("1"), "1");
  assert.equal(formatearRut("hola"), "hola");
});
