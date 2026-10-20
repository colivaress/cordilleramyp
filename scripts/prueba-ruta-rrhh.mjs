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

const [cA, cC, cS1] = [await cookiesDe("A"), await cookiesDe("C"), await cookiesDe("S1")];
let r;

console.log("\n— Administrador —");
r = await pedir("/rrhh", cA);
check("entra a /rrhh", r.status === 200, r.status);
check("ve el líquido vigente de S1 y S2 (no el de vigencia futura)", r.html.includes("$810.000") && r.html.includes("$950.000") && !r.html.includes("$1.000.000"));
check("no ve el aviso de solo lectura", !r.html.includes(AVISO_SOLO_LECTURA));
check("tiene el link RRHH en la barra", linkRrhh(r.html));

console.log("\n— Administrador de contrato —");
r = await pedir("/rrhh", cC);
check("entra a /rrhh", r.status === 200, r.status);
check("ve los montos", r.html.includes("$810.000") && r.html.includes("$950.000"));
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
async function idAccion(html) {
  for (const [, src] of html.matchAll(/src="([^"]+\.js[^"]*)"/g)) {
    const js = await (await fetch(APP + src)).text();
    const m = js.match(/"([0-9a-f]{40,})":\{"name":"guardarParametrosPeriodo"\}/);
    if (m) return m[1];
  }
  throw new Error("no se encontró el id de guardarParametrosPeriodo");
}
const ID = await idAccion(r.html);
async function guardar(cookie, formulario) {
  const res = await fetch(APP + "/rrhh/parametros/" + `${formulario.anio}-${String(formulario.mes).padStart(2, "0")}`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "Next-Action": ID, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([formulario]),
  });
  const texto = await res.text();
  const m = texto.match(/\{"ok":(true|false)[^\n]*\}/);
  return { status: res.status, redirect: res.headers.get("x-action-redirect"), resultado: m ? JSON.parse(m[0]) : null };
}
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
check("adm. contrato llamando la acción directo: rechazado", g.resultado?.ok !== true && (g.redirect?.includes("sin_permiso") || (g.status >= 300 && g.status < 400)), { status: g.status, redirect: g.redirect, resultado: g.resultado });
g = await guardar(cS1, formulario("51.000"));
check("supervisor llamando la acción directo: rechazado", g.resultado?.ok !== true && (g.redirect?.includes("sin_permiso") || (g.status >= 300 && g.status < 400)), { status: g.status, redirect: g.redirect, resultado: g.resultado });
r = await pedir("/rrhh/parametros", cA);
check("…y noviembre sigue sin existir", !r.html.includes("noviembre 2026"));
g = await guardar(cA, formulario("51.000"));
check("admin guarda noviembre completo", g.resultado?.ok === true, g.resultado ?? g.status);
r = await pedir("/rrhh/parametros", cA);
check("noviembre aparece completo en el listado", r.html.includes("noviembre 2026") && (r.html.match(/>Completo</g) ?? []).length === 2 && !r.html.includes(">Incompleto<"), (r.html.match(/>Completo</g) ?? []).length);
r = await pedir("/rrhh/parametros/2026-11", cA);
check("al reabrirlo trae la UTM guardada", /id="utm"[^>]*value="51000"/.test(r.html) || /value="51000"[^>]*id="utm"/.test(r.html));

console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas ? 1 : 0);
