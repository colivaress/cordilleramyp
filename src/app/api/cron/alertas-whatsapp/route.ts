import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { enviarCorreoHtml } from "@/lib/email";
import {
  construirCorreoVencimientoConEnlace,
  construirCorreoVencimientoSinEnlace,
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
 *       en dos envíos distintos (nunca mezclados en el mismo mensaje). El
 *       criterio que separa los grupos es si el DESTINATARIO FINAL
 *       corresponde a una fila de `personal` — no de dónde salió la
 *       dirección:
 *         - Universo de destinatarios de este aviso: administrador y
 *           administrador_contrato activos de `personal`, + el supervisor
 *           del ticket si está activo, + `destinatarios_correo_tipos` con
 *           `recibe_vencimientos = true` PARA EL TIPO del ticket.
 *         - con enlace: de ese universo, los que corresponden a una fila de
 *           `personal` (por construcción, siempre incluye a
 *           administrador/administrador_contrato/supervisor; también a
 *           cualquier dirección de `destinatarios_correo` que por
 *           coincidencia sea la de alguien registrado en `personal`).
 *           Plantilla con el link al informe y el nombre del supervisor
 *           (construirCorreoVencimientoConEnlace).
 *         - sin enlace: el resto — direcciones de `destinatarios_correo`
 *           que no corresponden a nadie en `personal`. Mismo aviso, sin
 *           enlace (el informe exige sesión) ni nombre del supervisor
 *           (construirCorreoVencimientoSinEnlace).
 *       Un correo nunca recibe las dos copias (comparación en minúsculas).
 *       Un momento cuenta como "enviado" (se marca el flag) si al menos uno
 *       de los dos grupos salió bien.
 *
 * Los flags se reinician cuando el ticket vuelve a `en_revision` con una
 * `fecha_vencimiento` nueva (ver iniciarInspeccion / iniciarReinspeccion).
 * Un fallo puntual no aborta el resto — se registra en `notificaciones`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    // DIAGNÓSTICO TEMPORAL — sacar antes de mergear a main. Nunca loguea el
    // secreto ni el header completo, solo booleanos/largos/prefijo fijo.
    console.warn("[cron alertas] 401", {
      secretDefinido: Boolean(secret),
      largoSecret: secret?.length ?? 0,
      headerPresente: Boolean(authHeader),
      largoHeader: authHeader?.length ?? 0,
      prefijoHeader: authHeader?.slice(0, 7) ?? null,
    });
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
  // administrador_contrato recibe el grupo interno igual que administrador
  // — explícito en el alcance del rol ("recibir las alertas de vencimiento
  // en el grupo interno del cron, igual que un administrador").
  const { data: adminsData } = await supabase
    .from("personal")
    .select("email")
    .in("rol", ["administrador", "administrador_contrato"])
    .eq("activo", true);
  const adminEmails = (adminsData ?? [])
    .map((a) => (a.email ?? "").trim())
    .filter(Boolean);

  // Conjunto de TODOS los correos que corresponden a una fila de `personal`
  // (cualquier rol, activo o no) — es el criterio real que decide si un
  // destinatario recibe el enlace al informe (ver el comentario grande de
  // arriba). No se filtra por `activo`: la pregunta acá es "¿existe esta
  // persona en el sistema?", no "¿puede iniciar sesión hoy?" — eso ya lo
  // exige el propio enlace al abrirse (requireRol/RLS), no hace falta
  // duplicarlo en este chequeo.
  const { data: personalEmailsData } = await supabase
    .from("personal")
    .select("email");
  const emailsEnPersonal = new Set(
    (personalEmailsData ?? [])
      .map((p) => (p.email ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  // Destinatarios por tipo de inspección, configurados en
  // destinatarios_correo_tipos con recibe_vencimientos=true PARA ESE TIPO —
  // no es una sola lista global. Se trae UNA sola vez, agrupado por tipo, y
  // se busca el grupo correspondiente por ticket dentro del loop de abajo
  // (t.tipo_inspeccion) — evita repetir la consulta por cada ticket de la
  // corrida. Estas direcciones pueden terminar en cualquiera de los dos
  // grupos de envío (con o sin enlace) según si coinciden con `personal` —
  // ver el chequeo contra `emailsEnPersonal` más abajo.
  const { data: externosData } = await supabase
    .from("destinatarios_correo_tipos")
    .select(
      "tipo_inspeccion, destinatario:destinatarios_correo!inner(email, activo)",
    )
    .eq("recibe_vencimientos", true)
    .eq("destinatarios_correo.activo", true);
  const externosPorTipo = new Map<string, string[]>();
  for (const d of externosData ?? []) {
    const email = (d.destinatario.email ?? "").trim();
    if (!email) continue;
    const lista = externosPorTipo.get(d.tipo_inspeccion) ?? [];
    lista.push(email);
    externosPorTipo.set(d.tipo_inspeccion, lista);
  }

  const { data: ticketsCorreo } = await supabase
    .from("tickets")
    .select(
      "id, numero_inspeccion, patente_camion, patente_rampla, transporte, fecha_vencimiento, estado, tipo_inspeccion, alerta_admin_48h_enviada, alerta_admin_24h_enviada, alerta_admin_vencido_enviada, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido, email, activo)",
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
        externosActivosPorTipo: Object.fromEntries(
          [...externosPorTipo.entries()].map(([tipo, emails]) => [
            tipo,
            emails.length,
          ]),
        ),
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
    grupo: "conEnlace" | "sinEnlace";
    ok: boolean;
    error?: string;
  }[] = [];

  for (const { t, momento } of avisosCorreo) {
    const supervisorNombre = t.supervisor
      ? nombreCompleto(t.supervisor.nombre, t.supervisor.apellido)
      : "—";

    // Universo de este ticket: administrador/administrador_contrato + el
    // supervisor del ticket (si está activo) + destinatarios_correo_tipos
    // del tipo de este ticket. Comparación de duplicados siempre en
    // minúsculas — un correo nunca recibe dos copias.
    const baseLower = new Set(adminEmails.map((e) => e.toLowerCase()));
    if (t.supervisor?.activo) {
      const supervisorEmail = (t.supervisor.email ?? "").trim();
      if (supervisorEmail) baseLower.add(supervisorEmail.toLowerCase());
    }
    const configuradosDeEsteTipo = t.tipo_inspeccion
      ? (externosPorTipo.get(t.tipo_inspeccion) ?? [])
      : [];
    const configuradosLower = new Set(
      configuradosDeEsteTipo.map((e) => e.toLowerCase()).filter(Boolean),
    );
    for (const e of baseLower) configuradosLower.delete(e);

    // El criterio que separa los dos envíos: ¿esta dirección corresponde a
    // una fila de `personal`? — admin/administrador_contrato/supervisor
    // siempre lo son, por construcción; una dirección de
    // destinatarios_correo puede o no coincidir con alguien de `personal`.
    const conEnlaceLower = new Set(baseLower);
    const sinEnlaceLower = new Set<string>();
    for (const e of configuradosLower) {
      if (emailsEnPersonal.has(e)) conEnlaceLower.add(e);
      else sinEnlaceLower.add(e);
    }
    const correosConEnlace = Array.from(conEnlaceLower);
    const correosSinEnlace = Array.from(sinEnlaceLower);

    let conEnlaceOk = false;
    let sinEnlaceOk = false;

    // --- grupo con enlace ---
    const { asunto: asuntoConEnlace, html: htmlConEnlace } =
      construirCorreoVencimientoConEnlace(momento, {
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
      if (correosConEnlace.length === 0) {
        await registrar(
          supabase,
          t.id,
          "email",
          "—",
          `FALLO [${momento}/conEnlace] (sin destinatarios activos en personal): ${asuntoConEnlace}`,
        );
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "conEnlace",
          ok: false,
          error: "sin destinatarios activos en personal",
        });
      } else {
        await enviarCorreoHtml({
          destinatarios: correosConEnlace,
          asunto: asuntoConEnlace,
          cuerpoHtml: htmlConEnlace,
        });
        await registrar(
          supabase,
          t.id,
          "email",
          correosConEnlace.join(", "),
          `[${momento}/conEnlace] ${asuntoConEnlace}`,
        );
        conEnlaceOk = true;
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "conEnlace",
          ok: true,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error desconocido";
      console.error(
        `[cron alertas] correo ${momento}/conEnlace Inspección ${t.numero_inspeccion}: ${msg}`,
      );
      await registrar(
        supabase,
        t.id,
        "email",
        correosConEnlace.join(", ") || "—",
        `FALLO [${momento}/conEnlace]: ${asuntoConEnlace} — ${msg}`,
      );
      resultadosCorreo.push({
        numeroInspeccion: t.numero_inspeccion,
        momento,
        grupo: "conEnlace",
        ok: false,
        error: msg,
      });
    }

    // --- grupo sin enlace ---
    // A diferencia del grupo con enlace (siempre debería haber
    // administradores), un tipo de inspección sin destinatarios externos
    // configurados (o todos coincidiendo con personal) es un estado válido
    // — pero no debe quedar en silencio: si nadie sin cuenta se entera de
    // un vencimiento porque nadie cargó destinatarios para ese tipo (o el
    // Map ni siquiera trae esa clave, `?? []`), eso tiene que verse en la
    // corrida, no descubrirse después preguntando por qué no llegó nada.
    if (correosSinEnlace.length === 0) {
      console.log(
        `[cron alertas] correo ${momento}/sinEnlace Inspección ${t.numero_inspeccion}: sin destinatarios configurados para tipo "${t.tipo_inspeccion ?? "—"}" (o todos correspondían a alguien de personal)`,
      );
      await registrar(
        supabase,
        t.id,
        "email",
        "—",
        `SIN DESTINATARIOS [${momento}/sinEnlace] (tipo ${t.tipo_inspeccion ?? "—"}): ningún destinatario configurado/activo para este tipo fuera de personal`,
      );
      resultadosCorreo.push({
        numeroInspeccion: t.numero_inspeccion,
        momento,
        grupo: "sinEnlace",
        ok: false,
        error: `sin destinatarios sin enlace para tipo ${t.tipo_inspeccion ?? "—"}`,
      });
    } else {
      const { asunto: asuntoSinEnlace, html: htmlSinEnlace } =
        construirCorreoVencimientoSinEnlace(momento, {
          numeroInspeccion: t.numero_inspeccion,
          transporte: t.transporte,
          patenteCamion: t.patente_camion,
          patenteRampla: t.patente_rampla,
          fechaVencimiento: t.fecha_vencimiento,
        });
      try {
        await enviarCorreoHtml({
          destinatarios: correosSinEnlace,
          asunto: asuntoSinEnlace,
          cuerpoHtml: htmlSinEnlace,
        });
        await registrar(
          supabase,
          t.id,
          "email",
          correosSinEnlace.join(", "),
          `[${momento}/sinEnlace] ${asuntoSinEnlace}`,
        );
        sinEnlaceOk = true;
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "sinEnlace",
          ok: true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error desconocido";
        console.error(
          `[cron alertas] correo ${momento}/sinEnlace Inspección ${t.numero_inspeccion}: ${msg}`,
        );
        await registrar(
          supabase,
          t.id,
          "email",
          correosSinEnlace.join(", "),
          `FALLO [${momento}/sinEnlace]: ${asuntoSinEnlace} — ${msg}`,
        );
        resultadosCorreo.push({
          numeroInspeccion: t.numero_inspeccion,
          momento,
          grupo: "sinEnlace",
          ok: false,
          error: msg,
        });
      }
    }

    // El hito queda cerrado si al menos uno de los dos grupos salió bien.
    if (conEnlaceOk || sinEnlaceOk) {
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
      externosActivosPorTipo: Object.fromEntries(
        [...externosPorTipo.entries()].map(([tipo, emails]) => [
          tipo,
          emails.length,
        ]),
      ),
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
