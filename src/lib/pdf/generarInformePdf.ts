import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { firmarRutas } from "@/lib/storage";
import { ETIQUETA_ESTADO, ETIQUETA_ITEM } from "@/lib/tipos";
import { InformePDF, type InformePDFDatos } from "@/lib/pdf/InformePDF";

type SB = SupabaseClient<Database>;

const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

async function aDataUri(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export type InformeGenerado = {
  pdf: Buffer;
  datos: InformePDFDatos;
  meta: {
    ticketId: string;
    supervisorId: string | null;
    supervisorNombre: string;
    numeroInspeccion: number;
    numeroRevision: number;
    patenteCamion: string;
    patenteRampla: string;
    transporte: string;
    conductor: string;
    observaciones: { nombre: string; observacion: string | null }[];
  };
};

/** Arma el PDF del informe de la revisión vigente de un ticket. */
export async function generarInformePdf(
  supabase: SB,
  ticketId: string,
): Promise<InformeGenerado | null> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*, supervisor:personal!tickets_supervisor_id_fkey(nombre)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return null;

  const { data: revision } = await supabase
    .from("ticket_revisiones")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("numero_revision", ticket.revision_actual)
    .maybeSingle();

  // §2.6/§2.7: el informe muestra el conductor y el vencimiento de la revisión
  // reportada.
  const conductorRevision = revision?.conductor ?? ticket.conductor;
  const vencimientoRevision =
    revision?.fecha_vencimiento ?? ticket.fecha_vencimiento;

  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("*, item:checklist_items(nombre, orden)")
    .eq("ticket_id", ticketId)
    .eq("revision_numero", ticket.revision_actual);

  const filas = (respuestas ?? []).sort(
    (a, b) => (a.item?.orden ?? 0) - (b.item?.orden ?? 0),
  );

  const urlFotos = await firmarRutas(
    supabase,
    "fallas",
    filas.map((r) => r.foto_url),
  );
  const urlFirmas = await firmarRutas(supabase, "firmas", [
    revision?.firma_conductor_url,
    revision?.firma_fiscalizador_url,
  ]);

  const items = await Promise.all(
    filas.map(async (r, i) => ({
      n: i + 1,
      nombre: r.item?.nombre ?? r.item_key,
      estado: ETIQUETA_ITEM[r.estado],
      esNoConforme: r.estado === "no_conforme",
      observacion: r.observacion,
      fotoDataUri:
        r.estado === "no_conforme" && r.foto_url
          ? await aDataUri(urlFotos[r.foto_url])
          : null,
    })),
  );

  const [firmaConductorUri, firmaFiscalizadorUri] = await Promise.all([
    aDataUri(
      revision?.firma_conductor_url
        ? urlFirmas[revision.firma_conductor_url]
        : undefined,
    ),
    aDataUri(
      revision?.firma_fiscalizador_url
        ? urlFirmas[revision.firma_fiscalizador_url]
        : undefined,
    ),
  ]);

  const observaciones = filas
    .filter((r) => r.estado === "no_conforme")
    .map((r) => ({
      nombre: r.item?.nombre ?? r.item_key,
      observacion: r.observacion,
    }));

  const datos: InformePDFDatos = {
    numeroInspeccion: ticket.numero_inspeccion,
    numeroRevision: ticket.revision_actual,
    estado: ETIQUETA_ESTADO[ticket.estado],
    emitidoEl: fmt(new Date().toISOString()),
    cabecera: {
      transporte: ticket.transporte,
      conductor: conductorRevision,
      fecha: fmt(ticket.fecha),
      procedencia: ticket.procedencia,
      tipoCamion: ticket.tipo_camion,
      patenteCamion: ticket.patente_camion,
      patenteRampla: ticket.patente_rampla,
      supervisor: ticket.supervisor?.nombre ?? "—",
      vencimiento: fmt(vencimientoRevision),
    },
    items,
    firmas: {
      conductor: {
        nombre: conductorRevision,
        fecha: fmt(revision?.created_at ?? null),
        dataUri: firmaConductorUri,
      },
      fiscalizador: {
        nombre: ticket.supervisor?.nombre ?? "—",
        fecha: fmt(revision?.created_at ?? null),
        dataUri: firmaFiscalizadorUri,
      },
    },
  };

  const pdf = await renderToBuffer(InformePDF({ datos }));

  return {
    pdf,
    datos,
    meta: {
      ticketId: ticket.id,
      supervisorId: ticket.supervisor_id,
      supervisorNombre: ticket.supervisor?.nombre ?? "—",
      numeroInspeccion: ticket.numero_inspeccion,
      numeroRevision: ticket.revision_actual,
      patenteCamion: ticket.patente_camion,
      patenteRampla: ticket.patente_rampla,
      transporte: ticket.transporte,
      conductor: conductorRevision,
      observaciones,
    },
  };
}
