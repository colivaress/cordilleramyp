import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularTotales,
  fechaValidez,
  formatearCLP,
  leerMontoCLP,
  TASA_IVA,
} from "./dinero.ts";

test("IVA del 19% sobre montos redondos", () => {
  assert.deepEqual(calcularTotales(100000), {
    neto: 100000,
    iva: 19000,
    total: 119000,
  });
  assert.deepEqual(calcularTotales(450000), {
    neto: 450000,
    iva: 85500,
    total: 535500,
  });
});

test("el total impreso siempre es la suma exacta de neto + IVA", () => {
  // La garantía que el PDF necesita: si el documento muestra neto e IVA, el
  // total tiene que ser su suma, o quien lo lee asume que está mal hecho.
  for (let neto = 1; neto <= 20000; neto++) {
    const t = calcularTotales(neto);
    assert.equal(t.total, t.neto + t.iva, `no cuadra en neto=${neto}`);
  }
});

test("para un neto entero, sumar el IVA redondeado == redondear neto*1,19", () => {
  // La primera versión de este módulo afirmaba en un comentario que los dos
  // caminos "difieren en un peso en varios montos". Es falso: con `neto`
  // entero, round(neto + x) == neto + round(x), así que coinciden siempre.
  // El test queda para que la afirmación corregida no se vuelva a invertir
  // sola, y para fijar que la equivalencia depende de que el neto sea entero.
  for (let neto = 1; neto <= 20000; neto++) {
    assert.equal(
      calcularTotales(neto).total,
      Math.round(neto * (1 + TASA_IVA)),
      `difieren en neto=${neto}`,
    );
  }
});

test("todo sale entero, nunca con decimales", () => {
  for (const neto of [1, 7, 33, 12345, 999999, 1234567]) {
    const t = calcularTotales(neto);
    assert.ok(Number.isInteger(t.neto), `neto ${t.neto}`);
    assert.ok(Number.isInteger(t.iva), `iva ${t.iva}`);
    assert.ok(Number.isInteger(t.total), `total ${t.total}`);
  }
});

test("formato chileno con punto de miles", () => {
  assert.equal(formatearCLP(1234567), "$1.234.567");
  assert.equal(formatearCLP(1000), "$1.000");
  assert.equal(formatearCLP(999), "$999");
});

test("lee montos escritos como los escribe una persona", () => {
  for (const escrito of ["1.234.567", "1234567", "$1.234.567", "1 234 567"]) {
    assert.equal(leerMontoCLP(escrito), 1234567, escrito);
  }
});

test("rechaza lo que no es un monto utilizable", () => {
  assert.equal(leerMontoCLP(""), null);
  assert.equal(leerMontoCLP("abc"), null);
  assert.equal(leerMontoCLP("$"), null);
  assert.equal(leerMontoCLP("0"), null);
});

test("la validez se cuenta en días desde la emisión", () => {
  const emision = new Date("2026-10-19T12:00:00");
  assert.equal(fechaValidez(emision, 15).toISOString().slice(0, 10), "2026-11-03");
  // Cruza fin de mes y fin de año sin ayuda.
  assert.equal(
    fechaValidez(new Date("2026-12-28T12:00:00"), 10).toISOString().slice(0, 10),
    "2027-01-07",
  );
  // No muta la fecha que recibe.
  assert.equal(emision.toISOString().slice(0, 10), "2026-10-19");
});
