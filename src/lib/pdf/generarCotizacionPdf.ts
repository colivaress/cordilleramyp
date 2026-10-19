import { renderToBuffer } from "@react-pdf/renderer";
import type { Database } from "@/lib/supabase/database.types";
import { direccionCompleta } from "@/lib/chile";
import { fechaValidez } from "@/lib/dinero";
import { nombreCompleto } from "@/lib/mensajes";
import { formatearRut } from "@/lib/rut";
import { formatearTelefonoCl } from "@/lib/telefono";
import { logoDataUri } from "./logo";
import { CotizacionPDF, type CotizacionPDFDatos } from "./CotizacionPDF";

type Solicitud =
  Database["public"]["Tables"]["cotizaciones_fletes"]["Row"];

const fmtFecha = (v: Date) =>
  v.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Una columna `date` ("YYYY-MM-DD") al medio del día, para que la zona
 *  horaria del servidor no la corra un día hacia atrás al formatearla. */
const fechaDeColumna = (v: string) => new Date(`${v.slice(0, 10)}T12:00:00`);

export async function generarCotizacionPdf(opts: {
  solicitud: Solicitud;
  valorNeto: number;
  validezDias: number;
  observaciones: string | null;
  emitidaPor: string;
  /** Momento de emisión; se inyecta para poder fijarlo en una prueba. */
  emitidaEl?: Date;
}): Promise<{ pdf: Buffer; nombreArchivo: string; valeHasta: Date }> {
  const { solicitud: s } = opts;
  const emision = opts.emitidaEl ?? new Date();
  const valeHasta = fechaValidez(emision, opts.validezDias);

  const datos: CotizacionPDFDatos = {
    numeroSolicitud: s.numero_solicitud,
    logoDataUri: await logoDataUri(),
    emitidoEl: fmtFecha(emision),
    valeHasta: fmtFecha(valeHasta),

    cliente: nombreCompleto(s.nombre, s.apellido),
    rut: formatearRut(s.rut),
    correo: s.correo,
    telefono: formatearTelefonoCl(s.telefono),
    razonSocial: s.razon_social,
    giro: s.giro,
    direccionComercial: s.direccion_comercial,

    origen: direccionCompleta(s.origen_calle, s.origen_comuna, s.origen_region),
    destino: direccionCompleta(
      s.destino_calle,
      s.destino_comuna,
      s.destino_region,
    ),
    tipoCarga: s.tipo_carga,
    peso: s.peso,
    fechaEstimada: fmtFecha(fechaDeColumna(s.fecha_estimada)),
    requiereEncarpe: s.requiere_encarpe,

    valorNeto: opts.valorNeto,
    observaciones: opts.observaciones,
    emitidaPor: opts.emitidaPor,
  };

  const pdf = await renderToBuffer(CotizacionPDF({ datos }));
  return {
    pdf,
    nombreArchivo: `Cotizacion-${s.numero_solicitud}.pdf`,
    valeHasta,
  };
}
