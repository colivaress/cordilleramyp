import { test } from "node:test";
import assert from "node:assert/strict";
import { esFotoPermitida, FORMATOS_FOTO, MIME_FOTO } from "./fotos.ts";

/**
 * CORRECCIÓN sobre la versión anterior de este archivo: decía que el
 * comodín era lo que devolvía la cámara en Android. Es falso — se probó en
 * producción con video y no cambió nada. Ese problema se resolvió con dos
 * inputs separados (`BotonesFoto`), no con este valor.
 *
 * El comodín se queda por una razón distinta y más chica: la lista
 * explícita de MIME no aportaba seguridad (`accept` es un filtro del
 * selector, no una validación) y en cambio escondía archivos HEIC
 * legítimos en algunos selectores de escritorio. La validación real está
 * en `esFotoPermitida`.
 */
test("el accept es el comodín image/*, no una lista de MIME", () => {
  assert.equal(FORMATOS_FOTO, "image/*");
});

test("el accept no enumera tipos concretos", () => {
  assert.ok(
    !FORMATOS_FOTO.includes(","),
    `accept con lista explícita: "${FORMATOS_FOTO}"`,
  );
  assert.ok(!FORMATOS_FOTO.includes("jpeg"));
});

test("acepta los formatos que sacan los teléfonos", () => {
  // JPEG: Android. HEIC/HEIF: iPhone por defecto desde iOS 11.
  for (const t of MIME_FOTO) {
    assert.ok(esFotoPermitida(t), t);
  }
});

test("no distingue mayúsculas en el MIME", () => {
  assert.ok(esFotoPermitida("IMAGE/JPEG"));
  assert.ok(esFotoPermitida("Image/Heic"));
});

test("rechaza lo que no es una foto", () => {
  assert.ok(!esFotoPermitida("application/pdf"));
  assert.ok(!esFotoPermitida("video/mp4"));
  assert.ok(!esFotoPermitida("text/plain"));
});

test("rechaza imágenes que no son fotografías", () => {
  // Esto es MÁS estricto que la validación anterior
  // (`type.startsWith("image/")`), que las dejaba pasar. Al abrir el accept
  // a image/* estos pasaron a ser elegibles en el selector, así que la
  // validación tenía que cubrirlos.
  assert.ok(!esFotoPermitida("image/svg+xml"));
  assert.ok(!esFotoPermitida("image/gif"));
  assert.ok(!esFotoPermitida("image/bmp"));
});

test("un MIME vacío pasa: algunos selectores de Android no lo informan", () => {
  // Rechazarlo dejaría a un supervisor sin poder subir una foto válida.
  // Si el contenido no fuera una imagen, la compresión falla después.
  assert.ok(esFotoPermitida(""));
  assert.ok(esFotoPermitida(undefined));
  assert.ok(esFotoPermitida(null));
});
