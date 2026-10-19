import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirPorTurnstile } from "./turnstile.ts";

/**
 * Lo que protege este test: que el formulario público no pueda usarse para
 * que la casilla de la empresa le mande correo a un tercero.
 *
 * El acuse de recibo es el ÚNICO correo que sale hacia una dirección que
 * escribió un desconocido. Si alguien "simplifica" esta política y lo manda
 * siempre, el formulario vuelve a ser un relay de spam — y el remitente es
 * la misma casilla que manda los informes de inspección, así que el daño no
 * se queda en la cotización.
 */

test("sin configurar, todo se comporta como antes de que esto existiera", () => {
  // Es el estado de producción apenas se despliegue esto y antes de cargar
  // las claves. No puede romper ni cambiar nada.
  for (const estado of ["sin_configurar", "sin_token", "error"] as const) {
    const d = decidirPorTurnstile(estado, false);
    assert.equal(d.descartar, false, estado);
    assert.equal(d.enviarAcuse, true, estado);
    assert.equal(d.avisarSinVerificar, false, estado);
  }
});

test("token válido: todo normal", () => {
  const d = decidirPorTurnstile("ok", true);
  assert.deepEqual(d, {
    descartar: false,
    enviarAcuse: true,
    avisarSinVerificar: false,
  });
});

test("token rechazado: se descarta y NO sale ningún correo", () => {
  const d = decidirPorTurnstile("rechazado", true);
  assert.equal(d.descartar, true);
  assert.equal(d.enviarAcuse, false);
});

test("sin token: se guarda y se avisa, pero NO sale el acuse", () => {
  // Ambiguo: puede ser un bot sin JS o una persona con el script bloqueado.
  // No se pierde el negocio (la solicitud queda y Jaime se entera), pero no
  // se le escribe a la dirección que vino en el formulario.
  const d = decidirPorTurnstile("sin_token", true);
  assert.equal(d.descartar, false, "no se pierde una solicitud posiblemente real");
  assert.equal(d.enviarAcuse, false, "🔴 esto reabriría el relay de spam");
  assert.equal(d.avisarSinVerificar, true, "Jaime tiene que saberlo");
});

test("si Cloudflare no responde, se toma el camino prudente", () => {
  const d = decidirPorTurnstile("error", true);
  assert.equal(d.descartar, false, "una caída de Cloudflare no puede costarnos clientes");
  assert.equal(d.enviarAcuse, false);
  assert.equal(d.avisarSinVerificar, true);
});

test("estando configurado, el acuse SOLO sale con un token válido", () => {
  // La invariante de fondo, dicha una vez más de forma exhaustiva: con la
  // protección activa, ningún estado distinto de "ok" manda correo afuera.
  const estados = [
    "ok",
    "sin_configurar",
    "sin_token",
    "rechazado",
    "error",
  ] as const;
  for (const estado of estados) {
    const d = decidirPorTurnstile(estado, true);
    assert.equal(
      d.enviarAcuse,
      estado === "ok",
      `el acuse con estado "${estado}" debería ser ${estado === "ok"}`,
    );
  }
});
