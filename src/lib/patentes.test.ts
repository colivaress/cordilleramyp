import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPatente } from "./patentes.ts";

test("quita espacios internos por completo, no los colapsa", () => {
  // Caso pedido explícitamente: "AB CD 12" y "ABCD12" son la MISMA patente.
  // Si esto colapsara a un solo espacio en vez de quitarlo, este assert
  // fallaría (dejaría "AB CD 12" en vez de "ABCD12") y el buscador de
  // patentes trataría el mismo camión como dos historiales distintos.
  assert.equal(normalizarPatente("AB CD 12"), "ABCD12");
  assert.equal(normalizarPatente("ab cd12"), "ABCD12");
});

test("mayúsculas", () => {
  assert.equal(normalizarPatente("gggg77"), "GGGG77");
  assert.equal(normalizarPatente("Bbv"), "BBV");
});

test("quita guiones y puntos", () => {
  assert.equal(normalizarPatente("AA-BB.11"), "AABB11");
  assert.equal(normalizarPatente("AA.BB-11"), "AABB11");
});

test("recorta espacios en los bordes", () => {
  assert.equal(normalizarPatente("  AABB11  "), "AABB11");
});

test("combinado — todas las reglas a la vez, mismo resultado", () => {
  assert.equal(normalizarPatente("  aa-bb. 11 "), "AABB11");
});
