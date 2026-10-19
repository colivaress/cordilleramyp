import { test } from "node:test";
import assert from "node:assert/strict";
import { comunaValida, comunasDe, REGIONES } from "./chile.ts";

/**
 * Conteo oficial de comunas por región (división vigente desde la creación
 * de Ñuble en 2018). Es la referencia externa de este módulo: si alguien
 * agrega, saca o tipea mal una comuna, el conteo de su región deja de
 * cuadrar y este test falla. Un test que solo contara el total no serviría:
 * una comuna agregada en una región y borrada en otra pasaría inadvertida.
 */
const COMUNAS_POR_REGION: Record<string, number> = {
  "Arica y Parinacota": 4,
  Tarapacá: 7,
  Antofagasta: 9,
  Atacama: 9,
  Coquimbo: 15,
  Valparaíso: 38,
  "Metropolitana de Santiago": 52,
  "O'Higgins": 33,
  Maule: 30,
  Ñuble: 21,
  Biobío: 33,
  "La Araucanía": 32,
  "Los Ríos": 12,
  "Los Lagos": 30,
  Aysén: 10,
  Magallanes: 11,
};

test("son las 16 regiones, ni una más ni una menos", () => {
  assert.equal(REGIONES.length, 16);
  const nombres = REGIONES.map((r) => r.nombre).sort();
  assert.deepEqual(nombres, Object.keys(COMUNAS_POR_REGION).sort());
});

test("cada región tiene su número oficial de comunas", () => {
  for (const r of REGIONES) {
    assert.equal(
      r.comunas.length,
      COMUNAS_POR_REGION[r.nombre],
      `${r.nombre} tiene ${r.comunas.length} comunas`,
    );
  }
});

test("son 346 comunas en total", () => {
  const total = REGIONES.reduce((n, r) => n + r.comunas.length, 0);
  assert.equal(total, 346);
});

test("ninguna comuna repetida dentro de su región", () => {
  for (const r of REGIONES) {
    assert.equal(
      new Set(r.comunas).size,
      r.comunas.length,
      `${r.nombre} tiene comunas repetidas`,
    );
  }
});

test("ningún nombre vacío ni con espacios colgando", () => {
  for (const r of REGIONES) {
    assert.ok(r.nombre.trim() === r.nombre && r.nombre.length > 0, r.nombre);
    for (const c of r.comunas) {
      assert.ok(c.trim() === c && c.length > 0, `"${c}" en ${r.nombre}`);
    }
  }
});

test("comunasDe devuelve la lista, y [] para una región inventada", () => {
  assert.ok(comunasDe("Metropolitana de Santiago").includes("Puente Alto"));
  assert.ok(comunasDe("Valparaíso").includes("Viña del Mar"));
  assert.deepEqual(comunasDe("Región Inventada"), []);
  assert.deepEqual(comunasDe(""), []);
});

test("comunaValida exige que el par región/comuna sea real", () => {
  assert.ok(comunaValida("Metropolitana de Santiago", "Puente Alto"));
  // Una comuna que existe, pero en OTRA región: no vale.
  assert.ok(!comunaValida("Metropolitana de Santiago", "Viña del Mar"));
  assert.ok(!comunaValida("Valparaíso", "Puente Alto"));
  // Nada inventado pasa.
  assert.ok(!comunaValida("Metropolitana de Santiago", "Comuna Inventada"));
  assert.ok(!comunaValida("", ""));
  // Sensible a mayúsculas a propósito: el valor viene de un <select>, no se
  // tipea. Si llegara en otra caja, es que alguien armó el POST a mano.
  assert.ok(!comunaValida("Metropolitana de Santiago", "puente alto"));
});

test("hay comunas homónimas en regiones distintas, y se distinguen", () => {
  // "Los Lagos" es comuna de Los Ríos y región aparte; "O'Higgins" es comuna
  // de Aysén y región aparte; "San Pedro" (RM) no es "San Pedro de la Paz"
  // (Biobío). Son las trampas reales de este dataset.
  assert.ok(comunaValida("Los Ríos", "Los Lagos"));
  assert.ok(!comunaValida("Los Lagos", "Los Lagos"));
  assert.ok(comunaValida("Aysén", "O'Higgins"));
  assert.ok(!comunaValida("O'Higgins", "O'Higgins"));
  assert.ok(comunaValida("Metropolitana de Santiago", "San Pedro"));
  assert.ok(comunaValida("Biobío", "San Pedro de la Paz"));
  assert.ok(!comunaValida("Biobío", "San Pedro"));
});
