/**
 * ⚠️  SOLO PARA LA BASE LOCAL (npx supabase start) — aborta contra cualquier otra.
 * ─────────────────────────────────────────────────────────────────────────────
 * Prueba la frontera RLS del módulo RRHH (Fase 0) con consultas AUTENTICADAS
 * reales: crea un administrador, un administrador de contrato y tres
 * supervisores, inicia sesión con cada uno y comprueba qué puede leer y
 * escribir en `personal` y en las tablas rrhh_*. Una política no está probada
 * hasta que se ejecuta una consulta contra ella.
 *
 * Escenario: S2 tiene un ticket "con observaciones" de Encarpe; S1 tiene
 * permiso de Encarpe (lo puede ver), S3 no tiene ningún permiso.
 *
 * Uso (base recién reseteada, sin estos correos ya creados):
 *   npx supabase db reset --local
 *   CLAVE='<clave de prueba>' node scripts/prueba-rls-rrhh.mjs
 * Lee URL y llaves de `npx supabase status -o env`, nunca de .env.local
 * (que apunta a la base remota). Al agregar una tabla rrhh_* nueva, sumar
 * aquí sus casos de lectura propia/ajena y de escritura por rol.
 */

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { filasFicticias } from "../src/lib/rrhh/parametros-ficticios.prueba.ts";

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
const CLAVE = process.env.CLAVE;
if (URL !== "http://127.0.0.1:54321") {
  console.error("ABORTA: no es la base local:", URL);
  process.exit(1);
}
if (!CLAVE) {
  console.error("Falta la variable CLAVE (clave de las cuentas de prueba)");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const srv = createClient(URL, env.SERVICE_ROLE_KEY, opts);
const must = (r, l) => {
  if (r.error) {
    console.error("SETUP", l, r.error);
    process.exit(1);
  }
  return r.data;
};

// ── Setup (service role) ────────────────────────────────────────────────
const P = {};
for (const [k, rol, tel] of [
  ["A", "administrador", null],
  ["C", "administrador_contrato", null],
  ["S1", "supervisor", "56911111111"],
  ["S2", "supervisor", "56922222222"],
  ["S3", "supervisor", "56933333333"],
]) {
  const email = `rls.${k.toLowerCase()}@test.cordilleramyp.local`;
  const p = must(
    await srv
      .from("personal")
      .insert({ nombre: k, apellido: "Prueba", rol, email, telefono: tel, fecha_nacimiento: "1990-01-01" })
      .select("id")
      .single(),
    "personal " + k,
  );
  must(await srv.auth.admin.createUser({ email, password: CLAVE, email_confirm: true }), "auth " + k);
  P[k] = { id: p.id, email };
}
must(
  await srv.from("personal_tipos_inspeccion").insert([
    { personal_id: P.S1.id, tipo_inspeccion: "encarpe" },
    { personal_id: P.S2.id, tipo_inspeccion: "encarpe" },
  ]),
  "permisos",
);
const ticket = {
  transporte: "T",
  conductor: "C",
  procedencia: "Local",
  tipo_camion: "Sider",
  patente_rampla: "BB22",
  tipo_inspeccion: "encarpe",
};
must(
  await srv.from("tickets").insert({
    ...ticket,
    fecha: new Date().toISOString(),
    patente_camion: "AA11",
    estado: "finalizada_con_observaciones",
    supervisor_id: P.S2.id,
  }),
  "ticket S2",
);
must(
  await srv.from("rrhh_remuneracion_base").insert([
    { personal_id: P.S1.id, liquido_pactado: 800000, vigente_desde: "2026-10-01" },
    { personal_id: P.S2.id, liquido_pactado: 950000, vigente_desde: "2026-10-01" },
  ]),
  "rrhh",
);

const login = async (k) => {
  const c = createClient(URL, env.ANON_KEY, opts);
  must(await c.auth.signInWithPassword({ email: P[k].email, password: CLAVE }), "login " + k);
  return c;
};
const [A, C, S1, , S3] = await Promise.all(["A", "C", "S1", "S2", "S3"].map(login));
const anon = createClient(URL, env.ANON_KEY, opts);
const nombre = (id) => Object.entries(P).find(([, v]) => v.id === id)?.[0] ?? id;

// ── Pruebas ────────────────────────────────────────────────────────────
let fallas = 0;
const check = (desc, ok, detalle) => {
  console.log(`${ok ? "OK   " : "FALLA"} ${desc}${detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""}`);
  if (!ok) fallas++;
};
const rrhh = async (c) =>
  (await c.from("rrhh_remuneracion_base").select("personal_id")).data?.map((r) => nombre(r.personal_id)).sort() ?? [];
const pers = async (c) => (await c.from("personal").select("id")).data?.map((r) => nombre(r.id)).sort() ?? [];
let v;

console.log("\n— rrhh_remuneracion_base: lectura —");
v = await rrhh(S1);
check("S1 solo ve su propia remuneración", JSON.stringify(v) === '["S1"]', v);
v = (await S1.from("rrhh_remuneracion_base").select("*").eq("personal_id", P.S2.id)).data;
check("S1 pidiendo la de S2 por id: 0 filas", v?.length === 0, v?.length);
v = await rrhh(S3);
check("S3 (sin remuneración) no ve ninguna", v.length === 0, v);
v = await rrhh(C);
check("Adm. contrato ve todas", JSON.stringify(v) === '["S1","S2"]', v);
v = await rrhh(A);
check("Administrador ve todas", JSON.stringify(v) === '["S1","S2"]', v);
v = await anon.from("rrhh_remuneracion_base").select("*");
check("Anónimo no lee nada", !!v.error || v.data.length === 0, v.error?.message ?? v.data.length);

console.log("\n— rrhh_remuneracion_base: escritura de montos —");
v = await S1.from("rrhh_remuneracion_base").insert({ personal_id: P.S1.id, liquido_pactado: 9999999, vigente_desde: "2026-11-01" });
check("S1 no puede insertarse un sueldo", !!v.error, v.error?.message);
v = await S1.from("rrhh_remuneracion_base").update({ liquido_pactado: 9999999 }).eq("personal_id", P.S1.id).select();
check("S1 no puede cambiar su sueldo (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await C.from("rrhh_remuneracion_base").insert({ personal_id: P.S1.id, liquido_pactado: 1, vigente_desde: "2026-11-01" });
check("Adm. contrato no puede insertar montos", !!v.error, v.error?.message);
v = await C.from("rrhh_remuneracion_base").update({ liquido_pactado: 1 }).eq("personal_id", P.S1.id).select();
check("Adm. contrato no puede editar montos (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("rrhh_remuneracion_base")
  .insert({ personal_id: P.S2.id, liquido_pactado: 1000000, vigente_desde: "2026-11-01" })
  .select("liquido_pactado")
  .single();
check("Administrador inserta con RETURNING", !v.error && v.data?.liquido_pactado === 1000000, v.error?.message ?? v.data);
v = await A.from("rrhh_remuneracion_base").update({ liquido_pactado: 810000 }).eq("personal_id", P.S1.id).select("liquido_pactado");
check("Administrador edita montos", !v.error && v.data.length === 1, v.error?.message ?? v.data);
v = await A.from("rrhh_remuneracion_base").delete().eq("personal_id", P.S1.id).select();
check("Nadie borra remuneraciones (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = (await srv.from("rrhh_remuneracion_base").select("liquido_pactado").eq("personal_id", P.S1.id).single()).data;
check("El sueldo de S1 quedó en lo que fijó el administrador", v?.liquido_pactado === 810000, v);

// Valores FICTICIOS, del archivo que lo dice en el nombre: solo prueban permisos.
const periodo = (anio, mes) => filasFicticias(anio, mes).periodo;
const afps = (anio, mes, comision) => filasFicticias(anio, mes).afps.map((a) => ({ ...a, comision }));

console.log("\n— rrhh_parametros_periodo / rrhh_afp_periodo —");
v = await A.from("rrhh_parametros_periodo").upsert(periodo(2026, 10)).select("utm").single();
check("Administrador carga un período con RETURNING", !v.error && v.data?.utm === 50000, v.error?.message ?? v.data);
v = await A.from("rrhh_afp_periodo").upsert(afps(2026, 10, 0.5)).select("afp");
check("Administrador carga las 7 comisiones de AFP", !v.error && v.data.length === 7, v.error?.message ?? v.data?.length);
v = await A.from("rrhh_parametros_periodo").upsert({ ...periodo(2026, 10), utm: 50001 }).select("utm").single();
check("Administrador corrige el período (upsert)", !v.error && v.data?.utm === 50001, v.error?.message ?? v.data);
v = await A.from("rrhh_parametros_periodo").select("uf_mes, tasa_sis, tramos_impuesto").eq("anio", 2026).eq("mes", 10).single();
check(
  "numeric llega como número, no como texto (lo exige desdeBase)",
  typeof v.data?.uf_mes === "number" && v.data.uf_mes === 10100.25 && v.data.tasa_sis === 1.5,
  v.data && { uf_mes: v.data.uf_mes, tasa_sis: v.data.tasa_sis },
);
v = await C.from("rrhh_parametros_periodo").select("anio");
check("Adm. contrato NO lee los períodos (configuración del sistema)", !v.error && v.data.length === 0, v.error?.message ?? v.data?.length);
v = await C.from("rrhh_afp_periodo").select("afp");
check("Adm. contrato NO lee las comisiones", !v.error && v.data.length === 0, v.error?.message ?? v.data?.length);
v = await C.from("rrhh_parametros_periodo").insert(periodo(2026, 11));
check("Adm. contrato no puede cargar un período", !!v.error, v.error?.message);
v = await C.from("rrhh_parametros_periodo").update({ utm: 1 }).eq("anio", 2026).select();
check("Adm. contrato no puede corregir un período (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await C.from("rrhh_afp_periodo").update({ comision: 9 }).eq("anio", 2026).select();
check("Adm. contrato no puede cambiar comisiones (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_parametros_periodo").select("anio");
check("Supervisor no lee períodos", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_afp_periodo").select("afp");
check("Supervisor no lee comisiones", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_parametros_periodo").insert(periodo(2026, 12));
check("Supervisor no puede cargar un período", !!v.error, v.error?.message);
v = await S1.from("rrhh_afp_periodo").insert(afps(2026, 10, 9)[0]);
check("Supervisor no puede escribir comisiones", !!v.error, v.error?.message);
v = await anon.from("rrhh_parametros_periodo").select("anio");
check("Anónimo no lee períodos", !!v.error || v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("rrhh_parametros_periodo").delete().eq("anio", 2026).select();
check("Nadie borra un período (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("rrhh_afp_periodo").insert({ anio: 2027, mes: 1, afp: "uno", comision: 1 });
check("Una comisión sin su período se rechaza (FK)", !!v.error, v.error?.message);
v = await A.from("rrhh_parametros_periodo").insert({ ...periodo(2027, 1), tramos_impuesto: {} });
check("Tramos que no son un arreglo se rechazan (check)", !!v.error, v.error?.message);
v = (await srv.from("rrhh_afp_periodo").select("comision").eq("anio", 2026).eq("afp", "uno").single()).data;
check("La comisión quedó en lo que fijó el administrador", v?.comision === 0.5, v);

console.log("\n— rrhh_mutual_adicional (de la empresa, con vigencia) —");
v = await A.from("rrhh_mutual_adicional")
  .insert({ vigente_desde: "2026-01-01", vigente_hasta: "2027-01-01", tasa: 0.5 })
  .select("tasa")
  .single();
check("Administrador registra un tramo con RETURNING", !v.error && v.data?.tasa === 0.5, v.error?.message ?? v.data);
v = await A.from("rrhh_mutual_adicional").insert({ vigente_desde: "2026-06-01", vigente_hasta: null, tasa: 0.9 });
check("Un tramo que se solapa se rechaza (exclude)", !!v.error, v.error?.message);
v = await A.from("rrhh_mutual_adicional").insert({ vigente_desde: "2027-01-15", tasa: 0.9 });
check("Un tramo que no parte el día 1 se rechaza", !!v.error, v.error?.message);
v = await A.from("rrhh_mutual_adicional").insert({ vigente_desde: "2027-01-01", tasa: 0.9 }).select("id");
check("Un tramo contiguo sí se acepta", !v.error && v.data.length === 1, v.error?.message);
v = await C.from("rrhh_mutual_adicional").select("tasa");
check("Adm. contrato NO lee la tasa adicional", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await C.from("rrhh_mutual_adicional").insert({ vigente_desde: "2030-01-01", tasa: 1 });
check("Adm. contrato no puede registrar tasas", !!v.error, v.error?.message);
v = await S1.from("rrhh_mutual_adicional").select("tasa");
check("Supervisor no lee la tasa adicional", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_mutual_adicional").update({ tasa: 9 }).gte("tasa", 0).select();
check("Supervisor no puede cambiar la tasa (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("rrhh_mutual_adicional").delete().gte("tasa", 0).select();
check("Nadie borra un tramo (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);

console.log("\n— personal: lectura —");
v = await pers(S3);
check("S3 solo ve su propia fila", JSON.stringify(v) === '["S3"]', v);
v = await pers(S1);
check("S1 ve la suya + S2 (supervisor de un ticket que S1 ve)", JSON.stringify(v) === '["S1","S2"]', v);
v = (await S1.from("personal").select("id").eq("id", P.A.id)).data;
check("S1 pidiendo la fila del administrador: 0", v?.length === 0, v?.length);
v = (await S1.from("personal").select("fecha_nacimiento").eq("id", P.S3.id)).data;
check("S1 no lee fecha_nacimiento de S3", v?.length === 0, v);
v = await pers(C);
check("Adm. contrato ve todo personal", v.length === 5, v);
v = await pers(A);
check("Administrador ve todo personal", v.length === 5, v);
v = await anon.from("personal").select("id");
check("Anónimo no lee personal", !!v.error || v.data.length === 0, v.error?.message ?? v.data.length);

console.log("\n— personal: lo que la app necesita sigue funcionando —");
v = await S1.from("tickets").select("numero_inspeccion, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido)");
check("S1 ve el nombre del supervisor en el ticket ajeno", v.data?.[0]?.supervisor?.nombre === "S2", v.error?.message ?? v.data);
v = await S1.from("personal").select("*").eq("user_id", (await S1.auth.getUser()).data.user.id).single();
check("S1 lee su propia fila completa (auth.ts)", !v.error && v.data?.nombre === "S1", v.error?.message);
v = await A.from("personal")
  .insert({ nombre: "Nuevo", apellido: "Prueba", rol: "supervisor", email: "rls.nuevo@test.cordilleramyp.local", telefono: "56944444444" })
  .select("id, nombre")
  .single();
check("Administrador crea personal con RETURNING", !v.error && v.data?.nombre === "Nuevo", v.error?.message);
v = await C.from("personal")
  .insert({ nombre: "Nuevo2", apellido: "Prueba", rol: "supervisor", email: "rls.nuevo2@test.cordilleramyp.local", telefono: "56955555555" })
  .select("id")
  .single();
check("Adm. contrato crea supervisor con RETURNING", !v.error, v.error?.message);
v = await A.from("personal").update({ telefono: "56900000001" }).eq("id", P.S3.id).select("telefono");
check("Administrador edita personal", !v.error && v.data.length === 1, v.error?.message ?? v.data);
v = await S1.from("tickets")
  .insert({ ...ticket, fecha: new Date().toISOString(), patente_camion: "CC33", supervisor_id: P.S1.id })
  .select("numero_inspeccion")
  .single();
check("S1 crea su ticket con RETURNING (sin cambios)", !v.error && v.data?.numero_inspeccion > 0, v.error?.message);

console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas ? 1 : 0);
