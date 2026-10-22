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
  // Rol `trabajador` (ficha única): solo lo suyo, solo lectura.
  ["T", "trabajador", null],
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
const ticketS2 = must(
  await srv
    .from("tickets")
    .insert({
      ...ticket,
      fecha: new Date().toISOString(),
      patente_camion: "AA11",
      estado: "finalizada_con_observaciones",
      supervisor_id: P.S2.id,
    })
    .select("id")
    .single(),
  "ticket S2",
);
// Filas en las tablas operativas: el barrido del trabajador (al final) solo
// prueba una política si hay algo que leer, editar o borrar.
const item = must(await srv.from("checklist_items").select("key, nombre, orden, modo").limit(1).single(), "item");
must(
  await srv.from("ticket_revisiones").insert({
    ticket_id: ticketS2.id,
    numero_revision: 1,
    estado_resultante: "finalizada_con_observaciones",
    supervisor_id: P.S2.id,
  }),
  "revision S2",
);
const respuesta = must(
  await srv
    .from("ticket_checklist_respuestas")
    .insert({
      ticket_id: ticketS2.id,
      revision_numero: 1,
      item_key: item.key,
      item_nombre: item.nombre,
      item_orden: item.orden,
      item_modo: item.modo,
      estado: "conforme",
    })
    .select("id")
    .single(),
  "respuesta S2",
);
must(await srv.from("ticket_checklist_fotos").insert({ respuesta_id: respuesta.id, url: `${ticketS2.id}/x.jpg` }), "foto S2");
must(await srv.from("notificaciones").insert({ ticket_id: ticketS2.id, tipo: "email", destinatario: "x@test.cordilleramyp.local" }), "notif");
must(await srv.from("destinatarios_correo").insert({ nombre: "Dest", email: "dest@test.cordilleramyp.local" }), "dest");
must(
  await srv.from("cotizaciones_fletes").insert({
    tipo_solicitante: "particular",
    nombre: "N",
    apellido: "A",
    rut: "111111111",
    correo: "c@test.cordilleramyp.local",
    telefono: "56911111111",
    tipo_carga: "x",
    peso: "1",
    fecha_estimada: "2026-12-01",
    requiere_encarpe: false,
    origen_calle: "a",
    origen_region: "b",
    origen_comuna: "c",
    destino_calle: "a",
    destino_region: "b",
    destino_comuna: "c",
  }),
  "cotizacion",
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
const [A, C, S1, , S3, T] = await Promise.all(["A", "C", "S1", "S2", "S3", "T"].map(login));
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
  // Vigencia muy futura a propósito: la prueba de rutas comprueba que no se
  // muestre, y no debe dejar de cumplirse con el paso del calendario.
  .insert({ personal_id: P.S2.id, liquido_pactado: 1000000, vigente_desde: "2099-01-01", comentario: "Futuro" })
  .select("liquido_pactado")
  .single();
check("Administrador inserta con RETURNING", !v.error && v.data?.liquido_pactado === 1000000, v.error?.message ?? v.data);
// Fase 3: la tabla solo se agrega (es el historial de sueldo, §16.3). Una
// corrección es otra fila con la misma vigencia; nadie edita ni borra.
v = await A.from("rrhh_remuneracion_base").update({ liquido_pactado: 1 }).eq("personal_id", P.S1.id).select();
check("Ni el administrador edita una fila de sueldo (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("rrhh_remuneracion_base")
  .insert({ personal_id: P.S1.id, liquido_pactado: 810000, vigente_desde: "2026-10-01", comentario: "Corrección", created_by: P.A.id })
  .select("liquido_pactado")
  .single();
check("Administrador corrige con una fila nueva de la misma vigencia", !v.error && v.data?.liquido_pactado === 810000, v.error?.message ?? v.data);
v = await A.from("rrhh_remuneracion_base").delete().eq("personal_id", P.S1.id).select();
check("Nadie borra remuneraciones (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = (await srv.from("rrhh_remuneracion_base").select("liquido_pactado").eq("personal_id", P.S1.id).order("created_at")).data;
check("Quedan las dos filas de S1: la original y la corrección", JSON.stringify(v?.map((x) => x.liquido_pactado)) === "[800000,810000]", v);

console.log("\n— rrhh_historial_sueldo (vista con la RLS de quien consulta) —");
v = (await S1.from("rrhh_historial_sueldo").select("personal_id, liquido_pactado, liquido_pactado_anterior").order("created_at")).data;
check(
  "S1 ve solo su historial, con el valor anterior",
  JSON.stringify(v?.map((h) => [nombre(h.personal_id), h.liquido_pactado, h.liquido_pactado_anterior])) === '[["S1",800000,null],["S1",810000,800000]]',
  v,
);
v = (await S3.from("rrhh_historial_sueldo").select("id")).data;
check("S3 no ve historial ajeno", v?.length === 0, v?.length);
v = (await C.from("rrhh_historial_sueldo").select("id")).data;
check("Adm. contrato ve todo el historial", v?.length === 4, v?.length);
v = await anon.from("rrhh_historial_sueldo").select("id");
check("Anónimo no lee el historial", !!v.error || v.data.length === 0, v.error?.message ?? v.data.length);

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

// ── Fase 3: ficha, jornadas, documentos ─────────────────────────────────
console.log("\n— rrhh_cargos / rrhh_faenas (catálogos con baja lógica) —");
v = await C.from("rrhh_cargos").insert({ nombre: "Supervisor de encarpe" }).select("id").single();
check("Adm. contrato agrega un cargo con RETURNING", !v.error && !!v.data?.id, v.error?.message);
const cargoId = v.data?.id;
v = await A.from("rrhh_cargos").insert({ nombre: "SUPERVISOR DE ENCARPE" });
check("El mismo cargo con otras mayúsculas se rechaza", !!v.error, v.error?.message);
v = await A.from("rrhh_cargos").insert({ nombre: " Encarpador " });
check("Un nombre con espacios sobrantes se rechaza", !!v.error, v.error?.message);
v = await S1.from("rrhh_cargos").insert({ nombre: "Gerente" });
check("Supervisor no agrega cargos", !!v.error, v.error?.message);
v = await T.from("rrhh_faenas").insert({ nombre: "Gerencia" });
check("Trabajador no agrega faenas", !!v.error, v.error?.message);
v = await A.from("rrhh_faenas").insert({ nombre: "Operaciones" }).select("id").single();
const faenaId = v.data?.id;
check("Administrador agrega una faena", !v.error && !!faenaId, v.error?.message);
v = await A.from("rrhh_cargos").delete().eq("id", cargoId).select();
check("Un cargo no se borra (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = (await T.from("rrhh_cargos").select("nombre")).data;
check("El catálogo de cargos se lee con sesión", v?.length === 5 && v.some((c) => c.nombre === "Supervisor de encarpe"), v); // 4 sembrados + 1

console.log("\n— personal.rut (módulo 11, legible solo con rrhh_ruts()) —");
// RUT inventados con dígito verificador válido.
v = await C.from("personal").update({ rut: "111111111" }).eq("id", P.S1.id).select("id");
check("Adm. contrato registra el RUT de S1", !v.error && v.data.length === 1, v.error?.message ?? v.data);
v = await A.from("personal").update({ rut: "123456789" }).eq("id", P.S2.id).select("id");
check("Un RUT con dígito verificador malo se rechaza (check)", !!v.error, v.error?.message);
must(await srv.from("personal").update({ rut: "222222222" }).eq("id", P.S2.id), "rut S2");
must(await srv.from("personal").update({ rut: "123456785" }).eq("id", P.T.id), "rut T");
v = await A.from("personal").update({ rut: "111111111" }).eq("id", P.S3.id);
check("Un RUT repetido se rechaza", !!v.error, v.error?.message);
v = await A.from("personal").select("rut").eq("id", P.S1.id);
check("Ni el administrador lee rut con un select directo", !!v.error, v.error?.message ?? v.data);
v = await S1.from("personal").select("*").eq("id", P.S2.id);
check("S1 no lee el RUT de S2 con select(*) (aunque ve su fila)", !!v.error, v.error?.message ?? v.data);
const ruts = async (c) => ((await c.rpc("rrhh_ruts")).data ?? []).map((r) => nombre(r.personal_id)).sort();
v = await ruts(S1);
check("rrhh_ruts(): S1 solo el suyo", JSON.stringify(v) === '["S1"]', v);
v = await ruts(T);
check("rrhh_ruts(): trabajador solo el suyo", JSON.stringify(v) === '["T"]', v);
v = await ruts(C);
check("rrhh_ruts(): adm. contrato todos", JSON.stringify(v) === '["S1","S2","T"]', v);
v = await anon.rpc("rrhh_ruts");
check("rrhh_ruts(): anónimo rechazado", !!v.error || v.data.length === 0, v.error?.message ?? v.data);

const ficha = (personal_id) => ({
  personal_id,
  cargo_id: cargoId,
  faena_id: faenaId,
  fecha_ingreso: "2019-03-15",
  tipo_contrato: "indefinido",
  afp: "modelo",
  sistema_salud: "fonasa",
});

console.log("\n— rrhh_fichas —");
v = await C.from("rrhh_fichas").insert(ficha(P.S1.id)).select("cargo_id").single();
check("Adm. contrato crea una ficha con RETURNING", !v.error && v.data?.cargo_id === cargoId, v.error?.message ?? v.data);
v = await A.from("rrhh_fichas").insert(ficha(P.S2.id)).select("cargo_id").single();
check("Administrador crea una ficha", !v.error, v.error?.message);
v = await A.from("rrhh_fichas").insert(ficha(P.T.id)).select("cargo_id").single();
check("Administrador crea la ficha del trabajador", !v.error, v.error?.message);
v = await A.from("rrhh_fichas").insert({ ...ficha(P.S3.id), cargo_id: null });
check("Una ficha sin cargo se rechaza", !!v.error, v.error?.message);
v = await A.from("rrhh_fichas").insert({ ...ficha(P.S3.id), tipo_contrato: "plazo_fijo" });
check("Plazo fijo sin fecha de término se rechaza (check)", !!v.error, v.error?.message);
v = await A.from("rrhh_fichas").insert({ ...ficha(P.S3.id), sistema_salud: "isapre" });
check("Isapre sin plan se rechaza (check)", !!v.error, v.error?.message);
v = (await S1.from("rrhh_fichas").select("personal_id")).data;
check("S1 solo ve su propia ficha", JSON.stringify(v?.map((f) => nombre(f.personal_id))) === '["S1"]', v);
v = (await S3.from("rrhh_fichas").select("personal_id")).data;
check("S3 (sin ficha) no ve ninguna", v?.length === 0, v?.length);
v = await S1.from("rrhh_fichas").update({ cargas_familiares: 9 }).eq("personal_id", P.S1.id).select();
check("S1 no puede editar su propia ficha (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_fichas").insert(ficha(P.S3.id));
check("Supervisor no puede crear fichas", !!v.error, v.error?.message);
v = await A.from("rrhh_fichas").delete().eq("personal_id", P.S2.id).select();
check("Nadie borra una ficha (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);

console.log("\n— desvinculación: fecha_desvinculacion manda, activo se deriva —");
v = await C.from("rrhh_fichas")
  .update({ fecha_desvinculacion: "2026-10-01", motivo_desvinculacion: "Prueba" })
  .eq("personal_id", P.S2.id)
  .select("fecha_desvinculacion");
check("Desvincular escribiendo solo la ficha se rechaza (activo quedaría en true)", !!v.error, v.error?.message ?? v.data);
v = await C.rpc("rrhh_desvincular", { p_personal_id: P.S2.id, p_fecha: "2026-10-01", p_motivo: "Prueba" });
check("Adm. contrato desvincula con la acción única", !v.error, v.error?.message);
v = (await srv.from("rrhh_fichas").select("fecha_desvinculacion").eq("personal_id", P.S2.id).single()).data;
const activoS2 = (await srv.from("personal").select("activo").eq("id", P.S2.id).single()).data;
check("Quedaron las dos: fecha en la ficha y acceso cortado", v?.fecha_desvinculacion === "2026-10-01" && activoS2?.activo === false, [v, activoS2]);
v = await A.from("personal").update({ activo: true }).eq("id", P.S2.id).select("id");
check("Reactivar el acceso de un desvinculado se rechaza", !!v.error, v.error?.message ?? v.data);
v = await C.rpc("rrhh_desvincular", { p_personal_id: P.S3.id, p_fecha: "2026-10-01", p_motivo: "Prueba" });
check("Desvincular a alguien sin contrato falla con mensaje", !!v.error && /contrato/.test(v.error.message), v.error?.message);
v = await S1.rpc("rrhh_desvincular", { p_personal_id: P.T.id, p_fecha: "2026-10-01", p_motivo: "Prueba" });
check("Supervisor no puede desvincular", !!v.error, v.error?.message);
v = await A.rpc("rrhh_reincorporar", { p_personal_id: P.S2.id });
const s2 = (await srv.from("personal").select("activo").eq("id", P.S2.id).single()).data;
check("Reincorporar devuelve las dos", !v.error && s2?.activo === true, v.error?.message ?? s2);
v = await C.rpc("rrhh_desvincular", { p_personal_id: P.S2.id, p_fecha: "2026-10-01", p_motivo: "Prueba" });
check("S2 queda desvinculado para el resto de la prueba", !v.error, v.error?.message);
v = await A.from("personal").update({ activo: false }).eq("id", P.S3.id).select("id");
check("Suspender el acceso sin desvincular sí se puede", !v.error && v.data.length === 1, v.error?.message ?? v.data);
must(await srv.from("personal").update({ activo: true }).eq("id", P.S3.id), "reactivar S3");

console.log("\n— rrhh_jornadas / rrhh_jornada_trabajador —");
const dias = [1, 2, 3, 4, 5].map((dia) => ({ dia, entrada: "08:00", salida: "17:00", colacion_minutos: 60 }));
v = await C.from("rrhh_jornadas").insert({ nombre: "Turno A", dias }).select("id").single();
check("Adm. contrato crea una jornada con RETURNING", !v.error && !!v.data?.id, v.error?.message);
const jornadaA = v.data?.id;
v = await A.from("rrhh_jornadas").insert({ nombre: "Turno B", dias }).select("id").single();
const jornadaB = v.data?.id;
v = await A.from("rrhh_jornadas").update({ dias: [{ dia: 1, entrada: "09:00", salida: "18:00", colacion_minutos: 0 }] }).eq("id", jornadaA).select();
check("El horario de una jornada no se puede cambiar (trigger)", !!v.error && /no se puede modificar/.test(v.error.message), v.error?.message ?? v.data);
v = await A.from("rrhh_jornadas").update({ activo: false }).eq("id", jornadaB).select("activo");
check("Sí se puede desactivar", !v.error && v.data?.[0]?.activo === false, v.error?.message ?? v.data);
v = await C.from("rrhh_jornada_trabajador").insert({ personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-01-01" }).select("id");
check("Adm. contrato asigna jornada con RETURNING", !v.error && v.data.length === 1, v.error?.message);
v = await S1.from("rrhh_jornada_trabajador").insert({ personal_id: P.S1.id, jornada_id: jornadaB, vigente_desde: "2026-02-01" });
check("Supervisor no se asigna jornada", !!v.error, v.error?.message);
v = (await S1.from("rrhh_jornadas").select("nombre")).data;
check("S1 ve solo la jornada que tiene asignada", JSON.stringify(v?.map((j) => j.nombre)) === '["Turno A"]', v);
v = (await S3.from("rrhh_jornadas").select("nombre")).data;
check("S3 no ve jornadas", v?.length === 0, v);
v = (await S1.from("rrhh_jornada_trabajador").select("id, jornada:rrhh_jornadas(nombre)")).data;
check("S1 lee su asignación con el nombre de la jornada", v?.length === 1 && v[0].jornada?.nombre === "Turno A", v);

console.log("\n— turnos rotativos: rangos sin solape, corrección y anulación con rastro —");
const [asigS1] = (await A.from("rrhh_jornada_trabajador").select("id").eq("personal_id", P.S1.id)).data ?? [];
v = await C.from("rrhh_jornada_trabajador").insert({ personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-01", vigente_hasta: "2026-03-07" });
check("Solape con una asignación sin término: la base lo rechaza", v.error?.code === "23P01", v.error?.message ?? "insertó");
v = await A.from("rrhh_jornada_trabajador").update({ vigente_hasta: "2026-02-28" }).eq("id", asigS1?.id).select("id");
check("Corregir sin motivo se rechaza", !!v.error && /motivo/.test(v.error.message), v.error?.message ?? v.data);
v = await A.from("rrhh_jornada_trabajador").update({ jornada_id: jornadaB, motivo_cambio: "x" }).eq("id", asigS1?.id).select("id");
check("Cambiar la jornada de una asignación se rechaza (se anula y se asigna otra)", !!v.error && /Solo se puede corregir el rango/.test(v.error.message), v.error?.message ?? v.data);
v = await A.from("rrhh_jornada_trabajador").update({ personal_id: P.S2.id, motivo_cambio: "x" }).eq("id", asigS1?.id).select("id");
check("Cambiar la persona de una asignación se rechaza", !!v.error, v.error?.message ?? v.data);
v = await A.from("rrhh_jornada_trabajador").update({ vigente_hasta: "2025-12-31", motivo_cambio: "x" }).eq("id", asigS1?.id).select("id");
check("Un rango con término antes del inicio se rechaza", !!v.error, v.error?.message ?? v.data);
v = await A.from("rrhh_jornada_trabajador").update({ vigente_hasta: "2026-02-28", motivo_cambio: " Pasa a turnos rotativos " }).eq("id", asigS1?.id).select("vigente_hasta, updated_by, motivo_cambio");
check("Administrador corrige el rango con motivo", !v.error && v.data?.[0]?.vigente_hasta === "2026-02-28" && v.data[0].updated_by === P.A.id && v.data[0].motivo_cambio === "Pasa a turnos rotativos", v.error?.message ?? v.data);
v = await C.from("rrhh_jornada_trabajador").insert([
  { personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-01", vigente_hasta: "2026-03-07" },
  { personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-08", vigente_hasta: "2026-03-14" },
]).select("id, vigente_desde");
check("Rangos contiguos (07 y 08) sí se aceptan", !v.error && v.data?.length === 2, v.error?.message);
const asigSemana2 = v.data?.find((a) => a.vigente_desde === "2026-03-08")?.id;
v = await C.from("rrhh_jornada_trabajador").insert({ personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-07", vigente_hasta: "2026-03-08" });
check("Un rango que pisa un solo día de otro se rechaza", v.error?.code === "23P01", v.error?.message ?? "insertó");
v = await C.from("rrhh_jornada_trabajador").insert([
  { personal_id: P.S2.id, jornada_id: jornadaA, vigente_desde: "2026-03-01", vigente_hasta: "2026-03-31" },
  { personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-10", vigente_hasta: "2026-03-12" },
]);
check("Lote con un solape: falla completo", v.error?.code === "23P01", v.error?.message ?? "insertó");
v = (await A.from("rrhh_jornada_trabajador").select("id").eq("personal_id", P.S2.id)).data;
check("…y no dejó asignada a la otra persona del lote (todo o nada)", v?.length === 0, v);
v = await C.from("rrhh_jornada_trabajador").update({ anulada_en: new Date().toISOString(), anulada_por: P.A.id, motivo_cambio: "Se cargó a la persona equivocada" }).eq("id", asigSemana2).select("anulada_en, anulada_por");
check("Adm. contrato anula (el autor lo fija la base, no el cliente)", !v.error && !!v.data?.[0]?.anulada_en && v.data[0].anulada_por === P.C.id, v.error?.message ?? v.data);
v = (await A.from("rrhh_jornada_trabajador").select("id").eq("personal_id", P.S1.id).eq("vigente_desde", "2026-03-01").single()).data;
const asigSemana1 = v?.id;
v = await srv.from("rrhh_jornada_trabajador").update({ anulada_en: new Date().toISOString(), motivo_cambio: "Desde un script" }).eq("id", asigSemana1).select("id");
check(
  "Anular sin fila en personal (service role): mensaje en español, no el check",
  !!v.error && /no tiene ficha de personal asociada/.test(v.error.message) && !/anulacion_completa/.test(v.error.message),
  v.error?.message ?? v.data,
);
v = (await A.from("rrhh_jornada_trabajador").select("anulada_en").eq("id", asigSemana1).single()).data;
check("…y la asignación sigue vigente", v?.anulada_en === null, v);
// Una sesión autenticada cuyo auth.uid() no tiene fila en personal (por
// ejemplo, una cuenta sin ficha). La RLS se salta a propósito con el rol
// dueño de la tabla para llegar al trigger; lo que se prueba es su mensaje.
const sinFicha = execSync(`docker exec -i supabase_db_cordilleraMyP psql -U postgres -qtA`, {
  encoding: "utf8",
  input: `
begin;
create temp table _r (t text) on commit drop;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000999","role":"authenticated"}', true);
do $$ begin
  update public.rrhh_jornada_trabajador set anulada_en = now(), motivo_cambio = 'x' where id = '${asigSemana1}';
  insert into _r values ('ANULÓ');
exception when others then insert into _r values (sqlerrm);
end $$;
select t from _r;
rollback;
`,
});
check(
  "Anular desde una cuenta sin fila en personal: mismo mensaje",
  /no tiene ficha de personal asociada/.test(sinFicha) && !/anulacion_completa/.test(sinFicha),
  sinFicha.trim(),
);
v = await C.from("rrhh_jornada_trabajador").insert({ personal_id: P.S1.id, jornada_id: jornadaA, vigente_desde: "2026-03-10", vigente_hasta: "2026-03-12" }).select("id");
check("Una anulada ya no bloquea su rango", !v.error && v.data?.length === 1, v.error?.message);
v = await A.from("rrhh_jornada_trabajador").update({ anulada_en: null, anulada_por: null, motivo_cambio: "revivir" }).eq("id", asigSemana2).select("id");
check("Una anulada no se puede revivir ni modificar", !!v.error && /anulada/.test(v.error.message), v.error?.message ?? v.data);
v = await A.from("rrhh_jornada_trabajador").delete().eq("personal_id", P.S1.id).select();
check("Nadie borra asignaciones (ni admin): 0 filas", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await S1.from("rrhh_jornada_trabajador").update({ vigente_hasta: "2030-01-01", motivo_cambio: "x" }).eq("personal_id", P.S1.id).select();
check("Supervisor no corrige sus propias asignaciones (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await T.from("rrhh_jornada_trabajador").update({ vigente_hasta: "2030-01-01", motivo_cambio: "x" }).gte("vigente_desde", "2000-01-01").select();
check("Trabajador no corrige asignaciones (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = (await A.from("rrhh_jornada_trabajador_cambios").select("accion, hecho_por, motivo").eq("asignacion_id", asigS1?.id).order("hecho_en")).data;
check(
  "Rastro de la corrección: alta + corregida, con autor y motivo",
  JSON.stringify(v?.map((c) => c.accion)) === JSON.stringify(["asignada", "corregida"]) && v[1].hecho_por === P.A.id && v[1].motivo === "Pasa a turnos rotativos",
  v,
);
v = (await A.from("rrhh_jornada_trabajador_cambios").select("accion, hecho_por").eq("asignacion_id", asigSemana2)).data;
check("Rastro de la anulación con su autor", v?.some((c) => c.accion === "anulada" && c.hecho_por === P.C.id), v);
v = await A.from("rrhh_jornada_trabajador_cambios").insert({ asignacion_id: asigS1?.id, personal_id: P.S1.id, accion: "asignada", jornada_id: jornadaA, vigente_desde: "2020-01-01" });
check("Nadie escribe el rastro a mano (ni admin)", !!v.error, v.error?.message);
v = await A.from("rrhh_jornada_trabajador_cambios").delete().eq("personal_id", P.S1.id).select();
check("Nadie borra el rastro (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = (await S1.from("rrhh_jornada_trabajador_cambios").select("personal_id")).data;
check("S1 lee solo el rastro propio", v?.length > 0 && v.every((c) => c.personal_id === P.S1.id), v);
v = (await S3.from("rrhh_jornada_trabajador_cambios").select("id")).data;
check("S3 no lee el rastro de otros", v?.length === 0, v);

console.log("\n— contacto de emergencia (dato de un tercero) —");
v = await A.from("personal").update({ contacto_emergencia_nombre: "María Prueba", contacto_emergencia_telefono: "56987654321", contacto_emergencia_relacion: "madre" }).eq("id", P.T.id).select("id");
check("Administrador registra el contacto de T", !v.error && v.data.length === 1, v.error?.message);
v = await C.from("personal").update({ contacto_emergencia_nombre: "Pedro Prueba", contacto_emergencia_telefono: "56911112222" }).eq("id", P.S1.id).select("id");
check("Adm. contrato registra el contacto de S1", !v.error && v.data.length === 1, v.error?.message);
v = await C.from("personal").update({ contacto_emergencia_nombre: "X", contacto_emergencia_telefono: "56911113333" }).eq("id", P.A.id).select("id");
check("Adm. contrato no toca la fila de un administrador (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data);
v = await A.from("personal").update({ contacto_emergencia_nombre: null }).eq("id", P.T.id);
check("Un teléfono sin nombre se rechaza (check)", !!v.error, v.error?.message);
v = await A.from("personal").update({ contacto_emergencia_nombre: "  " }).eq("id", P.T.id);
check("…ni con un nombre en blanco", !!v.error, v.error?.message);
v = await T.from("personal").update({ contacto_emergencia_telefono: "56900000000" }).eq("id", P.T.id).select("id");
check("T no edita su propio contacto (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data);
for (const [k, cli] of [["A", A], ["C", C], ["S1", S1], ["T", T]]) {
  v = await cli.from("personal").select("contacto_emergencia_telefono").eq("id", P.T.id);
  check(`${k} NO lee el contacto con un select directo`, !!v.error, v.error?.message ?? v.data);
}
v = await A.from("personal").select("*").limit(1);
check("select * de personal falla (hay columnas no legibles)", !!v.error, v.error?.message ?? "leyó");
const contactos = async (cli) => ((await cli.rpc("rrhh_contactos_emergencia")).data ?? []).map((c) => c.personal_id).sort();
check("Admin ve todos los contactos", JSON.stringify(await contactos(A)) === JSON.stringify([P.S1.id, P.T.id].sort()), await contactos(A));
check("Adm. contrato ve todos los contactos", JSON.stringify(await contactos(C)) === JSON.stringify([P.S1.id, P.T.id].sort()), await contactos(C));
check("T ve solo el suyo", JSON.stringify(await contactos(T)) === JSON.stringify([P.T.id]), await contactos(T));
check("S1 ve solo el suyo (no el de T)", JSON.stringify(await contactos(S1)) === JSON.stringify([P.S1.id]), await contactos(S1));
check("S3 no ve ninguno", (await contactos(S3)).length === 0, await contactos(S3));
v = await createClient(URL, env.ANON_KEY, opts).rpc("rrhh_contactos_emergencia");
check("Sin sesión no se puede llamar", !!v.error, v.error?.message ?? v.data);

console.log("\n— correo único, cargos sembrados, faenas —");
v = await srv.from("personal").insert({ nombre: "Dup", rol: "trabajador", email: P.T.email.toUpperCase() });
check("Un correo repetido (con otras mayúsculas) se rechaza", v.error?.code === "23505" && /personal_email_unico/.test(v.error.message), v.error?.message ?? "insertó");
v = (await A.from("rrhh_cargos").select("nombre")).data?.map((c) => c.nombre) ?? [];
check("Cargos sembrados", ["Administrador", "Administrador de contrato", "Supervisor", "Encarpador"].every((n) => v.includes(n)), v);
v = await A.from("rrhh_areas").select("id");
check("La tabla rrhh_areas ya no existe (ahora rrhh_faenas)", !!v.error, v.error?.message ?? v.data);

console.log("\n— rrhh_tipos_documento / rrhh_documentos / bucket documentos-rrhh —");
v = (await S3.from("rrhh_tipos_documento").select("nombre")).data;
check("El catálogo de tipos se lee con sesión (8 tipos, sin antecedentes)", v?.length === 8 && !v.some((t) => /antecedentes/i.test(t.nombre)), v?.map((t) => t.nombre));
v = await S1.from("rrhh_tipos_documento").insert({ nombre: "Pirata" });
check("Supervisor no agrega tipos", !!v.error, v.error?.message);
v = await C.from("rrhh_tipos_documento").insert({ nombre: "Licencia de conducir", orden: 9 }).select("id").single();
check("Adm. contrato agrega un tipo", !v.error, v.error?.message);
v = await A.from("rrhh_tipos_documento").delete().eq("nombre", "Licencia de conducir").select();
check("Un tipo no se borra (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
const tipoContrato = (await A.from("rrhh_tipos_documento").select("id").eq("nombre", "Contrato de trabajo").single()).data.id;

const pdf = new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" });
const rutaS1 = `${P.S1.id}/prueba-contrato.pdf`;
const rutaS2 = `${P.S2.id}/prueba-cedula.pdf`;
v = await C.storage.from("documentos-rrhh").upload(rutaS1, pdf, { contentType: "application/pdf" });
check("Adm. contrato sube un documento al bucket", !v.error, v.error?.message);
v = await A.storage.from("documentos-rrhh").upload(rutaS2, pdf, { contentType: "application/pdf" });
check("Administrador sube un documento al bucket", !v.error, v.error?.message);
v = await S1.storage.from("documentos-rrhh").upload(`${P.S1.id}/pirata.pdf`, pdf, { contentType: "application/pdf" });
check("Supervisor no sube ni a su propia carpeta", !!v.error, v.error?.message);
v = await A.storage.from("documentos-rrhh").upload(`${P.S1.id}/virus.exe`, new Blob(["MZ"]), { contentType: "application/x-msdownload" });
check("El bucket rechaza un tipo no permitido", !!v.error, v.error?.message);
v = await C.from("rrhh_documentos")
  .insert({ personal_id: P.S1.id, tipo_id: tipoContrato, nombre_archivo: "contrato.pdf", ruta: rutaS1, tamano_bytes: 15, mime: "application/pdf" })
  .select("id");
check("Adm. contrato registra el documento con RETURNING", !v.error && v.data.length === 1, v.error?.message);
v = await A.from("rrhh_documentos").insert({ personal_id: P.S2.id, tipo_id: tipoContrato, nombre_archivo: "cedula.pdf", ruta: rutaS2, tamano_bytes: 15, mime: "application/pdf" });
check("Administrador registra otro", !v.error, v.error?.message);
v = await A.from("rrhh_documentos").insert({ personal_id: P.S1.id, tipo_id: tipoContrato, nombre_archivo: "x.pdf", ruta: `${P.S2.id}/x.pdf`, tamano_bytes: 15, mime: "application/pdf" });
check("Un documento con ruta de otro trabajador se rechaza (check)", !!v.error, v.error?.message);
v = (await S1.from("rrhh_documentos").select("nombre_archivo")).data;
check("S1 solo ve sus documentos", JSON.stringify(v?.map((d) => d.nombre_archivo)) === '["contrato.pdf"]', v);
v = await S1.storage.from("documentos-rrhh").download(rutaS1);
check("S1 descarga su propio documento", !v.error && !!v.data, v.error?.message);
v = await S1.storage.from("documentos-rrhh").download(rutaS2);
check("S1 NO descarga el documento de S2", !!v.error, v.error?.message ?? "lo descargó");
v = await S1.storage.from("documentos-rrhh").createSignedUrl(rutaS2, 60);
check("S1 NO puede firmar una URL del documento de S2", !!v.error, v.error?.message ?? "la firmó");
v = await S3.storage.from("documentos-rrhh").list(P.S1.id);
check("S3 no lista la carpeta de S1", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await C.storage.from("documentos-rrhh").download(rutaS2);
check("Adm. contrato descarga cualquier documento", !v.error && !!v.data, v.error?.message);
v = await A.storage.from("documentos-rrhh").remove([rutaS1]);
check("Nadie borra un documento del bucket (ni admin)", !v.error && v.data.length === 0, v.error?.message ?? v.data);
v = await anon.storage.from("documentos-rrhh").download(rutaS1);
check("Anónimo no descarga", !!v.error, v.error?.message ?? "lo descargó");

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
check("Adm. contrato ve todo personal", v.length === 6, v);
v = await pers(A);
check("Administrador ve todo personal", v.length === 6, v);
v = await pers(T);
check("Trabajador solo ve su propia fila", JSON.stringify(v) === '["T"]', v);
v = await anon.from("personal").select("id");
check("Anónimo no lee personal", !!v.error || v.data.length === 0, v.error?.message ?? v.data.length);

console.log("\n— personal: lo que la app necesita sigue funcionando —");
v = await S1.from("tickets").select("numero_inspeccion, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido)");
check("S1 ve el nombre del supervisor en el ticket ajeno", v.data?.[0]?.supervisor?.nombre === "S2", v.error?.message ?? v.data);
v = await S1.from("personal")
  .select("id, nombre, apellido, rol, telefono, email, activo, created_at, user_id, fecha_nacimiento")
  .eq("user_id", (await S1.auth.getUser()).data.user.id)
  .single();
check("S1 lee su propia fila (columnas de auth.ts)", !v.error && v.data?.nombre === "S1", v.error?.message);
v = await A.from("personal")
  .insert({ nombre: "Nuevo", apellido: "Prueba", rol: "supervisor", email: "rls.nuevo@test.cordilleramyp.local", telefono: "56944444444" })
  .select("id, nombre")
  .single();
check("Administrador crea personal con RETURNING", !v.error && v.data?.nombre === "Nuevo", v.error?.message);
v = await A.from("personal").update({ telefono: "56900000001" }).eq("id", P.S3.id).select("telefono");
check("Administrador edita personal", !v.error && v.data.length === 1, v.error?.message ?? v.data);

console.log("\n— rol y tipos de inspección: solo administrador —");
const nueva = (n, rol) => ({ nombre: n, apellido: "Prueba", rol, email: `rls.${n.toLowerCase()}@test.cordilleramyp.local` });
v = await C.from("personal").insert(nueva("Nuevo2", "trabajador")).select("id").single();
check("Adm. contrato crea un trabajador con RETURNING", !v.error && !!v.data?.id, v.error?.message);
v = await C.from("personal").insert(nueva("Nuevo3", "administrador"));
check("Adm. contrato NO crea un administrador", !!v.error, v.error?.message);
v = await C.from("personal").insert(nueva("Nuevo4", "supervisor"));
check("Adm. contrato NO crea un supervisor (sería asignar un rol)", !!v.error, v.error?.message);
v = await C.from("personal").insert(nueva("Nuevo5", "administrador_contrato"));
check("Adm. contrato NO crea otro adm. de contrato", !!v.error, v.error?.message);
v = await C.from("personal").update({ rol: "administrador" }).eq("id", P.S3.id).select("id");
check("Adm. contrato NO asciende a administrador", !!v.error || v.data.length === 0, v.error?.message ?? v.data);
v = await C.from("personal").update({ rol: "administrador_contrato" }).eq("id", P.S3.id).select("id");
check("Adm. contrato NO cambia un rol (supervisor → adm. contrato)", !!v.error, v.error?.message ?? v.data);
v = await C.from("personal").update({ rol: "trabajador" }).eq("id", P.S3.id).select("id");
check("Adm. contrato NO cambia un rol (supervisor → trabajador)", !!v.error, v.error?.message ?? v.data);
v = await C.from("personal").update({ telefono: "56900000002", rol: "supervisor" }).eq("id", P.S3.id).select("telefono");
check("Adm. contrato SÍ edita los datos personales (rol sin cambio)", !v.error && v.data.length === 1, v.error?.message ?? v.data);
v = await C.from("personal").update({ telefono: "56900000003" }).eq("id", P.A.id).select("id");
check("Adm. contrato NO toca la fila de un administrador (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data);
v = await T.from("personal").update({ telefono: "56900000004" }).eq("id", P.T.id).select("id");
check("Trabajador NO edita su propia fila (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data);
v = await A.from("personal").update({ rol: "administrador_contrato" }).eq("id", P.S3.id).select("rol");
check("Administrador SÍ cambia un rol", !v.error && v.data?.[0]?.rol === "administrador_contrato", v.error?.message ?? v.data);
must(await A.from("personal").update({ rol: "supervisor" }).eq("id", P.S3.id), "rol S3 de vuelta");
v = await C.from("personal_tipos_inspeccion").insert({ personal_id: P.S3.id, tipo_inspeccion: "encarpe" });
check("Adm. contrato NO asigna tipos de inspección", !!v.error, v.error?.message);
v = await C.from("personal_tipos_inspeccion").delete().eq("personal_id", P.S1.id).select();
check("Adm. contrato NO quita tipos de inspección (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await A.from("personal_tipos_inspeccion").insert({ personal_id: P.S3.id, tipo_inspeccion: "encarpe" }).select("personal_id");
check("Administrador SÍ asigna tipos", !v.error && v.data.length === 1, v.error?.message);
must(await A.from("personal_tipos_inspeccion").delete().eq("personal_id", P.S3.id), "tipos S3 de vuelta");

console.log("\n— trabajador: solo lectura de lo suyo —");
const docT = `${P.T.id}/contrato-t.pdf`;
must(await A.storage.from("documentos-rrhh").upload(docT, pdf, { contentType: "application/pdf" }), "subir doc T");
must(
  await A.from("rrhh_documentos").insert({ personal_id: P.T.id, tipo_id: tipoContrato, nombre_archivo: "contrato-t.pdf", ruta: docT, tamano_bytes: 15, mime: "application/pdf" }),
  "registrar doc T",
);
v = (await T.from("rrhh_fichas").select("personal_id")).data;
check("Trabajador ve su ficha", JSON.stringify(v?.map((f) => nombre(f.personal_id))) === '["T"]', v);
v = (await T.from("rrhh_documentos").select("nombre_archivo")).data;
check("Trabajador ve solo sus documentos", JSON.stringify(v?.map((d) => d.nombre_archivo)) === '["contrato-t.pdf"]', v);
v = await T.storage.from("documentos-rrhh").createSignedUrl(docT, 60);
check("Trabajador firma la URL de su propio documento", !v.error && !!v.data?.signedUrl, v.error?.message);
v = await T.storage.from("documentos-rrhh").createSignedUrl(rutaS2, 60);
check("Trabajador NO firma la URL de un documento ajeno", !!v.error, v.error?.message ?? "la firmó");
v = await T.storage.from("documentos-rrhh").upload(`${P.T.id}/mio.pdf`, pdf, { contentType: "application/pdf" });
check("Trabajador NO sube documentos (ni a su carpeta)", !!v.error, v.error?.message);
v = await T.from("rrhh_documentos").insert({ personal_id: P.T.id, tipo_id: tipoContrato, nombre_archivo: "x.pdf", ruta: `${P.T.id}/x.pdf`, tamano_bytes: 15, mime: "application/pdf" });
check("Trabajador NO registra documentos", !!v.error, v.error?.message);
v = await T.from("rrhh_fichas").update({ cargas_familiares: 9 }).eq("personal_id", P.T.id).select();
check("Trabajador NO edita su ficha (0 filas)", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await T.rpc("rrhh_reincorporar", { p_personal_id: P.T.id });
check("Trabajador NO usa la acción de reincorporar sobre sí mismo", !!v.error, v.error?.message);
v = await T.from("tickets").select("id");
check("Trabajador no ve ningún ticket", !v.error && v.data.length === 0, v.error?.message ?? v.data.length);
v = await T.from("tickets").insert({ ...ticket, fecha: new Date().toISOString(), patente_camion: "TT11", supervisor_id: P.T.id });
check("Trabajador no crea tickets", !!v.error, v.error?.message);
v = await T.from("destinatarios_correo").select("email");
check("Trabajador NO lee los correos de los destinatarios", !v.error && v.data.length === 0, v.error?.message ?? v.data);
v = await S1.from("destinatarios_correo").select("email");
check("Supervisor SÍ los lee (enviar el informe)", !v.error && v.data.length === 1, v.error?.message ?? v.data);

// Barrido de TODAS las tablas de public como trabajador, en la base misma:
// un rol nuevo hereda lo que las políticas no previeron. Cuenta qué ve, y
// cuántas filas lograría actualizar, borrar o insertar (todo en una
// transacción que se deshace).
console.log("\n— trabajador: barrido de todas las tablas —");
const uidT = (await T.auth.getUser()).data.user.id;
const barrido = execSync(
  `docker exec -i supabase_db_cordilleraMyP psql -U postgres -v ON_ERROR_STOP=1 -qtA`,
  {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    input: `
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${uidT}","role":"authenticated"}', true);
create temp table _r (tabla text, ve int, actualiza int, borra int, inserta text) on commit drop;
do $$
declare t record; col text; n int; v int; u int; b int; i text;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' order by 1 loop
    select a.attname into col from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relname = t.relname and a.attnum > 0 and not a.attisdropped
        and a.attidentity = '' and a.attgenerated = '' and a.attname <> 'rut' order by a.attnum limit 1;
    begin execute format('select count(*) from public.%I', t.relname) into v; exception when others then v := -1; end;
    begin execute format('with x as (update public.%I set %I = %I returning 1) select count(*) from x', t.relname, col, col) into u;
      exception when others then u := 0; end;
    begin execute format('with x as (delete from public.%I returning 1) select count(*) from x', t.relname) into b;
      exception when others then b := 0; end;
    begin execute format('insert into public.%I default values', t.relname); i := 'SÍ';
      exception when others then i := 'no'; end;
    insert into _r values (t.relname, v, u, b, i);
  end loop;
end $$;
select tabla || '|' || ve || '|' || actualiza || '|' || borra || '|' || inserta from _r order by 1;
rollback;
`,
  },
);
// Tablas que el trabajador PUEDE leer con filas: las suyas y catálogos sin
// datos de nadie. Cualquier otra con filas visibles es una fuga.
const LEE_PERMITIDO = new Set([
  "personal", // solo su fila (comprobado arriba)
  "rrhh_fichas",
  "rrhh_documentos",
  "rrhh_tipos_documento",
  "rrhh_cargos",
  "rrhh_faenas",
  "rrhh_remuneracion_base",
  "rrhh_jornadas",
  "rrhh_jornada_trabajador",
  "rrhh_jornada_trabajador_cambios",
  "checklist_items",
  "tipos_inspeccion",
  "transportes",
]);
const filasBarrido = barrido.trim().split(/\r?\n/).filter((l) => l.includes("|")).map((l) => l.split("|"));
check("El barrido recorrió las tablas de public", filasBarrido.length > 20, filasBarrido.length);
for (const [tabla, ve, actualiza, borra, inserta] of filasBarrido) {
  if (Number(ve) > 0 && !LEE_PERMITIDO.has(tabla)) check(`Trabajador NO lee ${tabla}`, false, `${ve} filas`);
  if (Number(actualiza) > 0) check(`Trabajador NO actualiza ${tabla}`, false, `${actualiza} filas`);
  if (Number(borra) > 0) check(`Trabajador NO borra en ${tabla}`, false, `${borra} filas`);
  if (inserta === "SÍ") check(`Trabajador NO inserta en ${tabla}`, false, "insertó una fila");
}
check(
  "Barrido: ninguna escritura posible y solo lecturas permitidas",
  filasBarrido.every(([t, ve, a, b, i]) => (Number(ve) <= 0 || LEE_PERMITIDO.has(t)) && Number(a) === 0 && Number(b) === 0 && i === "no"),
  filasBarrido.filter(([t, ve, a, b, i]) => (Number(ve) > 0 && !LEE_PERMITIDO.has(t)) || Number(a) > 0 || Number(b) > 0 || i === "SÍ").map((f) => f.join("|")),
);
v = await S1.from("tickets")
  .insert({ ...ticket, fecha: new Date().toISOString(), patente_camion: "CC33", supervisor_id: P.S1.id })
  .select("numero_inspeccion")
  .single();
check("S1 crea su ticket con RETURNING (sin cambios)", !v.error && v.data?.numero_inspeccion > 0, v.error?.message);

console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas ? 1 : 0);
