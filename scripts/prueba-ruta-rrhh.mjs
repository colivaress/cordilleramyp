/**
 * ⚠️  SOLO PARA LA BASE LOCAL Y LA APP LOCAL — aborta contra cualquier otra.
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba el control de acceso por RUTA del módulo RRHH (Fase 1): inicia
 * sesión con cada rol usando el mismo cliente de @supabase/ssr que la app
 * (así las cookies son las reales), pide las páginas a la app local y revisa
 * qué devuelve. Complementa a prueba-rls-rrhh.mjs, que prueba la RLS.
 *
 * Requiere las cuentas que crea prueba-rls-rrhh.mjs y la app corriendo en
 * http://localhost:3100 contra la base local:
 *   npx supabase db reset --local
 *   CLAVE='<clave>' node scripts/prueba-rls-rrhh.mjs
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY local> npx next dev -p 3100
 *   CLAVE='<clave>' node scripts/prueba-ruta-rrhh.mjs
 */

import { execSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { formularioFicticio } from "../src/lib/rrhh/parametros-ficticios.prueba.ts";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const URL = env.API_URL;
const APP = "http://localhost:3100";
const CLAVE = process.env.CLAVE;
if (URL !== "http://127.0.0.1:54321") {
  console.error("ABORTA: no es la base local:", URL);
  process.exit(1);
}
if (!CLAVE) {
  console.error("Falta la variable CLAVE (clave de las cuentas de prueba)");
  process.exit(1);
}

/** Cookies de sesión tal como las deja @supabase/ssr al iniciar sesión. */
async function cookiesDe(k) {
  const jar = new Map();
  const sb = createServerClient(URL, env.ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: `rls.${k.toLowerCase()}@test.cordilleramyp.local`,
    password: CLAVE,
  });
  if (error) throw new Error(`login ${k}: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function pedir(ruta, cookie) {
  const r = await fetch(APP + ruta, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: r.status, location: r.headers.get("location"), html: r.status === 200 ? await r.text() : "" };
}

let fallas = 0;
const check = (desc, ok, detalle) => {
  console.log(`${ok ? "OK   " : "FALLA"} ${desc}${detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""}`);
  if (!ok) fallas++;
};
const linkRrhh = (html) => /href="\/rrhh"/.test(html);
const AVISO_SOLO_LECTURA = "solo un administrador puede modificarlos";

const [cA, cC, cS1, cS3, cT] = [
  await cookiesDe("A"),
  await cookiesDe("C"),
  await cookiesDe("S1"),
  await cookiesDe("S3"),
  await cookiesDe("T"),
];
let r;

console.log("\n— Administrador —");
r = await pedir("/rrhh", cA);
check("entra a /rrhh", r.status === 200, r.status);
// prueba-rls-rrhh.mjs deja a S2 desvinculado: sale en la otra pestaña.
check("Activos: ve el líquido vigente de S1 (la corrección) y no a S2", r.html.includes("$810.000") && !r.html.includes("$950.000"));
r = await pedir("/rrhh?pestana=desvinculados", cA);
check("Desvinculados: S2 con su líquido vigente, no el de vigencia futura", r.html.includes("$950.000") && !r.html.includes("$1.000.000") && !r.html.includes("$810.000"));
check("no ve el aviso de solo lectura", !r.html.includes(AVISO_SOLO_LECTURA));
check("tiene el link RRHH en la barra", linkRrhh(r.html));

console.log("\n— Administrador de contrato —");
r = await pedir("/rrhh", cC);
check("entra a /rrhh", r.status === 200, r.status);
check("ve los montos", r.html.includes("$810.000"));
check("ve el aviso de solo lectura", r.html.includes(AVISO_SOLO_LECTURA));
check("tiene el link RRHH en la barra", linkRrhh(r.html));

console.log("\n— Supervisor —");
r = await pedir("/rrhh", cS1);
check("escribiendo /rrhh rebota a /dashboard?error=sin_permiso", r.status >= 300 && r.status < 400 && r.location?.includes("/dashboard?error=sin_permiso"), { status: r.status, location: r.location });
check("la respuesta no trae montos", !r.html.includes("$810.000") && !r.html.includes("$950.000"));
r = await pedir("/dashboard", cS1);
check("no tiene el link RRHH en la barra", r.status === 200 && !linkRrhh(r.html), r.status);

console.log("\n— Sin sesión —");
r = await pedir("/rrhh", null);
check("rebota a /login", r.status >= 300 && r.status < 400 && r.location?.includes("/login"), { status: r.status, location: r.location });

// ── Fase 2: parámetros previsionales (solo administrador) ───────────────
// prueba-rls-rrhh.mjs dejó cargado octubre 2026 completo (valores inventados).
const sinPermiso = (r) => r.status >= 300 && r.status < 400 && r.location?.includes("/dashboard?error=sin_permiso");

console.log("\n— Parámetros: acceso —");
r = await pedir("/rrhh", cA);
check("admin ve el link a parámetros en /rrhh", r.html.includes('href="/rrhh/parametros"'));
r = await pedir("/rrhh/parametros", cA);
check("admin entra a /rrhh/parametros y ve octubre 2026 completo", r.status === 200 && r.html.includes("octubre 2026") && r.html.includes("Completo"), r.status);
r = await pedir("/rrhh/parametros/2026-13", cA);
check("un período inválido da 404", r.status === 404, r.status);
r = await pedir("/rrhh", cC);
check("adm. contrato no ve el link a parámetros", r.status === 200 && !r.html.includes('href="/rrhh/parametros"'));
for (const ruta of ["/rrhh/parametros", "/rrhh/parametros/2026-10"]) {
  r = await pedir(ruta, cC);
  check(`adm. contrato escribiendo ${ruta} rebota`, sinPermiso(r), { status: r.status, location: r.location });
  r = await pedir(ruta, cS1);
  check(`supervisor escribiendo ${ruta} rebota`, sinPermiso(r), { status: r.status, location: r.location });
}

console.log("\n— Parámetros: período nuevo —");
r = await pedir("/rrhh/parametros/2026-11", cA);
check("noviembre se precarga desde octubre", r.status === 200 && r.html.includes("Se copiaron los valores de octubre 2026"), r.status);
check("pero la UTM queda vacía (no se copia)", /id="utm"[^>]*value=""/.test(r.html) || /value=""[^>]*id="utm"/.test(r.html));
check("y el ingreso mínimo sí se copia", /id="imm"[^>]*value="400000"/.test(r.html) || /value="400000"[^>]*id="imm"/.test(r.html));

// La Server Action real, como la llama el navegador: POST a la página con
// el header Next-Action. El id se saca del chunk que la importa.
async function idAccion(html, nombre) {
  for (const [, src] of html.matchAll(/src="([^"]+\.js[^"]*)"/g)) {
    const js = await (await fetch(APP + src)).text();
    const m = js.match(new RegExp(`"([0-9a-f]{40,})":\\{"name":"${nombre}"\\}`));
    if (m) return m[1];
  }
  throw new Error(`no se encontró el id de ${nombre}`);
}
async function llamarAccion(ruta, id, cookie, ...args) {
  const res = await fetch(APP + ruta, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "Next-Action": id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(args),
  });
  const texto = await res.text();
  const m = texto.match(/\{"ok":(true|false)[^\n]*\}/);
  return { status: res.status, redirect: res.headers.get("x-action-redirect"), resultado: m ? JSON.parse(m[0]) : null };
}
const ID = await idAccion(r.html, "guardarParametrosPeriodo");
const guardar = (cookie, formulario) =>
  llamarAccion(`/rrhh/parametros/${formulario.anio}-${String(formulario.mes).padStart(2, "0")}`, ID, cookie, formulario);
const rechazada = (g) => g.resultado?.ok !== true && (g.redirect?.includes("sin_permiso") || (g.status >= 300 && g.status < 400));
// Valores FICTICIOS, del archivo que lo dice en el nombre.
const formulario = (utm) => {
  const f = formularioFicticio(2026, 11);
  f.valores.utm = utm;
  return f;
};

console.log("\n— Parámetros: Server Action —");
let g = await guardar(cA, formulario(""));
check("admin sin UTM: no guarda y dice qué falta", g.resultado?.ok === false && g.resultado.errores?.includes("Falta: UTM."), g.resultado);
g = await guardar(cC, formulario("51.000"));
check("adm. contrato llamando la acción directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await guardar(cS1, formulario("51.000"));
check("supervisor llamando la acción directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
r = await pedir("/rrhh/parametros", cA);
check("…y noviembre sigue sin existir", !r.html.includes("noviembre 2026"));
g = await guardar(cA, formulario("51.000"));
check("admin guarda noviembre completo", g.resultado?.ok === true, g.resultado ?? g.status);
r = await pedir("/rrhh/parametros", cA);
check("noviembre aparece completo en el listado", r.html.includes("noviembre 2026") && (r.html.match(/>Completo</g) ?? []).length === 2 && !r.html.includes(">Incompleto<"), (r.html.match(/>Completo</g) ?? []).length);
r = await pedir("/rrhh/parametros/2026-11", cA);
check("al reabrirlo trae la UTM guardada", /id="utm"[^>]*value="51000"/.test(r.html) || /value="51000"[^>]*id="utm"/.test(r.html));

// prueba-rls-rrhh.mjs dejó dos tramos: ene-2026→dic-2026 a 0,5 y ene-2027→ a 0,9.
console.log("\n— Tasa adicional de mutual: Server Action —");
r = await pedir("/rrhh/parametros", cA);
const ID_MUTUAL = await idAccion(r.html, "registrarMutualAdicional");
const mutual = (cookie, anio, mes, tasa) => llamarAccion("/rrhh/parametros", ID_MUTUAL, cookie, { anio, mes, tasa });
g = await mutual(cC, 2026, 7, "0,7");
check("adm. contrato llamando la acción directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await mutual(cS1, 2026, 7, "0,7");
check("supervisor llamando la acción directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await mutual(cA, 2026, 7, "1.5");
check("admin con punto decimal: rechazado con mensaje", g.resultado?.ok === false && /coma/.test(g.resultado.mensaje), g.resultado);
g = await mutual(cA, 2026, 7, "0,7");
check("admin registra 0,7 desde julio 2026", g.resultado?.ok === true, g.resultado ?? g.status);
const { data: tramos } = await (async () => {
  const sb = createServerClient(URL, env.SERVICE_ROLE_KEY, { cookies: { getAll: () => [], setAll: () => {} } });
  return sb.from("rrhh_mutual_adicional").select("vigente_desde, vigente_hasta, tasa").order("vigente_desde");
})();
check(
  "el tramo de 2026 quedó cortado en julio y el nuevo termina donde terminaba",
  JSON.stringify(tramos) ===
    JSON.stringify([
      { vigente_desde: "2026-01-01", vigente_hasta: "2026-07-01", tasa: 0.5 },
      { vigente_desde: "2026-07-01", vigente_hasta: "2027-01-01", tasa: 0.7 },
      { vigente_desde: "2027-01-01", vigente_hasta: null, tasa: 0.9 },
    ]),
  tramos,
);

// ── Fase 3: ficha del trabajador ────────────────────────────────────────
// prueba-rls-rrhh.mjs dejó: ficha de S1 (RUT 11.111.111-1, contrato.pdf,
// jornada "Turno A"), de S2 (desvinculado) y de T (RUT 12.345.678-5,
// contrato-t.pdf); S3 sin ficha ni RUT.
const srv = createServerClient(URL, env.SERVICE_ROLE_KEY, { cookies: { getAll: () => [], setAll: () => {} } });
const idDe = async (k) =>
  (await srv.from("personal").select("id").eq("email", `rls.${k.toLowerCase()}@test.cordilleramyp.local`).single()).data.id;
const [S1, S3, idA, idT] = [await idDe("S1"), await idDe("S3"), await idDe("A"), await idDe("T")];
const linkMisDatos = (html) => /href="\/mis-datos"/.test(html);

console.log("\n— Ficha: acceso por ruta —");
r = await pedir(`/rrhh/${S1}`, cA);
check("admin abre la ficha de S1 y puede registrar sueldo", r.status === 200 && r.html.includes("11.111.111-1") && r.html.includes("Registrar cambio"), r.status);
check("…con antigüedad calculada y su documento", r.html.includes("años y") && r.html.includes("contrato.pdf"));
const htmlFichaAdmin = r.html;
r = await pedir(`/rrhh/${S1}`, cC);
check("adm. contrato abre la ficha pero sin el formulario de sueldo", r.status === 200 && r.html.includes("11.111.111-1") && !r.html.includes("Registrar cambio") && r.html.includes(AVISO_SOLO_LECTURA), r.status);
for (const ruta of ["/rrhh/jornadas", "/rrhh/tipos-documento"]) {
  r = await pedir(ruta, cC);
  check(`adm. contrato entra a ${ruta}`, r.status === 200, r.status);
}
for (const ruta of [`/rrhh/${S1}`, "/rrhh/jornadas", "/rrhh/tipos-documento"]) {
  r = await pedir(ruta, cS1);
  check(`supervisor escribiendo ${ruta} rebota`, sinPermiso(r), { status: r.status, location: r.location });
}
r = await pedir("/rrhh/no-es-un-id", cA);
check("un id que no es uuid da 404", r.status === 404, r.status);

console.log("\n— Mis datos —");
r = await pedir("/mis-datos", cS1);
check("S1 ve su propia ficha y su documento", r.status === 200 && r.html.includes("11.111.111-1") && r.html.includes("contrato.pdf") && r.html.includes("Turno A"), r.status);
check("…y no ve datos de S2", !r.html.includes("22.222.222-2") && !r.html.includes("cedula.pdf"));
check("S1 tiene el link Mis datos en la barra", linkMisDatos(r.html));
r = await pedir("/mis-datos", cS3);
check("S3 sin ficha ve el aviso, no la ficha de otro", r.status === 200 && r.html.includes("Todavía no tienes una ficha") && !r.html.includes("11.111.111-1"), r.status);
r = await pedir("/dashboard", cS3);
check("S3 sin ficha no tiene el link Mis datos", r.status === 200 && !linkMisDatos(r.html), r.status);

console.log("\n— Ficha: Server Actions —");
const ID_REM = await idAccion(htmlFichaAdmin, "registrarRemuneracion");
const ID_FICHA = await idAccion(htmlFichaAdmin, "guardarFicha");
const ID_DOCS = await idAccion(htmlFichaAdmin, "registrarDocumentos");
const rem = { vigente_desde: "2026-12", liquido_pactado: "900.000", colacion: "0", movilizacion: "20.000", comentario: "Reajuste de prueba" };
g = await llamarAccion(`/rrhh/${S1}`, ID_REM, cC, S1, rem);
check("adm. contrato registrando sueldo directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion(`/rrhh/${S1}`, ID_REM, cA, S1, { ...rem, colacion: "" });
check("admin sin colación: no se guarda como 0", g.resultado?.ok === false && g.resultado.errores?.includes("Falta la colación (escribe 0 si no tiene)."), g.resultado);
g = await llamarAccion(`/rrhh/${S1}`, ID_REM, cA, S1, rem);
check("admin registra un cambio de sueldo", g.resultado?.ok === true, g.resultado ?? g.status);
const { data: ultimo } = await srv
  .from("rrhh_remuneracion_base")
  .select("liquido_pactado, movilizacion, comentario, created_by, vigente_desde")
  .eq("personal_id", S1)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
check(
  "…queda como fila nueva, rige el 1 de diciembre, con autor de la sesión",
  ultimo.liquido_pactado === 900000 && ultimo.vigente_desde === "2026-12-01" && ultimo.comentario === "Reajuste de prueba" && ultimo.created_by === (await idDe("A")),
  ultimo,
);
r = await pedir(`/rrhh/${S1}`, cA);
check("…y aparece en el historial con el valor anterior", r.html.includes("$810.000 → $900.000") && r.html.includes("Reajuste de prueba"));

const { data: cargo } = await srv.from("rrhh_cargos").select("id").limit(1).single();
const fichaS3 = {
  cargo_id: cargo.id, faena_id: "", fecha_ingreso: "2024-01-10", tipo_contrato: "indefinido",
  fecha_termino_contrato: "", afp: "uno", sistema_salud: "fonasa", isapre: "", plan_isapre_uf: "", afecto_afc: true, cargas_familiares: "0",
};
g = await llamarAccion(`/rrhh/${S3}`, ID_FICHA, cS1, S3, fichaS3);
check("supervisor guardando una ficha directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion(`/rrhh/${S3}`, ID_FICHA, cC, S3, { ...fichaS3, cargo_id: "Operario" });
check("adm. contrato con un cargo escrito a mano: rechazado", g.resultado?.ok === false && g.resultado.errores?.includes("Elige el cargo."), g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_FICHA, cC, S3, fichaS3);
check("sin RUT registrado no se crea el contrato", g.resultado?.ok === false && /RUT/.test(g.resultado.mensaje), g.resultado);

// ── Cuenta y acceso (una sola ficha por persona) ────────────────────────
console.log("\n— Cuenta: Server Actions, autorización por campo —");
const ID_CUENTA = await idAccion(htmlFichaAdmin, "guardarCuenta");
const ID_CREAR = await idAccion(htmlFichaAdmin, "crearPersona");
const ID_ACCESO = await idAccion(htmlFichaAdmin, "cambiarAcceso");
const cuentaS3 = {
  nombre: "S3", apellido: "Prueba", rut: "", email: "", telefono: "56900000002",
  fechaNacimiento: "1990-01-01", rol: "supervisor", tiposInspeccion: [],
  contactoNombre: "", contactoTelefono: "", contactoRelacion: "",
};
const rolDe = async (id) => (await srv.from("personal").select("rol").eq("id", id).single()).data.rol;
const tiposDe = async (id) =>
  ((await srv.from("personal_tipos_inspeccion").select("tipo_inspeccion").eq("personal_id", id)).data ?? []).map((t) => t.tipo_inspeccion).sort();
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rol: "administrador" });
check("adm. contrato asciende a administrador llamando la acción: rechazado", g.resultado?.ok === false && /Solo un administrador puede cambiar el rol/.test(g.resultado.mensaje), g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rol: "administrador_contrato" });
check("adm. contrato cambia supervisor → adm. contrato: rechazado", g.resultado?.ok === false && /rol/.test(g.resultado.mensaje), g.resultado);
check("…y el rol de S3 sigue siendo supervisor", (await rolDe(S3)) === "supervisor");
g = await llamarAccion(`/rrhh/${S1}`, ID_CUENTA, cC, S1, { ...cuentaS3, nombre: "S1", telefono: "56911111111", tiposInspeccion: [] });
check("adm. contrato quita los tipos de S1: rechazado", g.resultado?.ok === false && /tipos de inspección/.test(g.resultado.mensaje), g.resultado);
check("…y S1 conserva encarpe", JSON.stringify(await tiposDe(S1)) === '["encarpe"]', await tiposDe(S1));
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rut: "33.333.333-4" });
check("RUT inválido: error con nombre", g.resultado?.ok === false && g.resultado.errores?.[0]?.includes("RUT no es válido"), g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rut: "11.111.111-1" });
check("RUT de otra persona: \"Ya existe una persona con ese RUT\", no el error de Postgres", g.resultado?.mensaje === "Ya existe una persona con ese RUT.", g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rut: "33.333.333-3" });
check("adm. contrato SÍ edita los datos personales (RUT de S3)", g.resultado?.ok === true, g.resultado ?? g.status);
g = await llamarAccion(`/rrhh/${idA}`, ID_CUENTA, cC, idA, { ...cuentaS3, nombre: "A", rol: "administrador", telefono: "" });
check("adm. contrato editando la cuenta de un administrador: rechazado", g.resultado?.ok === false, g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cA, S3, { ...cuentaS3, rut: "33.333.333-3", tiposInspeccion: ["encarpe"] });
check("admin SÍ asigna tipos", g.resultado?.ok === true && JSON.stringify(await tiposDe(S3)) === '["encarpe"]', g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cA, S3, { ...cuentaS3, rut: "33.333.333-3", tiposInspeccion: [] });
check("admin deja a S3 sin tipos de nuevo", g.resultado?.ok === true && (await tiposDe(S3)).length === 0, g.resultado);

const nueva = (rol) => ({
  nombre: "Nueva", apellido: rol, rut: "", email: `rls.nueva.${rol}@test.cordilleramyp.local`, telefono: "56977777777",
  fechaNacimiento: "1995-05-05", rol, tiposInspeccion: [],
  contactoNombre: "", contactoTelefono: "", contactoRelacion: "",
});
g = await llamarAccion("/rrhh/nuevo", ID_CREAR, cC, nueva("administrador"));
check("adm. contrato crea un administrador llamando la acción: rechazado", g.resultado?.ok === false && /solo puede crear personas con rol Trabajador/.test(g.resultado.mensaje), g.resultado);
g = await llamarAccion("/rrhh/nuevo", ID_CREAR, cC, nueva("supervisor"));
check("adm. contrato crea un supervisor: rechazado", g.resultado?.ok === false, g.resultado);
const { count: creados } = await srv.from("personal").select("id", { count: "exact", head: true }).like("email", "rls.nueva.%");
check("…y no quedó ninguna fila creada", creados === 0, creados);
g = await llamarAccion("/rrhh/nuevo", ID_CREAR, cC, nueva("trabajador"));
check("adm. contrato SÍ crea un trabajador (fila = invitación)", g.resultado?.ok === true && !!g.resultado.id, g.resultado);

g = await llamarAccion(`/rrhh/${S3}`, ID_FICHA, cC, S3, fichaS3);
check("con RUT, adm. contrato crea la ficha de S3", g.resultado?.ok === true, g.resultado ?? g.status);
r = await pedir("/dashboard", cS3);
check("…y ahora S3 tiene el link Mis datos", linkMisDatos(r.html));

const { data: tipo } = await srv.from("rrhh_tipos_documento").select("id").eq("nombre", "Otros").single();
g = await llamarAccion(`/rrhh/${S3}`, ID_DOCS, cC, { personalId: S3, tipoId: tipo.id, archivos: [{ ruta: `${S1}/prueba-contrato.pdf`, nombre: "robado.pdf", tamano: 15 }] });
check("registrar como de S3 un archivo de la carpeta de S1: rechazado", g.resultado?.ok === false && /no corresponde/.test(g.resultado.mensaje), g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_DOCS, cC, { personalId: S3, tipoId: tipo.id, archivos: [{ ruta: `${S3}/no-existe.pdf`, nombre: "fantasma.pdf", tamano: 15 }] });
check("registrar un archivo que no está en el bucket: rechazado", g.resultado?.ok === false && /no se alcanzó a subir/.test(g.resultado.mensaje), g.resultado);

console.log("\n— Trabajador: solo lo suyo, solo lectura —");
// Una ruta con loading.tsx ya empezó a transmitir cuando corre la guarda:
// la redirección llega dentro de la respuesta (200 + NEXT_REDIRECT), no
// como 3xx. Las dos formas valen, siempre que no traiga datos.
const redirigeA = (r, destino) =>
  (r.status >= 300 && r.status < 400 && r.location?.endsWith(destino)) ||
  (r.status === 200 && r.html.includes(`NEXT_REDIRECT;replace;${destino};`));
const sinPermisoT = (r) => redirigeA(r, "/mis-datos?error=sin_permiso") && !r.html.includes("AA11");
r = await pedir("/dashboard", cT);
check("al entrar (/dashboard) sigue a /mis-datos, sin aviso de error", redirigeA(r, "/mis-datos") && !r.html.includes("AA11"), { status: r.status, location: r.location });
r = await pedir("/mis-datos", cT);
check("ve su ficha, su RUT y su documento", r.status === 200 && r.html.includes("12.345.678-5") && r.html.includes("contrato-t.pdf"), r.status);
check("…y nada de otros", !r.html.includes("11.111.111-1") && !r.html.includes(">contrato.pdf<"));
check("su barra solo tiene Mis datos (sin RRHH)", linkMisDatos(r.html) && !linkRrhh(r.html) && !r.html.includes('href="/dashboard/analitica"'));
const { data: unTicket } = await srv.from("tickets").select("id").limit(1).single();
for (const ruta of ["/rrhh", `/rrhh/${S1}`, "/rrhh/nuevo", "/rrhh/cargos", "/rrhh/parametros", "/cotizaciones", "/configuracion", "/dashboard/analitica", "/tickets/new", `/tickets/${unTicket.id}`, `/tickets/${unTicket.id}/report`]) {
  r = await pedir(ruta, cT);
  check(`trabajador escribiendo ${ruta} rebota`, sinPermisoT(r), { status: r.status, location: r.location });
}
g = await llamarAccion(`/rrhh/${idT}`, ID_CUENTA, cT, idT, { ...cuentaS3, nombre: "T", telefono: "56999999999" });
check("trabajador editando su cuenta llamando la acción: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion(`/rrhh/${idT}`, ID_FICHA, cT, idT, fichaS3);
check("trabajador editando su ficha: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion(`/rrhh/${idT}`, ID_DOCS, cT, { personalId: idT, tipoId: tipo.id, archivos: [{ ruta: `${idT}/x.pdf`, nombre: "x.pdf", tamano: 15 }] });
check("trabajador registrando un documento: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion(`/rrhh/${S1}`, ID_ACCESO, cT, { personalId: S1, activo: false });
check("trabajador suspendiendo a otro: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
const telT = (await srv.from("personal").select("telefono").eq("id", idT).single()).data.telefono;
check("…y su fila quedó igual", telT === null, telT);

console.log("\n— Correo repetido —");
g = await llamarAccion("/rrhh/nuevo", ID_CREAR, cC, { ...nueva("trabajador"), email: "RLS.Nueva.Trabajador@test.cordilleramyp.local" });
check("el mismo correo con otras mayúsculas: \"Ya existe una persona con ese correo\"", g.resultado?.mensaje === "Ya existe una persona con ese correo.", g.resultado);

console.log("\n— Faenas (antes Áreas) —");
r = await pedir("/rrhh/faenas", cC);
check("adm. contrato entra a /rrhh/faenas", r.status === 200 && r.html.includes("Faenas"), r.status);
r = await pedir("/rrhh/areas", cA);
check("/rrhh/areas ya no existe (404)", r.status === 404, r.status);
r = await pedir("/rrhh", cA);
check("el listado filtra por faena", r.html.includes('name="faena"') && r.html.includes("Todas las faenas"));

console.log("\n— Contacto de emergencia —");
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rut: "33.333.333-3", contactoTelefono: "9 8888 7777" });
check("un teléfono de emergencia sin nombre: rechazado con mensaje", g.resultado?.ok === false && g.resultado.errores?.includes("Falta el nombre del contacto de emergencia."), g.resultado);
g = await llamarAccion(`/rrhh/${S3}`, ID_CUENTA, cC, S3, { ...cuentaS3, rut: "33.333.333-3", contactoNombre: "Rosa Prueba", contactoTelefono: "9 8888 7777", contactoRelacion: "hermana" });
check("adm. contrato registra el contacto de S3", g.resultado?.ok === true, g.resultado);
const { data: contactoS3 } = await srv.from("personal").select("contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion").eq("id", S3).single();
check("…normalizado", JSON.stringify(contactoS3) === JSON.stringify({ contacto_emergencia_nombre: "Rosa Prueba", contacto_emergencia_telefono: "56988887777", contacto_emergencia_relacion: "hermana" }), contactoS3);
r = await pedir(`/rrhh/${S3}`, cA);
check("la ficha lo muestra en el formulario de la cuenta", r.html.includes("Rosa Prueba") && r.html.includes("+56 9 8888 7777"));
r = await pedir("/mis-datos", cT);
check("T ve su propio contacto en Mis datos (solo lectura)", r.html.includes("María Prueba") && r.html.includes("+56 9 8765 4321") && !r.html.includes("Rosa Prueba"));
r = await pedir("/mis-datos", cS1);
check("S1 no ve el contacto de T", !r.html.includes("María Prueba") && !r.html.includes("8765"));

console.log("\n— Cargo sugerido por rol (solo valor inicial) —");
const { data: nuevaT } = await srv.from("personal").select("id").eq("email", "rls.nueva.trabajador@test.cordilleramyp.local").single();
const { data: encarpador } = await srv.from("rrhh_cargos").select("id").eq("nombre", "Encarpador").single();
r = await pedir(`/rrhh/${nuevaT.id}`, cA);
check("un trabajador sin contrato abre el formulario con Encarpador elegido", new RegExp(`<option value="${encarpador.id}" selected=""`).test(r.html));
r = await pedir(`/rrhh/${S1}`, cA);
check("una ficha existente conserva su cargo (no se recalcula)", !new RegExp(`<option value="${encarpador.id}" selected=""`).test(r.html));

console.log("\n— Turnos: acceso por ruta —");
r = await pedir("/rrhh/turnos", cA);
check("admin entra a /rrhh/turnos", r.status === 200 && r.html.includes("Asignar turno") && r.html.includes("Art. 10 Nº5"), r.status);
const htmlTurnos = r.html;
r = await pedir("/rrhh/turnos", cC);
check("adm. contrato entra a /rrhh/turnos", r.status === 200, r.status);
r = await pedir("/rrhh/turnos", cS1);
check("supervisor escribiendo /rrhh/turnos rebota", sinPermiso(r), { status: r.status, location: r.location });
r = await pedir("/rrhh/turnos", cT);
check("trabajador escribiendo /rrhh/turnos rebota", sinPermisoT(r), { status: r.status, location: r.location });
r = await pedir(`/rrhh/${S1}`, cA);
check("la ficha ya no asigna jornadas (solo historial)", r.status === 200 && !r.html.includes('id="jornada-desde"') && r.html.includes('href="/rrhh/turnos"'));

console.log("\n— Turnos: Server Actions (todo o nada) —");
const ID_TURNO = await idAccion(htmlTurnos, "asignarTurno");
const ID_CORREGIR = await idAccion(htmlTurnos, "corregirAsignacion");
const ID_ANULAR = await idAccion(htmlTurnos, "anularAsignacion");
const idS2 = await idDe("S2");
const { data: jornadas } = await srv.from("rrhh_jornadas").select("id, nombre, activo");
const turnoA = jornadas.find((j) => j.nombre === "Turno A").id;
const turnoB = jornadas.find((j) => j.nombre === "Turno B").id;
const asignacionesDe = async (id) =>
  (await srv.from("rrhh_jornada_trabajador").select("id, vigente_desde, vigente_hasta, created_by, anulada_en").eq("personal_id", id).order("vigente_desde")).data ?? [];
const turno = (personalIds, desde, hasta, jornadaId = turnoA) => ({ jornadaId, desde, hasta, personalIds });
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cS1, turno([S3], "2026-04-01", "2026-04-30"));
check("supervisor asignando turnos directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cT, turno([idT], "2026-04-01", "2026-04-30"));
check("trabajador asignándose un turno directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cC, turno([S3, idT], "2026-04-01", "2026-04-30", turnoB));
check("jornada desactivada: rechazado", g.resultado?.ok === false && /desactivada/.test(g.resultado.mensaje), g.resultado);
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cC, turno([S3, idS2], "2026-04-01", "2026-04-30"));
check("con un desvinculado: no se asigna a nadie y se dice quién", g.resultado?.ok === false && g.resultado.errores?.some((e) => /S2 Prueba está desvinculado/.test(e)), g.resultado);
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cC, turno([S3, idT, S1], "2026-03-05", "2026-03-20"));
check(
  "S1 choca: no se asigna a nadie y se muestran sus dos asignaciones",
  g.resultado?.ok === false && g.resultado.conflictos?.length === 2 && g.resultado.conflictos.every((c) => c.persona === "S1 Prueba" && c.jornada === "Turno A"),
  g.resultado,
);
check("…S3 y T siguen sin asignaciones (todo o nada)", (await asignacionesDe(S3)).length === 0 && (await asignacionesDe(idT)).length === 0);
g = await llamarAccion("/rrhh/turnos", ID_TURNO, cC, turno([S3, idT], "2026-04-01", "2026-04-30"));
check("adm. contrato asigna abril a S3 y T de una vez", g.resultado?.ok === true && g.resultado.asignadas === 2, g.resultado);
const [abrilT] = await asignacionesDe(idT);
check("…con autor de la sesión", abrilT?.created_by === (await idDe("C")) && abrilT.vigente_hasta === "2026-04-30", abrilT);

g = await llamarAccion("/rrhh/turnos", ID_CORREGIR, cC, { id: abrilT.id, desde: "2026-04-01", hasta: "2026-04-15", motivo: "" });
check("corregir sin motivo: rechazado con mensaje", g.resultado?.ok === false && /motivo/.test(g.resultado.mensaje), g.resultado);
g = await llamarAccion("/rrhh/turnos", ID_CORREGIR, cT, { id: abrilT.id, desde: "2026-04-01", hasta: "2030-01-01", motivo: "yo" });
check("trabajador corrigiendo su turno directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion("/rrhh/turnos", ID_CORREGIR, cC, { id: abrilT.id, desde: "2026-04-01", hasta: "2026-04-15", motivo: "Rota a tarde la segunda quincena" });
check("adm. contrato corrige el rango de T", g.resultado?.ok === true, g.resultado);
const s1Marzo = (await asignacionesDe(S1)).find((a) => a.vigente_desde === "2026-03-01");
g = await llamarAccion("/rrhh/turnos", ID_CORREGIR, cA, { id: s1Marzo.id, desde: "2026-03-01", hasta: "2026-03-10", motivo: "Extiende" });
check("corregir hacia un choque: rechazado mostrando con qué", g.resultado?.ok === false && g.resultado.conflictos?.length === 1, g.resultado);

r = await pedir("/rrhh/turnos?mes=2026-04", cA);
check("el mes muestra el hueco con nombre y fechas", r.html.includes("Del 16-04-2026 al 30-04-2026 T Prueba no tiene jornada asignada."));
check("…y no inventa huecos de quien tiene el mes cubierto", !r.html.includes("S3 Prueba no tiene jornada asignada"));
r = await pedir(`/rrhh/${idT}`, cA);
// React separa los fragmentos de texto con <!-- -->: se comparan sin ellos.
const plano = (html) => html.replace(/<!-- -->/g, "");
check("la ficha de T muestra la corrección con autor y motivo", /Corregida el [^<]* por C Prueba \(del 01-04-2026 al 15-04-2026\): Rota a tarde la segunda quincena/.test(plano(r.html)), plano(r.html).match(/Corregida[^<]{0,160}/)?.[0]);

g = await llamarAccion("/rrhh/turnos", ID_ANULAR, cT, { id: abrilT.id, motivo: "no quiero" });
check("trabajador anulando su turno directo: rechazado", rechazada(g), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await llamarAccion("/rrhh/turnos", ID_ANULAR, cC, { id: abrilT.id, motivo: "Se asignó por error" });
check("adm. contrato anula la asignación de T", g.resultado?.ok === true, g.resultado);
check("…la fila sigue ahí, anulada (no se borra)", !!(await asignacionesDe(idT))[0]?.anulada_en);
g = await llamarAccion("/rrhh/turnos", ID_ANULAR, cC, { id: abrilT.id, motivo: "otra vez" });
check("anular dos veces: rechazado", g.resultado?.ok === false && /ya estaba anulada/.test(g.resultado.mensaje), g.resultado);
r = await pedir("/mis-datos", cT);
// T no lee la fila de quien anuló (RLS de personal): ve la acción y el
// motivo sin autor, igual que en su historial de sueldo.
check("T ve su historial con la anulación, sin poder tocarlo", /Anulada el [^<]*: Se asignó por error/.test(plano(r.html)) && !r.html.includes(">Corregir<"), plano(r.html).match(/Anulada[^<]{0,160}/)?.[0]);

console.log("\n— /usuarios ya no existe —");
r = await pedir("/usuarios", cA);
check("admin escribiendo /usuarios: redirige a /rrhh", r.status >= 300 && r.status < 400 && r.location?.endsWith("/rrhh"), { status: r.status, location: r.location });
r = await pedir("/usuarios", cS1);
check("supervisor escribiendo /usuarios: no ve nada (redirige)", r.status >= 300 && r.status < 400 && !r.html, { status: r.status, location: r.location });
r = await pedir("/rrhh", cA);
check("la barra del admin ya no tiene Usuarios", r.status === 200 && !r.html.includes('href="/usuarios"'));

console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas ? 1 : 0);
