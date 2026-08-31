/**
 * ⚠️  SOLO PARA LA BASE DE DATOS DE DESARROLLO / PRUEBAS  ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 * §11.1 — Crea 3 cuentas de SUPERVISOR con login real y clave fija, para poder
 * iniciar sesión como distintos supervisores durante testing manual (p. ej. los
 * escenarios de re-inspección entre supervisores distintos de §2.6 / §2.14).
 *
 * Distinto del seed masivo (`seed-demo-data.ts`): aquellas 10 "Supervisor N" se
 * crean SIN login (user_id null) solo para llenar gráficos; estas 3 SÍ pueden
 * loguearse.
 *
 *   | Nombre     | Apellido  | Correo                                          | Clave        |
 *   |------------|-----------|------------------------------------------------|--------------|
 *   | Supervisor | Prueba 1  | supervisor.prueba1@test.cordilleramyp.local     | Prueba#2026  |
 *   | Supervisor | Prueba 2  | supervisor.prueba2@test.cordilleramyp.local     | Prueba#2026  |
 *   | Supervisor | Prueba 3  | supervisor.prueba3@test.cordilleramyp.local     | Prueba#2026  |
 *
 * NUNCA correr esto contra la base de datos de producción con datos reales de
 * la empresa. No forma parte del build ni del deploy — es una herramienta de
 * una sola corrida. Es idempotente: si una cuenta ya existe, la saltea.
 *
 * Uso:   npx tsx scripts/seed-test-accounts.ts
 * Requiere en .env.local:  NEXT_PUBLIC_SUPABASE_URL  y  SUPABASE_SERVICE_ROLE_KEY
 *
 * Limpieza:
 *   delete from auth.users  where email like '%@test.cordilleramyp.local';
 *   delete from personal    where email like '%@test.cordilleramyp.local';
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

// --- env desde .env.local ---
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(
    "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const admin = createClient<Database>(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLAVE = "Prueba#2026";
const CUENTAS = [
  {
    nombre: "Supervisor",
    apellido: "Prueba 1",
    email: "supervisor.prueba1@test.cordilleramyp.local",
    telefono: "56900001001",
    fecha_nacimiento: "1990-05-10",
  },
  {
    nombre: "Supervisor",
    apellido: "Prueba 2",
    email: "supervisor.prueba2@test.cordilleramyp.local",
    telefono: "56900001002",
    fecha_nacimiento: "1988-11-22",
  },
  {
    nombre: "Supervisor",
    apellido: "Prueba 3",
    email: "supervisor.prueba3@test.cordilleramyp.local",
    telefono: "56900001003",
    fecha_nacimiento: "1992-03-03",
  },
];

async function main() {
  for (const c of CUENTAS) {
    // 1) fila pendiente en `personal` (igual que una invitación del panel §2.10)
    const { data: existente } = await admin
      .from("personal")
      .select("id, user_id")
      .eq("email", c.email)
      .maybeSingle();

    let personalId = existente?.id;
    if (!personalId) {
      const { data, error } = await admin
        .from("personal")
        .insert({
          nombre: c.nombre,
          apellido: c.apellido,
          rol: "supervisor",
          email: c.email,
          telefono: c.telefono,
          fecha_nacimiento: c.fecha_nacimiento,
          activo: true,
          user_id: null,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  ✗ ${c.email}: no se pudo crear personal — ${error.message}`);
        continue;
      }
      personalId = data.id;
    }

    // 2) usuario de Supabase Auth ya confirmado (sin enviar correo).
    //    `admin.createUser` deja los campos de token en '' — no en NULL —, así
    //    GoTrue puede escanear la fila al hacer login (si se insertara a mano en
    //    auth.users con esos campos NULL, el login devuelve 500 "Database error
    //    querying schema" y el navegador lo muestra como "Failed to fetch").
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email: c.email,
      password: CLAVE,
      email_confirm: true,
      user_metadata: { nombre: c.nombre, apellido: c.apellido },
    });

    if (errCrear) {
      if (/already been registered|already exists/i.test(errCrear.message)) {
        console.log(`  = ${c.email}: ya existe en Auth, se salta.`);
      } else {
        console.error(`  ✗ ${c.email}: ${errCrear.message}`);
        continue;
      }
    }

    // 3) el trigger handle_new_user enlaza personal.user_id automáticamente;
    //    lo confirmamos y, si por algún motivo no ocurrió, lo forzamos.
    const uid = creado?.user?.id;
    if (uid) {
      const { data: p } = await admin
        .from("personal")
        .select("user_id")
        .eq("id", personalId)
        .single();
      if (!p?.user_id) {
        await admin.from("personal").update({ user_id: uid }).eq("id", personalId);
      }
    }
  }

  // --- verificación final: las 3 con user_id no nulo ---
  const { data: filas } = await admin
    .from("personal")
    .select("email, user_id, rol")
    .like("email", "%@test.cordilleramyp.local")
    .order("email");

  console.log("\n=== Cuentas de prueba (login real) ===");
  for (const f of filas ?? []) {
    console.log(
      `  ${f.email}  ·  clave: ${CLAVE}  ·  ${
        f.user_id ? "enlazada ✓" : "SIN user_id ✗"
      }`,
    );
  }
  const faltan = (filas ?? []).filter((f) => !f.user_id);
  if (faltan.length) {
    console.error(`\n${faltan.length} cuenta(s) quedaron sin enlazar.`);
    process.exit(1);
  }
  console.log("\nListo. Todas enlazadas y listas para iniciar sesión.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
