import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCuenta, modoTiposInspeccion, rechazoPorCampo, rolesQuePuedeCrear, type FormularioCuenta } from "./cuenta.ts";

// RUT de prueba con dígito verificador correcto, inventado.
const base = (): FormularioCuenta => ({
  nombre: " Juan ",
  apellido: "Pérez",
  rut: "12.345.678-5",
  email: " Juan@Ejemplo.cl ",
  telefono: "56911111111",
  fechaNacimiento: "1990-01-01",
  rol: "supervisor",
  tiposInspeccion: ["encarpe", "encarpe", "inventado"],
});

test("cuenta válida: RUT normalizado, correo en minúsculas, tipos sin repetidos ni inventados", () => {
  const r = leerCuenta(base(), { creando: true });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.valor.nombre, "Juan");
  assert.equal(r.valor.rut, "123456785");
  assert.equal(r.valor.email, "juan@ejemplo.cl");
  assert.deepEqual(r.valor.tiposInspeccion, ["encarpe"]);
});

test("cuenta: el RUT es opcional, pero si se escribe tiene que ser válido", () => {
  let r = leerCuenta({ ...base(), rut: "" }, { creando: false });
  assert.equal(r.ok && r.valor.rut, null);
  r = leerCuenta({ ...base(), rut: "12.345.678-9" }, { creando: false });
  assert.deepEqual(r, { ok: false, errores: ["El RUT no es válido (revisa el dígito verificador)."] });
});

test("cuenta: teléfono obligatorio solo para supervisor", () => {
  let r = leerCuenta({ ...base(), telefono: "" }, { creando: false });
  assert.deepEqual(r, { ok: false, errores: ["El teléfono es obligatorio para un supervisor."] });
  r = leerCuenta({ ...base(), telefono: "", rol: "trabajador" }, { creando: false });
  assert.equal(r.ok, true);
});

test("cuenta: un rol que no existe o sin login (conductor) se rechaza", () => {
  for (const rol of ["jefe", "conductor", ""]) {
    const r = leerCuenta({ ...base(), rol }, { creando: false });
    assert.deepEqual(r, { ok: false, errores: ["Elige el rol."] });
  }
});

test("cuenta: los tipos solo cuentan para un supervisor", () => {
  const r = leerCuenta({ ...base(), rol: "administrador" }, { creando: false });
  assert.equal(r.ok && r.valor.tiposInspeccion.length, 0);
});

test("tipos de inspección según el rol", () => {
  assert.equal(modoTiposInspeccion("supervisor"), "checkboxes");
  assert.equal(modoTiposInspeccion("administrador"), "todos");
  assert.equal(modoTiposInspeccion("administrador_contrato"), "no_aplica");
  assert.equal(modoTiposInspeccion("trabajador"), "no_aplica");
  assert.equal(modoTiposInspeccion("conductor"), "no_aplica");
});

// ── Autorización por campo ────────────────────────────────────────────────
const cambio = (o: Partial<Parameters<typeof rechazoPorCampo>[0]>) =>
  rechazoPorCampo({
    actor: "administrador_contrato",
    creando: false,
    rolActual: "supervisor",
    rolNuevo: "supervisor",
    tiposActuales: ["encarpe"],
    tiposNuevos: ["encarpe"],
    ...o,
  });

test("adm. de contrato edita datos personales si el rol y los tipos no cambian", () => {
  assert.equal(cambio({}), null);
  assert.equal(cambio({ tiposNuevos: ["encarpe", "encarpe"] }), null);
});

test("adm. de contrato NO cambia el rol de nadie, en ninguna dirección", () => {
  for (const rolNuevo of ["administrador", "administrador_contrato", "trabajador"] as const)
    assert.equal(cambio({ rolNuevo }), "Solo un administrador puede cambiar el rol de una persona.");
});

test("adm. de contrato NO cambia los tipos de inspección (ni para suspender)", () => {
  assert.equal(cambio({ tiposNuevos: [] }), "Solo un administrador puede cambiar los tipos de inspección.");
  assert.equal(cambio({ tiposNuevos: ["encarpe", "desencarpe"] }), "Solo un administrador puede cambiar los tipos de inspección.");
});

test("adm. de contrato solo crea trabajadores", () => {
  assert.deepEqual(rolesQuePuedeCrear("administrador_contrato"), ["trabajador"]);
  assert.equal(cambio({ creando: true, rolActual: null, rolNuevo: "trabajador", tiposActuales: [], tiposNuevos: [] }), null);
  for (const rolNuevo of ["administrador", "supervisor", "administrador_contrato"] as const)
    assert.match(
      cambio({ creando: true, rolActual: null, rolNuevo, tiposActuales: [], tiposNuevos: [] }) ?? "",
      /solo puede crear personas con rol Trabajador/,
    );
});

test("el administrador cambia rol y tipos", () => {
  assert.equal(cambio({ actor: "administrador", rolNuevo: "administrador" }), null);
  assert.equal(cambio({ actor: "administrador", tiposNuevos: [] }), null);
  assert.equal(
    cambio({ actor: "administrador", creando: true, rolActual: null, rolNuevo: "administrador", tiposActuales: [], tiposNuevos: [] }),
    null,
  );
});

test("supervisor y trabajador no crean ni cambian nada", () => {
  for (const actor of ["supervisor", "trabajador"] as const) {
    assert.deepEqual(rolesQuePuedeCrear(actor), []);
    assert.notEqual(cambio({ actor, rolNuevo: "administrador" }), null);
  }
});
