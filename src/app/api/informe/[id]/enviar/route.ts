import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarInformePdf } from "@/lib/pdf/generarInformePdf";
import { enviarInformePorCorreo } from "@/lib/email";
import {
  construirAsuntoInforme,
  construirCuerpoInforme,
} from "@/lib/mensajes";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Autoriza y genera el PDF, o devuelve una respuesta de error. */
async function preparar(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }

  const { data: perfil } = await supabase
    .from("personal")
    .select("id, rol")
    .eq("user_id", user.id)
    .maybeSingle();

  // §2.6: el informe lo maneja el supervisor dueño, no el administrador.
  if (!perfil || perfil.rol !== "supervisor") {
    return {
      error: NextResponse.json(
        { error: "Solo el supervisor a cargo puede acceder al informe." },
        { status: 403 },
      ),
    };
  }

  const informe = await generarInformePdf(supabase, id);
  if (!informe) {
    return {
      error: NextResponse.json(
        { error: "Ticket no encontrado o sin acceso." },
        { status: 404 },
      ),
    };
  }
  if (informe.meta.supervisorId !== perfil.id) {
    return {
      error: NextResponse.json(
        { error: "Solo se puede acceder a informes de tickets propios." },
        { status: 403 },
      ),
    };
  }

  return { supabase, informe };
}

// Descarga / vista previa del PDF del informe (el supervisor dueño).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prep = await preparar(id);
  if (prep.error) return prep.error;

  const nombre = `informe-revision-${prep.informe.meta.nroRevisionGlobal ?? "sn"}.pdf`;
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

  const prep = await preparar(id);
  if (prep.error) return prep.error;
  const { supabase, informe } = prep;

  const datosCorreo = {
    nroRevisionGlobal: informe.meta.nroRevisionGlobal,
    transporte: informe.meta.transporte,
    patenteCamion: informe.meta.patenteCamion,
    patenteRampla: informe.meta.patenteRampla,
    conductor: informe.meta.conductor,
    supervisorNombre: informe.meta.supervisorNombre,
    observaciones: informe.meta.observaciones,
  };

  let resultado;
  try {
    resultado = await enviarInformePorCorreo({
      destinatarios,
      asunto: construirAsuntoInforme(datosCorreo),
      cuerpo: construirCuerpoInforme(datosCorreo),
      pdf: informe.pdf,
      nombreArchivo: `informe-revision-${
        informe.meta.nroRevisionGlobal ?? "sn"
      }.pdf`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `No se pudo enviar el correo: ${
          e instanceof Error ? e.message : "error desconocido"
        }`,
      },
      { status: 502 },
    );
  }

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
    modo: resultado.modo,
    previewUrl: resultado.previewUrl ?? null,
    pdfBytes: informe.pdf.length,
  });
}
