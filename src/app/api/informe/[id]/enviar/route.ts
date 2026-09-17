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
  construirCuerpoInformeControlSalida,
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
async function preparar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  opciones: OpcionesInforme,
) {
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

  // §2.6: el informe lo pueden manejar supervisor, administrador y
  // administrador_contrato (este último: "enviar informes por correo",
  // explícito en su alcance — puede enviar, nunca crear/editar/cerrar).
  if (
    !perfil ||
    (perfil.rol !== "supervisor" &&
      perfil.rol !== "administrador" &&
      perfil.rol !== "administrador_contrato")
  ) {
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

  // §2.6: el administrador ve/envía el informe de CUALQUIER ticket —
  // administrador_contrato también ("ver todas las inspecciones... como un
  // administrador", "enviar informes por correo"). Un supervisor puede el
  // de los suyos, más los que estén "con observaciones" (o el legado
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
    perfil.rol !== "administrador_contrato" &&
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

  return { informe, perfil };
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
  const supabase = await createClient();
  const prep = await preparar(supabase, id, leerOpciones(req));
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

  const supabase = await createClient();

  // Destinatarios por tipo de inspección: cada fila de destinatarios_correo
  // ahora tiene un permiso POR TIPO en destinatarios_correo_tipos (no un
  // flag global) — un destinatario autorizado para Encarpe no está
  // autorizado para Control de Salida solo porque esté activo. Sin este
  // chequeo el modelo por tipo es decorativo: la pantalla mostraría listas
  // separadas y esta ruta seguiría aceptando cualquier destinatario — la
  // misma forma del error de "sin tipos = todos los tipos" del PR #32. Se
  // necesita el tipo del ticket ANTES del chequeo de destinatarios, así que
  // esta consulta va antes de preparar() (igual que la validación de
  // destinatarios ya iba antes: preparar() genera el PDF, caro en CPU, no
  // hay que pagarlo si el pedido ya está mal formado).
  const { data: ticketTipo } = await supabase
    .from("tickets")
    .select("tipo_inspeccion")
    .eq("id", id)
    .maybeSingle();
  if (!ticketTipo?.tipo_inspeccion) {
    return NextResponse.json(
      { error: "Ticket no encontrado o sin tipo de inspección." },
      { status: 404 },
    );
  }

  // Corrección crítica de seguridad: el informe solo se puede mandar a
  // destinatarios pre-autorizados por un administrador PARA ESTE TIPO
  // (destinatarios_correo.activo = true, destinatarios_correo_tipos con
  // ese tipo_inspeccion y recibe_informes = true) — nunca a una dirección
  // libre escrita por quien envía. recibe_informes distingue esto de
  // recibe_vencimientos (el aviso automático de vencimiento del cron, otro
  // flujo aparte) — un destinatario puede estar activo para uno y no para
  // el otro, y autorizado para un tipo y no para otro. Comparación en
  // minúsculas por ambos lados: una mayúscula no debe romper un correo
  // legítimo.
  const { data: autorizados, error: errDestinatarios } = await supabase
    .from("destinatarios_correo_tipos")
    .select("destinatario:destinatarios_correo!inner(email, activo)")
    .eq("tipo_inspeccion", ticketTipo.tipo_inspeccion)
    .eq("recibe_informes", true)
    .eq("destinatarios_correo.activo", true);
  if (errDestinatarios) {
    return NextResponse.json(
      { error: "No se pudo validar los destinatarios." },
      { status: 500 },
    );
  }
  const permitidos = new Set(
    (autorizados ?? []).map((d) => d.destinatario.email.toLowerCase()),
  );
  const noAutorizados = destinatarios.filter(
    (e) => !permitidos.has(e.toLowerCase()),
  );
  if (noAutorizados.length > 0) {
    return NextResponse.json(
      {
        error: `Destinatario(s) no autorizados: ${noAutorizados.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const prep = await preparar(supabase, id, leerOpciones(req));
  if (prep.error) return prep.error;
  const { informe, perfil } = prep;

  const firmanteNombre = nombreCompleto(perfil.nombre, perfil.apellido);

  const datosAsunto = {
    numeroInspeccion: informe.meta.numeroInspeccion,
    numeroRevision: informe.meta.numeroRevision,
    // §4: el asunto refleja si el PDF adjunto es una revisión o todo el historial.
    todasLasRevisiones: informe.meta.modo === "todas",
    // Fase "tipos de inspección" §1: el título va en el asunto, no compuesto en código.
    tituloInforme: informe.meta.tituloInforme,
    transporte: informe.meta.transporte,
    patenteCamion: informe.meta.patenteCamion,
    patenteRampla: informe.meta.patenteRampla,
    conductor: informe.meta.conductor,
    firmanteNombre,
    observaciones: informe.meta.observaciones,
    esSoloFotos: informe.meta.esSoloFotos,
    observacionGeneral: informe.meta.observacionGeneral,
  };

  // Fase "tipos de inspección" §5: Control de Salida tiene un cuerpo de
  // correo distinto EN LA FORMA (veredicto primero, después identificación,
  // recién después los datos del camión) — lo abre un guardia de portería en
  // el celular para autorizar o rechazar la salida. Los otros tres tipos
  // conservan el cuerpo de siempre.
  const cuerpoHtml =
    informe.meta.tipoInspeccion === "control_salida"
      ? construirCuerpoInformeControlSalida({
          numeroInspeccion: informe.meta.numeroInspeccion,
          fechaInspeccion: informe.meta.fechaInspeccion,
          aprobado: informe.meta.estadoResultante === "finalizada_sin_observaciones",
          transporte: informe.meta.transporte,
          patenteCamion: informe.meta.patenteCamion,
          patenteRampla: informe.meta.patenteRampla,
          conductor: informe.meta.conductor,
          firmanteNombre,
          observaciones: informe.meta.observaciones,
          observacionGeneral: informe.meta.observacionGeneral,
        })
      : construirCuerpoInforme(datosAsunto);

  try {
    await enviarInformePorCorreo({
      destinatarios,
      asunto: construirAsuntoInforme(datosAsunto),
      cuerpoHtml,
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
      contenido: construirAsuntoInforme(datosAsunto),
    })),
  );

  return NextResponse.json({
    ok: true,
    enviados: destinatarios.length,
    pdfBytes: informe.pdf.length,
  });
}
