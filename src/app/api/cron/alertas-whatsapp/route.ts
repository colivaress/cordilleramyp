import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import {
  HORAS_NARANJA,
  formatearTiempoRestante,
  horasRestantes,
} from "@/lib/vencimiento";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * §3.1 — aviso automático por WhatsApp cuando un ticket pasa a "naranjo" (≤24h).
 *
 * Lo invoca Vercel Cron (entrada `crons` en `vercel.json`). Autenticado con
 * `Authorization: Bearer ${CRON_SECRET}` — cualquier otra llamada → 401.
 *
 * En cada corrida: toma los tickets abiertos (estado != finalizada_sin_observaciones)
 * que todavía no avisaron su ciclo actual (`alerta_naranja_enviada = false`) y
 * cuyo `horas_restantes <= 24` (incluye ya vencidos). A cada uno le manda la
 * plantilla de Meta al `personal.telefono` de su supervisor y marca
 * `alerta_naranja_enviada = true` para no repetir. El flag se reinicia cuando el
 * ticket vuelve a `en_revision` (ver iniciarReinspeccion / iniciarInspeccion).
 * Un fallo puntual no aborta el resto — se registra en `notificaciones`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Configuración incompleta." },
      { status: 500 },
    );
  }

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select(
      "id, numero_inspeccion, revision_actual, patente_camion, patente_rampla, fecha_vencimiento, estado, supervisor:personal!tickets_supervisor_id_fkey(nombre, telefono)",
    )
    .neq("estado", "finalizada_sin_observaciones")
    .eq("alerta_naranja_enviada", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ahora = new Date();
  const candidatos = (tickets ?? [])
    .map((t) => ({ t, horas: horasRestantes(t.fecha_vencimiento, ahora) }))
    .filter(
      (x): x is { t: (typeof tickets)[number]; horas: number } =>
        x.horas !== null && x.horas <= HORAS_NARANJA,
    );

  if (dry) {
    return NextResponse.json({
      dry: true,
      revisados: tickets?.length ?? 0,
      candidatos: candidatos.map(({ t, horas }) => ({
        numeroInspeccion: t.numero_inspeccion,
        numeroRevision: t.revision_actual,
        patenteCamion: t.patente_camion.toUpperCase(),
        patenteRampla: t.patente_rampla.toUpperCase(),
        tiempoRestante: formatearTiempoRestante(horas),
        supervisorTelefono: t.supervisor?.telefono ?? null,
      })),
    });
  }

  const resultados: {
    numeroInspeccion: number;
    ok: boolean;
    error?: string;
  }[] = [];

  for (const { t, horas } of candidatos) {
    const telefono = (t.supervisor?.telefono ?? "").replace(/\D+/g, "");
    const tiempoRestante = formatearTiempoRestante(horas);
    const contenido = `Alerta automática ≤24h — Inspección ${t.numero_inspeccion} · Rev. ${t.revision_actual} · ${t.patente_camion.toUpperCase()}/${t.patente_rampla.toUpperCase()} (${tiempoRestante})`;

    try {
      if (!telefono) {
        // Condición permanente (falta el teléfono del supervisor): se registra
        // el fallo y se marca enviado para no reintentarlo cada corrida — el
        // botón manual sigue disponible una vez que carguen el teléfono.
        await registrar(supabase, t.id, "—", `FALLO (sin teléfono): ${contenido}`);
        await marcarEnviado(supabase, t.id);
        resultados.push({
          numeroInspeccion: t.numero_inspeccion,
          ok: false,
          error: "supervisor sin teléfono",
        });
        continue;
      }

      await enviarWhatsAppPlantilla({
        telefono,
        parametros: [
          String(t.numero_inspeccion),
          String(t.revision_actual),
          t.patente_camion.toUpperCase(),
          t.patente_rampla.toUpperCase(),
          tiempoRestante,
        ],
      });

      await marcarEnviado(supabase, t.id);
      await registrar(supabase, t.id, telefono, contenido);
      resultados.push({ numeroInspeccion: t.numero_inspeccion, ok: true });
    } catch (e) {
      // Error transitorio (token, plantilla, red…): NO se marca enviado, se
      // reintenta en la próxima corrida. Se deja registro para revisar.
      const msg = e instanceof Error ? e.message : "error desconocido";
      console.error(
        `[cron alertas-whatsapp] Inspección ${t.numero_inspeccion}: ${msg}`,
      );
      await registrar(
        supabase,
        t.id,
        telefono || "—",
        `FALLO: ${contenido} — ${msg}`,
      );
      resultados.push({
        numeroInspeccion: t.numero_inspeccion,
        ok: false,
        error: msg,
      });
    }
  }

  return NextResponse.json({
    revisados: tickets?.length ?? 0,
    candidatos: candidatos.length,
    enviados: resultados.filter((r) => r.ok).length,
    fallidos: resultados.filter((r) => !r.ok).length,
    resultados,
  });
}

type Admin = ReturnType<typeof createAdminClient>;

async function marcarEnviado(supabase: Admin, ticketId: string) {
  await supabase
    .from("tickets")
    .update({ alerta_naranja_enviada: true })
    .eq("id", ticketId);
}

async function registrar(
  supabase: Admin,
  ticketId: string,
  destinatario: string,
  contenido: string,
) {
  await supabase.from("notificaciones").insert({
    ticket_id: ticketId,
    tipo: "whatsapp",
    destinatario,
    contenido,
  });
}
