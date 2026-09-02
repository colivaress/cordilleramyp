import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { enviarCorreoHtml } from "@/lib/email";
import {
  construirCorreoVencimientoAdmin,
  nombreCompleto,
  type MomentoVencimiento,
} from "@/lib/mensajes";
import {
  HORAS_AMARILLO,
  HORAS_NARANJA,
  formatearTiempoRestante,
  horasRestantes,
} from "@/lib/vencimiento";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * §3.1 + §3.2 — avisos automáticos de vencimiento, en una sola corrida del cron
 * (lo invoca Vercel Cron; ver `vercel.json`). Autenticado con
 * `Authorization: Bearer ${CRON_SECRET}` — cualquier otra llamada → 401.
 *
 * §3.1: a las ≤24h le manda UNA vez al supervisor la plantilla de WhatsApp de
 *       Meta y marca `alerta_naranja_enviada`.
 * §3.2: a los administradores activos les manda correo en 48h, 24h y al vencer
 *       (cada momento una sola vez por ciclo — `alerta_admin_*_enviada`).
 *
 * Los flags se reinician cuando el ticket vuelve a `en_revision` con una
 * `fecha_vencimiento` nueva (ver iniciarInspeccion / iniciarReinspeccion).
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

  const ahora = new Date();

  // ===================== §3.1 — WhatsApp al supervisor (≤24h) =====================
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

  const candidatos = (tickets ?? [])
    .map((t) => ({ t, horas: horasRestantes(t.fecha_vencimiento, ahora) }))
    .filter(
      (x): x is { t: (typeof tickets)[number]; horas: number } =>
        x.horas !== null && x.horas <= HORAS_NARANJA,
    );

  // ===================== §3.2 — correo a administradores (48h / 24h / vencido) ====
  const { data: adminsData } = await supabase
    .from("personal")
    .select("email")
    .eq("rol", "administrador")
    .eq("activo", true);
  const adminEmails = (adminsData ?? [])
    .map((a) => (a.email ?? "").trim())
    .filter(Boolean);

  const { data: ticketsCorreo } = await supabase
    .from("tickets")
    .select(
      "id, numero_inspeccion, patente_camion, patente_rampla, transporte, fecha_vencimiento, estado, alerta_admin_48h_enviada, alerta_admin_24h_enviada, alerta_admin_vencido_enviada, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido)",
    )
    .neq("estado", "finalizada_sin_observaciones");

  type TCorreo = NonNullable<typeof ticketsCorreo>[number];
  const avisosCorreo: { t: TCorreo; momento: MomentoVencimiento; horas: number }[] =
    [];
  for (const t of ticketsCorreo ?? []) {
    const horas = horasRestantes(t.fecha_vencimiento, ahora);
    if (horas === null) continue;
    if (horas <= HORAS_AMARILLO && !t.alerta_admin_48h_enviada)
      avisosCorreo.push({ t, momento: "48h", horas });
    if (horas <= HORAS_NARANJA && !t.alerta_admin_24h_enviada)
      avisosCorreo.push({ t, momento: "24h", horas });
    if (horas < 0 && !t.alerta_admin_vencido_enviada)
      avisosCorreo.push({ t, momento: "vencido", horas });
  }

  if (dry) {
    return NextResponse.json({
      dry: true,
      whatsapp: {
        revisados: tickets?.length ?? 0,
        candidatos: candidatos.map(({ t, horas }) => ({
          numeroInspeccion: t.numero_inspeccion,
          tiempoRestante: formatearTiempoRestante(horas),
          supervisorTelefono: t.supervisor?.telefono ?? null,
        })),
      },
      correoAdmin: {
        adminsActivos: adminEmails.length,
        avisos: avisosCorreo.map(({ t, momento, horas }) => ({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          tiempoRestante: formatearTiempoRestante(horas),
        })),
      },
    });
  }

  // --- envío WhatsApp ---
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
        await registrar(supabase, t.id, "whatsapp", "—", `FALLO (sin teléfono): ${contenido}`);
        await supabase
          .from("tickets")
          .update({ alerta_naranja_enviada: true })
          .eq("id", t.id);
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

      await supabase
        .from("tickets")
        .update({ alerta_naranja_enviada: true })
        .eq("id", t.id);
      await registrar(supabase, t.id, "whatsapp", telefono, contenido);
      resultados.push({ numeroInspeccion: t.numero_inspeccion, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error desconocido";
      console.error(
        `[cron alertas] WhatsApp Inspección ${t.numero_inspeccion}: ${msg}`,
      );
      await registrar(
        supabase,
        t.id,
        "whatsapp",
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

  // --- envío correo a administradores (§3.2) ---
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const flagUpdate = (m: MomentoVencimiento) =>
    m === "48h"
      ? { alerta_admin_48h_enviada: true }
      : m === "24h"
        ? { alerta_admin_24h_enviada: true }
        : { alerta_admin_vencido_enviada: true };
  const resultadosCorreo: {
    numeroInspeccion: number;
    momento: MomentoVencimiento;
    ok: boolean;
    error?: string;
  }[] = [];

  for (const { t, momento } of avisosCorreo) {
    const supervisorNombre = t.supervisor
      ? nombreCompleto(t.supervisor.nombre, t.supervisor.apellido)
      : "—";
    const { asunto, html } = construirCorreoVencimientoAdmin(momento, {
      ticketId: t.id,
      numeroInspeccion: t.numero_inspeccion,
      transporte: t.transporte,
      patenteCamion: t.patente_camion,
      patenteRampla: t.patente_rampla,
      supervisorNombre,
      fechaVencimiento: t.fecha_vencimiento,
      urlInforme: `${baseUrl}/tickets/${t.id}/report`,
    });

    try {
      if (adminEmails.length === 0) {
        await registrar(
          supabase,
          t.id,
          "email",
          "—",
          `FALLO (sin administradores activos con correo): ${asunto}`,
        );
        await supabase.from("tickets").update(flagUpdate(momento)).eq("id", t.id);
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          ok: false,
          error: "sin administradores activos",
        });
        continue;
      }

      await enviarCorreoHtml({ destinatarios: adminEmails, asunto, cuerpoHtml: html });

      await supabase.from("tickets").update(flagUpdate(momento)).eq("id", t.id);
      await registrar(
        supabase,
        t.id,
        "email",
        adminEmails.join(", "),
        `[${momento}] ${asunto}`,
      );
      resultadosCorreo.push({
        numeroInspeccion: t.numero_inspeccion,
        momento,
        ok: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error desconocido";
      console.error(
        `[cron alertas] correo ${momento} Inspección ${t.numero_inspeccion}: ${msg}`,
      );
      await registrar(
        supabase,
        t.id,
        "email",
        adminEmails.join(", ") || "—",
        `FALLO [${momento}]: ${asunto} — ${msg}`,
      );
      resultadosCorreo.push({
        numeroInspeccion: t.numero_inspeccion,
        momento,
        ok: false,
        error: msg,
      });
    }
  }

  return NextResponse.json({
    whatsapp: {
      revisados: tickets?.length ?? 0,
      candidatos: candidatos.length,
      enviados: resultados.filter((r) => r.ok).length,
      fallidos: resultados.filter((r) => !r.ok).length,
      resultados,
    },
    correoAdmin: {
      adminsActivos: adminEmails.length,
      avisos: avisosCorreo.length,
      enviados: resultadosCorreo.filter((r) => r.ok).length,
      fallidos: resultadosCorreo.filter((r) => !r.ok).length,
      resultados: resultadosCorreo,
    },
  });
}

type Admin = ReturnType<typeof createAdminClient>;

async function registrar(
  supabase: Admin,
  ticketId: string,
  tipo: "whatsapp" | "email",
  destinatario: string,
  contenido: string,
) {
  await supabase.from("notificaciones").insert({
    ticket_id: ticketId,
    tipo,
    destinatario,
    contenido,
  });
}
