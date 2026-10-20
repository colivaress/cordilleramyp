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

console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas ? 1 : 0);
