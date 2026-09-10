import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { enviarCorreoHtml } from "@/lib/email";
import {
  construirCorreoVencimientoAdmin,
  construirCorreoVencimientoExterno,
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
 *       Meta y marca `alerta_naranja_enviada`. Todo el bloque depende de
 *       `WHATSAPP_ALERTAS_ACTIVAS === "true"` — interruptor explícito,
 *       ausente = apagado (ver .env.example).
 * §3.2: correo de vencimiento en 48h, 24h y al vencer (cada momento una sola
 *       vez por ciclo — `alerta_admin_*_enviada`), a DOS grupos separados,
 *       en dos envíos distintos (nunca mezclados en el mismo mensaje):
 *         - interno: administradores activos de `personal` + el supervisor
 *           del ticket si está activo. Plantilla con el link al informe y el
 *           nombre del supervisor (construirCorreoVencimientoAdmin).
 *         - externo: `destinatarios_correo` con `recibe_vencimientos = true`.
 *           Plantilla sin esos dos datos (construirCorreoVencimientoExterno)
 *           — gente fuera de Cordillera, sin cuenta en el sistema.
 *       Si un correo aparece en los dos grupos, se deja solo en el interno
 *       (comparación en minúsculas) para que nadie reciba dos copias. Un
 *       momento cuenta como "enviado" (se marca el flag) si al menos uno de
 *       los dos grupos salió bien.
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
  const whatsappActivo = process.env.WHATSAPP_ALERTAS_ACTIVAS === "true";

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
  // Interruptor explícito: si no está prendido, el bloque entero se salta —
  // ni siquiera se consulta qué tickets serían candidatos.
  let tickets: {
    id: string;
    numero_inspeccion: number;
    revision_actual: number;
    patente_camion: string;
    patente_rampla: string;
    fecha_vencimiento: string | null;
    estado: string;
    supervisor: { nombre: string; telefono: string | null } | null;
  }[] = [];
  let candidatos: {
    t: (typeof tickets)[number];
    horas: number;
  }[] = [];

  if (whatsappActivo) {
    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, numero_inspeccion, revision_actual, patente_camion, patente_rampla, fecha_vencimiento, estado, supervisor:personal!tickets_supervisor_id_fkey(nombre, telefono)",
      )
      .neq("estado", "finalizada_sin_observaciones")
      .eq("alerta_naranja_enviada", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    tickets = data ?? [];
    candidatos = tickets
      .map((t) => ({ t, horas: horasRestantes(t.fecha_vencimiento, ahora) }))
      .filter(
        (x): x is { t: (typeof tickets)[number]; horas: number } =>
          x.horas !== null && x.horas <= HORAS_NARANJA,
      );
  }

  // ===================== §3.2 — correo de vencimiento (48h / 24h / vencido) =======
  const { data: adminsData } = await supabase
    .from("personal")
    .select("email")
    .eq("rol", "administrador")
    .eq("activo", true);
  const adminEmails = (adminsData ?? [])
    .map((a) => (a.email ?? "").trim())
    .filter(Boolean);

  const { data: externosData } = await supabase
    .from("destinatarios_correo")
    .select("email")
    .eq("activo", true)
    .eq("recibe_vencimientos", true);
  const externosGlobal = (externosData ?? [])
    .map((d) => (d.email ?? "").trim())
    .filter(Boolean);

  const { data: ticketsCorreo } = await supabase
    .from("tickets")
    .select(
      "id, numero_inspeccion, patente_camion, patente_rampla, transporte, fecha_vencimiento, estado, alerta_admin_48h_enviada, alerta_admin_24h_enviada, alerta_admin_vencido_enviada, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido, email, activo)",
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
        activo: whatsappActivo,
        revisados: tickets.length,
        candidatos: candidatos.map(({ t, horas }) => ({
          numeroInspeccion: t.numero_inspeccion,
          tiempoRestante: formatearTiempoRestante(horas),
          supervisorTelefono: t.supervisor?.telefono ?? null,
        })),
      },
      correoVencimiento: {
        adminsActivos: adminEmails.length,
        externosActivos: externosGlobal.length,
        avisos: avisosCorreo.map(({ t, momento, horas }) => ({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          tiempoRestante: formatearTiempoRestante(horas),
        })),
      },
    });
  }

  // --- envío WhatsApp (solo si el interruptor está prendido) ---
  const resultados: {
    numeroInspeccion: number;
    ok: boolean;
    error?: string;
  }[] = [];

  if (whatsappActivo) {
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
  }

  // --- envío correo de vencimiento, dos grupos separados (§3.2) ---
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
    grupo: "interno" | "externo";
    ok: boolean;
    error?: string;
  }[] = [];

  for (const { t, momento } of avisosCorreo) {
    const supervisorNombre = t.supervisor
      ? nombreCompleto(t.supervisor.nombre, t.supervisor.apellido)
      : "—";

    // Interno: admins + el supervisor del ticket, solo si está activo.
    // Comparación de duplicados siempre en minúsculas.
    const internosLower = new Set(adminEmails.map((e) => e.toLowerCase()));
    if (t.supervisor?.activo) {
      const supervisorEmail = (t.supervisor.email ?? "").trim();
      if (supervisorEmail) internosLower.add(supervisorEmail.toLowerCase());
    }
    const correosInternos = Array.from(internosLower);

    // Externo: destinatarios_correo con recibe_vencimientos, menos quien ya
    // esté en el grupo interno — nadie recibe dos copias ni dos versiones.
    const correosExternos = Array.from(
      new Set(
        externosGlobal
          .map((e) => e.toLowerCase())
          .filter((e) => !internosLower.has(e)),
      ),
    );

    let internoOk = false;
    let externoOk = false;

    // --- grupo interno ---
    const { asunto: asuntoInterno, html: htmlInterno } =
      construirCorreoVencimientoAdmin(momento, {
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
      if (correosInternos.length === 0) {
        await registrar(
          supabase,
          t.id,
          "email",
          "—",
          `FALLO [${momento}/interno] (sin destinatarios internos activos): ${asuntoInterno}`,
        );
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "interno",
          ok: false,
          error: "sin destinatarios internos activos",
        });
      } else {
        await enviarCorreoHtml({
          destinatarios: correosInternos,
          asunto: asuntoInterno,
          cuerpoHtml: htmlInterno,
        });
        await registrar(
          supabase,
          t.id,
          "email",
          correosInternos.join(", "),
          `[${momento}/interno] ${asuntoInterno}`,
        );
        internoOk = true;
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "interno",
          ok: true,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error desconocido";
      console.error(
        `[cron alertas] correo ${momento}/interno Inspección ${t.numero_inspeccion}: ${msg}`,
      );
      await registrar(
        supabase,
        t.id,
        "email",
        correosInternos.join(", ") || "—",
        `FALLO [${momento}/interno]: ${asuntoInterno} — ${msg}`,
      );
      resultadosCorreo.push({
        numeroInspeccion: t.numero_inspeccion,
        momento,
        grupo: "interno",
        ok: false,
        error: msg,
      });
    }

    // --- grupo externo (solo si quedó alguien tras la deduplicación) ---
    if (correosExternos.length > 0) {
      const { asunto: asuntoExterno, html: htmlExterno } =
        construirCorreoVencimientoExterno(momento, {
          numeroInspeccion: t.numero_inspeccion,
          transporte: t.transporte,
          patenteCamion: t.patente_camion,
          patenteRampla: t.patente_rampla,
          fechaVencimiento: t.fecha_vencimiento,
        });
      try {
        await enviarCorreoHtml({
          destinatarios: correosExternos,
          asunto: asuntoExterno,
          cuerpoHtml: htmlExterno,
        });
        await registrar(
          supabase,
          t.id,
          "email",
          correosExternos.join(", "),
          `[${momento}/externo] ${asuntoExterno}`,
        );
        externoOk = true;
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "externo",
          ok: true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error desconocido";
        console.error(
          `[cron alertas] correo ${momento}/externo Inspección ${t.numero_inspeccion}: ${msg}`,
        );
        await registrar(
          supabase,
          t.id,
          "email",
          correosExternos.join(", "),
          `FALLO [${momento}/externo]: ${asuntoExterno} — ${msg}`,
        );
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "externo",
          ok: false,
          error: msg,
        });
      }
    }

    // El hito queda cerrado si al menos uno de los dos grupos salió bien.
    if (internoOk || externoOk) {
      await supabase.from("tickets").update(flagUpdate(momento)).eq("id", t.id);
    }
  }

  return NextResponse.json({
    whatsapp: {
      activo: whatsappActivo,
      revisados: tickets.length,
      candidatos: candidatos.length,
      enviados: resultados.filter((r) => r.ok).length,
      fallidos: resultados.filter((r) => !r.ok).length,
      resultados,
    },
    correoVencimiento: {
      adminsActivos: adminEmails.length,
      externosActivos: externosGlobal.length,
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
