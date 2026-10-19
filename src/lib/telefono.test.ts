import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enlaceTel,
  enlaceWhatsApp,
  esMovilCl,
  formatearTelefonoCl,
  normalizarTelefonoCl,
} from "./telefono.ts";

test("normaliza las formas en que la gente escribe su móvil", () => {
  // Todas estas son el MISMO número. Si alguna se cayera, el correo a Jaime
  // llegaría sin botón de WhatsApp para un número perfectamente válido.
  for (const escrito of [
    "+56 9 1234 5678",
    "+56912345678",
    "56912345678",
    "9 1234 5678",
    "912345678",
    "09 1234 5678",
  ]) {
    assert.equal(normalizarTelefonoCl(escrito), "56912345678", escrito);
  }
});

test("normaliza fijos de Santiago y de regiones", () => {
  assert.equal(normalizarTelefonoCl("(2) 2123 4567"), "56221234567");
  assert.equal(normalizarTelefonoCl("+56 32 212 3456"), "56322123456");
});

test("rechaza lo que no es un teléfono chileno", () => {
  assert.equal(normalizarTelefonoCl(""), null);
  assert.equal(normalizarTelefonoCl("123"), null);
  assert.equal(normalizarTelefonoCl("hola"), null);
  // 8 dígitos: le falta uno para ser un número nacional.
  assert.equal(normalizarTelefonoCl("12345678"), null);
  // Código de país que no es Chile.
  assert.equal(normalizarTelefonoCl("+54 9 11 1234 5678"), null);
});

test("distingue móvil de fijo", () => {
  assert.ok(esMovilCl("+56 9 1234 5678"));
  assert.ok(!esMovilCl("(2) 2123 4567"));
  assert.ok(!esMovilCl("basura"));
});

test("enlace tel:", () => {
  assert.equal(enlaceTel("9 1234 5678"), "tel:+56912345678");
  assert.equal(enlaceTel("no es un número"), null);
});

test("enlace wa.me solo para móviles", () => {
  assert.equal(enlaceWhatsApp("912345678"), "https://wa.me/56912345678");
  // Un fijo no recibe WhatsApp: mejor sin botón que con un botón roto.
  assert.equal(enlaceWhatsApp("(2) 2123 4567"), null);
});

test("el texto del wa.me va escapado para URL", () => {
  const url = enlaceWhatsApp("912345678", "Hola Juan, sobre su cotización #12");
  assert.ok(url !== null);
  assert.ok(url.startsWith("https://wa.me/56912345678?text="));
  // El espacio y el # no pueden viajar crudos: romperían la query.
  assert.ok(!url.includes(" "));
  assert.ok(!url.includes("#"));
  assert.ok(url.includes("%23"));
});

test("formato de presentación", () => {
  assert.equal(formatearTelefonoCl("912345678"), "+56 9 1234 5678");
  assert.equal(formatearTelefonoCl("221234567"), "+56 2 2123 4567");
  assert.equal(formatearTelefonoCl("basura"), "basura");
});
