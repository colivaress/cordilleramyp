import { test } from "node:test";
import assert from "node:assert/strict";
import { esFotoPermitida, FORMATOS_FOTO, MIME_FOTO } from "./fotos.ts";

/**
 * Este test existe por un bug de producción, no por completitud.
 *
 * El `accept` del input de fotos ya rompió la captura dos veces, cada vez
 * escondiendo una mitad distinta del menú del sistema y cada vez solo
 * visible en un teléfono real:
 *
 *   capture="environment"  → se llevó la galería (PR #113)
 *   accept="image/jpeg,…"  → se llevó la cámara en Android (19-10)
 *
 * El valor correcto es el comodín. Si alguien lo "ordena" volviendo a poner
 * la lista explícita de MIME —que se ve más prolija y más segura— acá falla
 * antes de llegar a planta.
 */
test("el accept es el comodín image/*, no una lista de MIME", () => {
  assert.equal(FORMATOS_FOTO, "image/*");
});

test("el accept no enumera tipos concretos", () => {
  // Una lista explícita es exactamente lo que esconde la cámara en Android.
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
