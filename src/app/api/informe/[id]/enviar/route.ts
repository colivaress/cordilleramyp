import { performance } from "node:perf_hooks";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generarInformePdf,
  type OpcionesInforme,
} from "@/lib/pdf/generarInformePdf";
import { enviarInformePorCorreo } from "@/lib/email";
import {
  construirAsuntoInforme,
  construirCuerpoInforme,
  nombreCompleto,
} from "@/lib/mensajes";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** §4: `?rev=todas` o `?rev=<n>`; sin param -> la revisión más reciente. */
function leerOpciones(req: NextRequest): OpcionesInforme {
  const rev = req.nextUrl.searchParams.get("rev");
  if (!rev) return {};
  if (rev === "todas") return { revision: "todas" };
  const n = Number(rev);
  return Number.isInteger(n) && n > 0 ? { revision: n } : {};
}

/** Autoriza y genera el PDF, o devuelve una respuesta de error. */
async function preparar(id: string, opciones: OpcionesInforme) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }

  const { data: perfil } = await supabase
    .from("personal")
    .select("id, rol, nombre, apellido, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  // §2.10: cuenta desactivada = sin acceso.
  if (perfil && !perfil.activo) {
    return {
      error: NextResponse.json({ error: "Cuenta desactivada." }, { status: 403 }),
    };
  }

  // §2.6: el informe lo pueden manejar tanto el supervisor como el administrador.
  if (!perfil || (perfil.rol !== "supervisor" && perfil.rol !== "administrador")) {
    return {
      error: NextResponse.json(
        { error: "Solo un supervisor o administrador puede acceder al informe." },
        { status: 403 },
      ),
    };
  }

  const tPdf = performance.now();
  const informe = await generarInformePdf(supabase, id, opciones);
  console.log(
    `[informe] generarInformePdf total: ${Math.round(performance.now() - tPdf)}ms`,
  );
  if (!informe) {
    return {
      error: NextResponse.json(
        { error: "Ticket no encontrado o sin acceso." },
        { status: 404 },
      ),
    };
  }

  // §2.6: el administrador ve/envía el informe de CUALQUIER ticket. Un supervisor
  // puede el de los suyos, más los que estén "con observaciones" (o el legado
  // "en reparación") — la segunda inspección la puede tomar otro supervisor.
  const { data: estadoTicket } = await supabase
    .from("tickets")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  const conObservaciones =
    estadoTicket?.estado === "finalizada_con_observaciones" ||
    estadoTicket?.estado === "en_reparacion_de_observaciones";
  if (
    perfil.rol !== "administrador" &&
    informe.meta.supervisorId !== perfil.id &&
    !conObservaciones
  ) {
    return {
      error: NextResponse.json(
        { error: "Solo se puede acceder a informes de tickets propios." },
        { status: 403 },
      ),
    };
  }

  return { supabase, informe, perfil };
}

/** Nombre de archivo del PDF según lo seleccionado en pantalla (§4). */
function nombreArchivoInforme(meta: {
  numeroInspeccion: number;
  numeroRevision: number;
  modo: "una" | "todas";
}): string {
  return meta.modo === "todas"
    ? `informe-inspeccion-${meta.numeroInspeccion}-todas-las-revisiones.pdf`
    : `informe-inspeccion-${meta.numeroInspeccion}-rev-${meta.numeroRevision}.pdf`;
}

// Descarga / vista previa del PDF del informe (el supervisor dueño).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prep = await preparar(id, leerOpciones(req));
  if (prep.error) return prep.error;

  const nombre = nombreArchivoInforme(prep.informe.meta);
  return new NextResponse(new Uint8Array(prep.informe.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Genera el PDF del informe y lo envía adjunto por correo a los destinatarios.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let destinatarios: string[] = [];
  try {
    const body = await req.json();
    destinatarios = Array.isArray(body?.destinatarios)
      ? body.destinatarios.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const invalidos = destinatarios.filter((e) => !EMAIL_RE.test(e));
  if (destinatarios.length === 0 || invalidos.length > 0) {
    return NextResponse.json(
      {
        error:
          invalidos.length > 0
            ? `Correos inválidos: ${invalidos.join(", ")}`
            : "Seleccionar al menos un destinatario.",
      },
      { status: 400 },
    );
  }

  const prep = await preparar(id, leerOpciones(req));
  if (prep.error) return prep.error;
  const { supabase, informe, perfil } = prep;

  const datosCorreo = {
    numeroInspeccion: informe.meta.numeroInspeccion,
    numeroRevision: informe.meta.numeroRevision,
    // §4: el asunto refleja si el PDF adjunto es una revisión o todo el historial.
    todasLasRevisiones: informe.meta.modo === "todas",
    transporte: informe.meta.transporte,
    patenteCamion: informe.meta.patenteCamion,
    patenteRampla: informe.meta.patenteRampla,
    conductor: informe.meta.conductor,
    // §4.1: firma = quien envía el correo ahora (usuario autenticado), no el
    // dueño original del ticket.
    firmanteNombre: nombreCompleto(perfil.nombre, perfil.apellido),
    observaciones: informe.meta.observaciones,
  };

  try {
    await enviarInformePorCorreo({
      destinatarios,
      asunto: construirAsuntoInforme(datosCorreo),
      cuerpoHtml: construirCuerpoInforme(datosCorreo),
      pdf: informe.pdf,
      nombreArchivo: nombreArchivoInforme(informe.meta),
    });
  } catch (e) {
    // §4.1: si el envío falla, error real — nunca un falso "enviado con éxito".
    return NextResponse.json(
      {
        error: `No se pudo enviar el correo: ${
          e instanceof Error ? e.message : "error desconocido"
        }`,
      },
      { status: 502 },
    );
  }

  // Solo se registra el envío si el correo salió de verdad.
  await supabase.from("notificaciones").insert(
    destinatarios.map((email) => ({
      ticket_id: id,
      tipo: "email" as const,
      destinatario: email,
      contenido: construirAsuntoInforme(datosCorreo),
    })),
  );

  return NextResponse.json({
    ok: true,
    enviados: destinatarios.length,
    pdfBytes: informe.pdf.length,
  });
}
