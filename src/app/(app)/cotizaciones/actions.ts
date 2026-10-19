"use server";

import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreoConPdf } from "@/lib/email";
import { direccionCompleta } from "@/lib/chile";
import { calcularTotales, formatearCLP } from "@/lib/dinero";
import {
  construirCorreoEnvioCotizacion,
  nombreCompleto,
} from "@/lib/mensajes";
import { generarCotizacionPdf } from "@/lib/pdf/generarCotizacionPdf";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";
import type { EstadoCotizacion } from "./estados";

/** Tope de cordura para el neto. No es una regla de negocio, es una red: un
 *  cero de más en un campo de texto no debe salir en un PDF al cliente. */
const NETO_MAXIMO = 999_999_999;

export type EmitirCotizacionInput = {
  id: string;
  valorNeto: number;
  validezDias: number;
  observaciones: string;
};

/**
 * Emite la cotización de una solicitud: arma el PDF, se lo manda por correo
 * al interesado y deja la solicitud en estado `cotizada`.
 *
 * Usa el cliente AUTENTICADO, no el service role: quien hace esto es un
 * administrador con sesión, y la política `cotizaciones_fletes_update`
 * (migración 20261019020000) es la que autoriza. Es lo contrario del
 * formulario público, donde no hay identidad que verificar.
 */
export async function emitirCotizacion(
  input: EmitirCotizacionInput,
): Promise<ResultadoAccion<{ totalFormateado: string }>> {
  const { perfil } = await requireRol("administrador", "administrador_contrato");

  if (!Number.isInteger(input.valorNeto) || input.valorNeto <= 0) {
    return { ok: false, mensaje: "El valor neto tiene que ser mayor que cero." };
  }
  if (input.valorNeto > NETO_MAXIMO) {
    return {
      ok: false,
      mensaje: `El valor neto parece equivocado (${formatearCLP(input.valorNeto)}). Revísalo antes de enviarlo.`,
    };
  }
  if (
    !Number.isInteger(input.validezDias) ||
    input.validezDias <= 0 ||
    input.validezDias > 365
  ) {
    return { ok: false, mensaje: "La validez debe estar entre 1 y 365 días." };
  }

  const supabase = await createClient();

  const { data: solicitud, error: errorLectura } = await supabase
    .from("cotizaciones_fletes")
    .select("*")
    .eq("id", input.id)
    .single();

  if (errorLectura || !solicitud) {
    return errorInesperado("emitirCotizacion.select", errorLectura);
  }

  const observaciones = input.observaciones.trim() || null;
  const emitidaPor = nombreCompleto(perfil.nombre, perfil.apellido);

  // 1. PDF. Si falla acá, no se tocó nada todavía.
  let pdf: Buffer;
  let nombreArchivo: string;
  let valeHasta: Date;
  try {
    const generado = await generarCotizacionPdf({
      solicitud,
      valorNeto: input.valorNeto,
      validezDias: input.validezDias,
      observaciones,
      emitidaPor,
    });
    pdf = generado.pdf;
    nombreArchivo = generado.nombreArchivo;
    valeHasta = generado.valeHasta;
  } catch (err) {
    console.error("[cotizacion] no se pudo generar el PDF", err);
    return {
      ok: false,
      mensaje: "No se pudo generar el PDF de la cotización. Intenta de nuevo.",
    };
  }

  const totales = calcularTotales(input.valorNeto);
  const totalFormateado = formatearCLP(totales.total);

  // 2. Correo al interesado. Si el envío falla, NO se marca como cotizada:
  //    al revés de lo que hace el formulario público (donde la solicitud ya
  //    es un hecho aunque el correo falle), acá el acto ES el envío. Dejarla
  //    en `cotizada` sin que el cliente la haya recibido sería peor que el
  //    error, porque nadie volvería a mirarla.
  try {
    const { asunto, html } = construirCorreoEnvioCotizacion({
      numeroSolicitud: solicitud.numero_solicitud,
      nombre: solicitud.nombre,
      origen: direccionCompleta(
        solicitud.origen_calle,
        solicitud.origen_comuna,
        solicitud.origen_region,
      ),
      destino: direccionCompleta(
        solicitud.destino_calle,
        solicitud.destino_comuna,
        solicitud.destino_region,
      ),
      totalFormateado,
      valeHasta: valeHasta.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      emitidaPor,
    });
    await enviarCorreoConPdf({
      destinatarios: [solicitud.correo],
      asunto,
      cuerpoHtml: html,
      pdf,
      nombreArchivo,
      // Para que responder le llegue a quien la emitió, no a la casilla genérica.
      responderA: perfil.email ?? undefined,
      etiquetaLog: "cotizacion",
    });
  } catch (err) {
    console.error("[cotizacion] el envío del correo falló", err);
    return {
      ok: false,
      mensaje:
        "Se generó la cotización pero no se pudo enviar el correo. La solicitud queda sin marcar para que puedas reintentar.",
    };
  }

  // 3. Recién ahora se registra: el PDF salió y el correo se entregó.
  const ahora = new Date().toISOString();
  const { error: errorUpdate } = await supabase
    .from("cotizaciones_fletes")
    .update({
      estado: "cotizada",
      valor_neto: input.valorNeto,
      validez_dias: input.validezDias,
      observaciones_cotizacion: observaciones,
      cotizada_por: perfil.id,
      cotizada_at: ahora,
      cotizacion_enviada_at: ahora,
    })
    .eq("id", input.id);

  if (errorUpdate) {
    // El cliente YA recibió la cotización; lo que falló es el registro.
    console.error(
      `[cotizacion] 🔴 solicitud ${solicitud.numero_solicitud} ENVIADA al cliente pero no se pudo marcar como cotizada`,
      errorUpdate,
    );
    return {
      ok: false,
      mensaje:
        "La cotización se envió al cliente, pero no se pudo guardar el registro. Avisa a soporte antes de reenviarla.",
    };
  }

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${input.id}`);
  return { ok: true, totalFormateado };
}

/** Marca el desenlace de una solicitud ya cotizada (o la descarta). */
export async function cambiarEstadoCotizacion(input: {
  id: string;
  estado: EstadoCotizacion;
}): Promise<ResultadoAccion> {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const { error } = await supabase
    .from("cotizaciones_fletes")
    .update({ estado: input.estado })
    .eq("id", input.id);

  if (error) return errorInesperado("cambiarEstadoCotizacion", error);

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${input.id}`);
  return { ok: true };
}
