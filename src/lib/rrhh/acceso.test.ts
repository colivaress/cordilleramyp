import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeEditarMontos, puedeEntrarModuloRrhh } from "./acceso.ts";

test("al módulo RRHH entran administrador y administrador de contrato", () => {
  assert.equal(puedeEntrarModuloRrhh("administrador"), true);
  assert.equal(puedeEntrarModuloRrhh("administrador_contrato"), true);
});

test("ni supervisor ni conductor entran al módulo RRHH", () => {
  assert.equal(puedeEntrarModuloRrhh("supervisor"), false);
  assert.equal(puedeEntrarModuloRrhh("conductor"), false);
});

test("solo el administrador edita montos de remuneración", () => {
  assert.equal(puedeEditarMontos("administrador"), true);
  assert.equal(puedeEditarMontos("administrador_contrato"), false);
  assert.equal(puedeEditarMontos("supervisor"), false);
  assert.equal(puedeEditarMontos("conductor"), false);
});
