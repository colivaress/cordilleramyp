import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { firmarRutas } from "@/lib/storage";
import { ETIQUETA_ESTADO, ETIQUETA_ITEM } from "@/lib/tipos";
import { nombreCompleto } from "@/lib/mensajes";
import {
  InformePDF,
  type InformePDFDatos,
  type RevisionPDF,
} from "@/lib/pdf/InformePDF";

type SB = SupabaseClient<Database>;

const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const fmtCorta = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

// §4.1: las imágenes se redimensionan/comprimen con sharp ANTES de embeberlas
// en el PDF. Sin esto, @react-pdf/renderer decodifica en JS puro cada PNG de
// varios megapíxeles (fotos de celular, logo 2816×1408) y la generación del
// informe tarda ~1 min. Con el resize baja a pocos segundos y el PDF de ~5 MB a
// unos cientos de KB.

// §8: logo real de la empresa. Se lee y redimensiona una sola vez por proceso.
let logoCache: string | null | undefined;
async function logoDataUri(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = await fs.promises.readFile(
      path.join(process.cwd(), "public", "logo-cordillera-mp.png"),
    );
    const chico = await sharp(buf)
      .resize({ width: 520, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    logoCache = `data:image/png;base64,${chico.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Descarga una imagen y la comprime para el PDF (JPEG ~1400px para fotos). */
async function fotoDataUri(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const chica = await sharp(buf)
      .rotate() // respeta la orientación EXIF de las fotos de celular
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${chica.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Descarga una firma (PNG chico con transparencia) — sin recomprimir a JPEG. */
async function firmaDataUri(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Las firmas ya son livianas; solo se acotan si vinieran enormes.
    const png =
      buf.length > 120_000
        ? await sharp(buf)
            .resize({ width: 900, withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer()
        : buf;
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** §4: qué revisión(es) incluir en el informe. Sin opción -> la más reciente. */
export type OpcionesInforme = { revision?: number | "todas" };

type RevisionRow = Database["public"]["Tables"]["ticket_revisiones"]["Row"];

export type InformeGenerado = {
  pdf: Buffer;
  datos: InformePDFDatos;
  meta: {
    ticketId: string;
    supervisorId: string | null;
    supervisorNombre: string;
    numeroInspeccion: number;
    /** modo "una" -> nro de esa revisión; modo "todas" -> nro de la más reciente. */
    numeroRevision: number;
    modo: "una" | "todas";
    patenteCamion: string;
    patenteRampla: string;
    transporte: string;
    /** Conductor de la revisión informada (modo "todas" -> la más reciente). */
    conductor: string;
    /** No conformes de la revisión informada (modo "todas" -> la más reciente). */
    observaciones: { nombre: string; observacion: string | null }[];
  };
};

/** Arma los datos de UNA revisión (checklist + firmas) para el PDF. */
async function construirRevisionPDF(
  supabase: SB,
  ticketId: string,
  rev: RevisionRow,
  conductorFallback: string,
  vencimientoFallback: string | null,
  supervisorNombre: string,
): Promise<{
  revisionPDF: RevisionPDF;
  observaciones: { nombre: string; observacion: string | null }[];
  conductor: string;
}> {
  const conductor = rev.conductor ?? conductorFallback;
  const vencimiento = rev.fecha_vencimiento ?? vencimientoFallback;

  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("*, item:checklist_items(nombre, orden)")
    .eq("ticket_id", ticketId)
    .eq("revision_numero", rev.numero_revision);

  const filas = (respuestas ?? []).sort(
    (a, b) => (a.item?.orden ?? 0) - (b.item?.orden ?? 0),
  );

  const urlFotos = await firmarRutas(
    supabase,
    "fallas",
    filas.map((r) => r.foto_url),
  );
  const urlFirmas = await firmarRutas(supabase, "firmas", [
    rev.firma_conductor_url,
    rev.firma_fiscalizador_url,
  ]);

  // §4.1: todas las fotos + firmas de la revisión, EN PARALELO.
  const [items, [firmaConductorUri, firmaFiscalizadorUri]] = await Promise.all([
    Promise.all(
      filas.map(async (r, i) => ({
        n: i + 1,
        nombre: r.item?.nombre ?? r.item_key,
        estado: ETIQUETA_ITEM[r.estado],
        esNoConforme: r.estado === "no_conforme",
        observacion: r.observacion,
        fotoDataUri:
          r.estado === "no_conforme" && r.foto_url
            ? await fotoDataUri(urlFotos[r.foto_url])
            : null,
      })),
    ),
    Promise.all([
      firmaDataUri(
        rev.firma_conductor_url ? urlFirmas[rev.firma_conductor_url] : undefined,
      ),
      firmaDataUri(
        rev.firma_fiscalizador_url
          ? urlFirmas[rev.firma_fiscalizador_url]
          : undefined,
      ),
    ]),
  ]);

  const observaciones = filas
    .filter((r) => r.estado === "no_conforme")
    .map((r) => ({
      nombre: r.item?.nombre ?? r.item_key,
      observacion: r.observacion,
    }));

  return {
    conductor,
    observaciones,
    revisionPDF: {
      numeroRevision: rev.numero_revision,
      fechaRevision: fmtCorta(rev.created_at),
      estadoResultante: ETIQUETA_ESTADO[rev.estado_resultante],
      conductor,
      vencimiento: fmt(vencimiento),
      items,
      firmas: {
        conductor: {
          nombre: conductor,
          fecha: fmt(rev.created_at),
          dataUri: firmaConductorUri,
        },
        fiscalizador: {
          nombre: supervisorNombre,
          fecha: fmt(rev.created_at),
          dataUri: firmaFiscalizadorUri,
        },
      },
    },
  };
}

/**
 * Arma el PDF del informe de un ticket. Por defecto (sin `opciones`) incluye
 * solo la revisión más reciente — comportamiento de siempre. Con
 * `{ revision: N }` incluye esa revisión puntual; con `{ revision: "todas" }`
 * incluye todo el historial de revisiones en orden (§4).
 */
export async function generarInformePdf(
  supabase: SB,
  ticketId: string,
  opciones?: OpcionesInforme,
): Promise<InformeGenerado | null> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*, supervisor:personal!tickets_supervisor_id_fkey(nombre, apellido)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return null;

  // §4.1: nombre + apellido; solo el nombre si el apellido no está cargado.
  const supervisorNombre = ticket.supervisor
    ? nombreCompleto(ticket.supervisor.nombre, ticket.supervisor.apellido)
    : "—";

  const { data: revisionesData } = await supabase
    .from("ticket_revisiones")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("numero_revision", { ascending: true });
  const revisiones = revisionesData ?? [];
  if (revisiones.length === 0) return null;

  const ultima =
    revisiones.find((r) => r.numero_revision === ticket.revision_actual) ??
    revisiones[revisiones.length - 1];

  // Resolver la selección. "todas" solo tiene sentido con 2+ revisiones.
  const puedeTodas = revisiones.length >= 2;
  const modo: "una" | "todas" =
    opciones?.revision === "todas" && puedeTodas ? "todas" : "una";

  let objetivo: RevisionRow[];
  if (modo === "todas") {
    objetivo = revisiones;
  } else if (typeof opciones?.revision === "number") {
    objetivo = [
      revisiones.find((r) => r.numero_revision === opciones.revision) ?? ultima,
    ];
  } else {
    objetivo = [ultima];
  }

  // §4.1: descarga + compresión de imágenes (logo, fotos, firmas) EN PARALELO.
  const tImg = performance.now();
  const [logo, construidas] = await Promise.all([
    logoDataUri(),
    Promise.all(
      objetivo.map((rev) =>
        construirRevisionPDF(
          supabase,
          ticketId,
          rev,
          ticket.conductor,
          ticket.fecha_vencimiento,
          supervisorNombre,
        ),
      ),
    ),
  ]);
  const nFotos = construidas.reduce(
    (acc, c) => acc + c.revisionPDF.items.filter((i) => i.fotoDataUri).length,
    0,
  );
  console.log(
    `[informe] imágenes (${objetivo.length} rev, ${nFotos} fotos): ${Math.round(
      performance.now() - tImg,
    )}ms`,
  );

  // Para el asunto/cuerpo del correo y el nombre de archivo: en modo "todas" se
  // resume la revisión más reciente (estado actual del ticket).
  const refParaCorreo =
    modo === "todas"
      ? construidas.find(
          (c) => c.revisionPDF.numeroRevision === ultima.numero_revision,
        ) ?? construidas[construidas.length - 1]
      : construidas[0];

  const datos: InformePDFDatos = {
    numeroInspeccion: ticket.numero_inspeccion,
    estado:
      modo === "todas"
        ? ETIQUETA_ESTADO[ticket.estado]
        : construidas[0].revisionPDF.estadoResultante,
    logoDataUri: logo,
    emitidoEl: fmt(new Date().toISOString()),
    modo,
    cabecera: {
      transporte: ticket.transporte,
      fecha: fmt(ticket.fecha),
      procedencia: ticket.procedencia,
      tipoCamion: ticket.tipo_camion,
      patenteCamion: ticket.patente_camion,
      patenteRampla: ticket.patente_rampla,
      supervisor: supervisorNombre,
    },
    revisiones: construidas.map((c) => c.revisionPDF),
  };

  const tRender = performance.now();
  const pdf = await renderToBuffer(InformePDF({ datos }));
  console.log(
    `[informe] render PDF: ${Math.round(performance.now() - tRender)}ms (${Math.round(
      pdf.length / 1024,
    )} KB)`,
  );

  return {
    pdf,
    datos,
    meta: {
      ticketId: ticket.id,
      supervisorId: ticket.supervisor_id,
      supervisorNombre,
      numeroInspeccion: ticket.numero_inspeccion,
      numeroRevision:
        modo === "todas"
          ? ultima.numero_revision
          : objetivo[0].numero_revision,
      modo,
      patenteCamion: ticket.patente_camion,
      patenteRampla: ticket.patente_rampla,
      transporte: ticket.transporte,
      conductor: refParaCorreo.conductor,
      observaciones: refParaCorreo.observaciones,
    },
  };
}
