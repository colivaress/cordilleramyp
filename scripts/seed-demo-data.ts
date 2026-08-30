/**
 * ⚠️  SOLO PARA LA BASE DE DATOS DE DESARROLLO / PRUEBAS  ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 * Este script inserta ~160 inspecciones ficticias + 10 supervisores genéricos
 * ("Supervisor 1".."Supervisor 10") para poder probar el dashboard, la
 * paginación, los filtros y los gráficos de analítica (§2.6 / §2.11 / §11).
 *
 * NUNCA correr esto contra la base de datos de producción con datos reales de
 * la empresa. No forma parte del build ni del deploy — es una herramienta de
 * una sola corrida.
 *
 * Uso:   npx tsx scripts/seed-demo-data.ts
 * Requiere en .env.local:  NEXT_PUBLIC_SUPABASE_URL  y  SUPABASE_SERVICE_ROLE_KEY
 *
 * Limpieza (borra todo lo que sembró este script):
 *   delete from tickets where id in (
 *     select ticket_id from ticket_revisiones
 *     where firma_conductor_url like 'https://placehold.co/%');
 *   delete from personal where email like '%@seed.cordilleramyp.local';
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import type { TicketEstado } from "../src/lib/tipos";

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
const db = createClient<Database>(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FOTO = "https://placehold.co/800x600?text=Falla+de+prueba";
const FIRMA = "https://placehold.co/300x120?text=Firma";
const ITEM_KEYS = [
  "plataforma", "teleras_y_ganchos", "carpas", "nylon", "ponchos", "cordeles",
  "cortinas", "goma_drenaje", "sider_broches", "esquineros", "eslingas",
  "trinquetes", "carga", "maletero", "fugas", "luces", "neumaticos", "cunas",
];
const TRANSPORTES = ["CMPC", "empresa1", "empresa222", "empresa666", "empresa000", "empresa11111"];
const CONDUCTORES = ["diego", "jaime", "kevin", "pablo", "pedro", "marco", "luis", "sergio"];
const TIPOS = ["abierto", "acoplado"];
const PATENTES = ["gggg33", "gggg66", "gggg77", "hjhk00", "hjhk52", "hjhk99", "jklm11", "jklm22", "pqrs33", "pqrs44"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const AHORA = new Date();
const MES_ACTUAL = AHORA.getUTCMonth() + 1; // 1..12, base 2026

async function main() {
  // 1) 10 supervisores de prueba (user_id null -> "Invitación pendiente")
  const sups = Array.from({ length: 10 }, (_, i) => ({
    nombre: `Supervisor ${i + 1}`,
    apellido: "Demo",
    email: `supervisor${i + 1}@seed.cordilleramyp.local`,
    telefono: `569000000${String(i + 1).padStart(2, "0")}`,
    rol: "supervisor" as const,
    activo: true,
    user_id: null,
  }));
  await db.from("personal").upsert(sups, { onConflict: "email", ignoreDuplicates: true });

  // pool de supervisores (los 10 nuevos + los que ya existían), con pesos
  // desparejos: los primeros concentran la mayoría de las inspecciones.
  const { data: todos } = await db
    .from("personal")
    .select("id, nombre")
    .eq("rol", "supervisor")
    .order("created_at");
  const ids = (todos ?? []).map((s) => s.id);
  const pool: string[] = [];
  ids.forEach((id, i) => {
    const peso = Math.max(1, 9 - i);
    for (let k = 0; k < peso; k++) pool.push(id);
  });

  let creados = 0;
  for (let mes = 1; mes <= (MES_ACTUAL <= 8 ? MES_ACTUAL : 8); mes++) {
    const nMes = 18 + Math.floor(Math.random() * 8); // 18..25
    for (let k = 0; k < nMes; k++) {
      const dia = 1 + Math.floor(Math.random() * 27);
      const hora = 7 + Math.floor(Math.random() * 10);
      const created = new Date(Date.UTC(2026, mes - 1, dia, hora, Math.floor(Math.random() * 60)));
      const supId = pick(pool);
      const r = Math.random();

      let estado: TicketEstado;
      if (mes <= 6) {
        estado = r < 0.85 ? "finalizada_sin_observaciones" : r < 0.97 ? "finalizada_con_observaciones" : "en_revision";
      } else if (mes === 7) {
        estado = r < 0.65 ? "finalizada_sin_observaciones" : r < 0.88 ? "finalizada_con_observaciones" : "en_revision";
      } else {
        estado = r < 0.35 ? "finalizada_sin_observaciones" : r < 0.7 ? "finalizada_con_observaciones" : "en_revision";
      }

      let venc: Date;
      if (mes < MES_ACTUAL) {
        venc = new Date(created.getTime() + 10 * 864e5); // vencidas hace meses, pero cerradas
      } else if (estado === "finalizada_sin_observaciones") {
        venc = new Date(created.getTime() + 10 * 864e5);
      } else {
        // mes actual + abiertas: reparte cerca de ahora para probar alertas (§3)
        const h = pick([-30, -6, 10, 20, 30, 60, 90]);
        venc = new Date(AHORA.getTime() + h * 3600_000);
      }

      const patCam = pick(PATENTES);
      const { data: tk, error: eT } = await db
        .from("tickets")
        .insert({
          transporte: pick(TRANSPORTES),
          conductor: pick(CONDUCTORES),
          fecha: created.toISOString(),
          procedencia: "papelera",
          tipo_camion: pick(TIPOS),
          patente_camion: patCam,
          patente_rampla: `r${patCam}`,
          estado,
          revision_actual: 1,
          supervisor_id: supId,
          fecha_vencimiento: venc.toISOString(),
          alerta_naranja_enviada: false,
          created_at: created.toISOString(),
          updated_at: created.toISOString(),
        })
        .select("id")
        .single();
      if (eT || !tk) {
        console.error("ticket:", eT?.message);
        continue;
      }

      await db.from("ticket_revisiones").insert({
        ticket_id: tk.id,
        numero_revision: 1,
        estado_resultante: estado,
        supervisor_id: supId,
        conductor: pick(CONDUCTORES),
        fecha_vencimiento: venc.toISOString(),
        firma_conductor_url: FIRMA,
        firma_fiscalizador_url: FIRMA,
        created_at: created.toISOString(),
      });

      const nc =
        estado === "finalizada_con_observaciones"
          ? 1 + Math.floor(Math.random() * 3)
          : estado === "en_revision"
            ? Math.floor(Math.random() * 3)
            : 0;
      const filas = ITEM_KEYS.map((key, i) =>
        i < nc
          ? {
              ticket_id: tk.id,
              revision_numero: 1,
              item_key: key,
              estado: "no_conforme" as const,
              observacion: `Observación de prueba en ${key}`,
              foto_url: FOTO,
              created_at: created.toISOString(),
            }
          : {
              ticket_id: tk.id,
              revision_numero: 1,
              item_key: key,
              estado: (Math.random() < 0.05 ? "no_aplica" : "conforme") as
                | "no_aplica"
                | "conforme",
              observacion: null,
              foto_url: null,
              created_at: created.toISOString(),
            },
      );
      await db.from("ticket_checklist_respuestas").insert(filas);
      creados++;
    }
  }

  // verificación rápida
  const { count: total } = await db
    .from("tickets")
    .select("*", { count: "exact", head: true });
  console.log(`\n✅ ${creados} inspecciones sembradas. Tickets en total: ${total}.`);
  console.log(
    "Revisa la distribución con:\n" +
      "  select to_char(created_at,'YYYY-MM') mes, count(*) from tickets group by 1 order by 1;\n" +
      "  select p.nombre, count(*) from tickets t join personal p on p.id=t.supervisor_id group by 1 order by 2 desc;",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
