"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { enviarCorreoHtml } from "@/lib/email";
import {
  construirAcuseCotizacion,
  construirCorreoCotizacion,
  type DatosCotizacion,
} from "@/lib/mensajes";
import { normalizarRut, rutValido } from "@/lib/rut";
import { enlaceTel, enlaceWhatsApp, normalizarTelefonoCl } from "@/lib/telefono";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Destinatario interno de las solicitudes de cotización. Es una casilla fija
 * de la empresa, no un dato que configure un usuario — por eso va como
 * variable de entorno con default, y no en la tabla `destinatarios_correo`
 * (esa es para la distribución de informes de inspección, otra cosa).
 */
const CORREO_COTIZACIONES =
  process.env.CORREO_COTIZACIONES || "jaime.moreno@cordilleramyp.cl";

/** Cuántas solicitudes admite una misma IP dentro de la ventana. */
const LIMITE_POR_IP = 5;
const VENTANA_MINUTOS = 60;

/** Topes de largo. Un endpoint público sin tope es una invitación a llenarnos
 *  la tabla con un solo POST. */
const MAX_CORTO = 120;
const MAX_LARGO = 400;
const MAX_COMENTARIOS = 2000;

export type EntradaCotizacion = {
  tipoSolicitante: "particular" | "empresa";
  nombre: string;
  apellido: string;
  rut: string;
  correo: string;
  telefono: string;
  tieneWhatsapp: boolean;
  razonSocial: string;
  rutEmpresa: string;
  giro: string;
  direccionComercial: string;
  origen: string;
  destino: string;
  tipoCarga: string;
  peso: string;
  /** "YYYY-MM-DD" */
  fechaEstimada: string;
  /** `null` = no respondió; es obligatorio, así que se rechaza. */
  requiereEncarpe: boolean | null;
  comentarios: string;
  /**
   * Honeypot: un campo que la persona no ve y por lo tanto nunca completa.
   * Si viene con algo, es un bot que rellenó todos los inputs del formulario.
   */
  sitioWeb: string;
};

/**
 * Correo "suficientemente bien formado". A propósito no intenta ser la
 * gramática completa de RFC 5322 (ninguna regex razonable lo es): lo que
 * realmente confirma que un correo existe es que llegue el acuse de recibo.
 * Esto solo descarta lo que claramente no es una dirección.
 */
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function limpiar(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * La fila tal como la espera la tabla. Tipada contra el esquema generado (no
 * `Record<string, unknown>`) a propósito: así, si mañana alguien agrega una
 * columna `not null` o renombra una, esto no compila — en vez de fallar
 * recién en runtime, con una solicitud real de un cliente de por medio.
 */
type FilaCotizacion =
  Database["public"]["Tables"]["cotizaciones_fletes"]["Insert"];

/** Valida y normaliza. Devuelve el mensaje del primer problema, o los datos
 *  listos para guardar. La MISMA validación corre en el cliente para avisar
 *  antes de enviar — esta es la que manda, porque la otra se salta con curl. */
function validar(
  e: EntradaCotizacion,
):
  | { ok: false; mensaje: string }
  | { ok: true; fila: FilaCotizacion } {
  const esEmpresa = e.tipoSolicitante === "empresa";
  if (e.tipoSolicitante !== "particular" && !esEmpresa) {
    return { ok: false, mensaje: "Indica si eres particular o empresa." };
  }

  const nombre = limpiar(e.nombre);
  const apellido = limpiar(e.apellido);
  const correo = limpiar(e.correo).toLowerCase();
  const rut = normalizarRut(limpiar(e.rut));

  if (!nombre) return { ok: false, mensaje: "Falta el nombre." };
  if (!apellido) return { ok: false, mensaje: "Falta el apellido." };
  if (!rutValido(rut)) return { ok: false, mensaje: "El RUT no es válido." };
  if (!CORREO_RE.test(correo)) {
    return { ok: false, mensaje: "El correo no es válido." };
  }

  const telefono = normalizarTelefonoCl(limpiar(e.telefono));
  if (!telefono) {
    return {
      ok: false,
      mensaje: "El teléfono no es válido. Ejemplo: +56 9 1234 5678.",
    };
  }

  const origen = limpiar(e.origen);
  const destino = limpiar(e.destino);
  const tipoCarga = limpiar(e.tipoCarga);
  const peso = limpiar(e.peso);

  if (!origen) return { ok: false, mensaje: "Falta la dirección de origen." };
  if (!destino) return { ok: false, mensaje: "Falta la dirección de destino." };
  if (!tipoCarga) return { ok: false, mensaje: "Falta el tipo de carga." };
  if (!peso) return { ok: false, mensaje: "Falta el peso o tonelaje." };

  if (e.requiereEncarpe !== true && e.requiereEncarpe !== false) {
    return { ok: false, mensaje: "Indica si la carga requiere encarpe." };
  }

  // Fecha: válida y no anterior a hoy. Se compara por string YYYY-MM-DD para
  // no arrastrar la zona horaria del servidor (que no es la de Chile).
  const fechaEstimada = limpiar(e.fechaEstimada);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEstimada)) {
    return { ok: false, mensaje: "Falta la fecha estimada." };
  }
  const hoyCL = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  if (fechaEstimada < hoyCL) {
    return { ok: false, mensaje: "La fecha estimada no puede ser anterior a hoy." };
  }

  let razonSocial: string | null = null;
  let rutEmpresa: string | null = null;
  let giro: string | null = null;
  let direccionComercial: string | null = null;

  if (esEmpresa) {
    razonSocial = limpiar(e.razonSocial);
    rutEmpresa = normalizarRut(limpiar(e.rutEmpresa));
    giro = limpiar(e.giro);
    direccionComercial = limpiar(e.direccionComercial);

    if (!razonSocial) return { ok: false, mensaje: "Falta la razón social." };
    if (!rutValido(rutEmpresa)) {
      return { ok: false, mensaje: "El RUT de la empresa no es válido." };
    }
    if (!giro) return { ok: false, mensaje: "Falta el giro." };
    if (!direccionComercial) {
      return { ok: false, mensaje: "Falta la dirección comercial." };
    }
  }

  const comentarios = limpiar(e.comentarios);

  // Topes de largo, al final: así el mensaje que ve la persona es el del
  // campo que de verdad le falta, no un "muy largo" de otro campo.
  const topes: [string, string, number][] = [
    ["nombre", nombre, MAX_CORTO],
    ["apellido", apellido, MAX_CORTO],
    ["correo", correo, MAX_CORTO],
    ["tipo de carga", tipoCarga, MAX_CORTO],
    ["peso", peso, MAX_CORTO],
    ["origen", origen, MAX_LARGO],
    ["destino", destino, MAX_LARGO],
    ["razón social", razonSocial ?? "", MAX_CORTO],
    ["giro", giro ?? "", MAX_CORTO],
    ["dirección comercial", direccionComercial ?? "", MAX_LARGO],
    ["comentarios", comentarios, MAX_COMENTARIOS],
  ];
  for (const [etiqueta, valor, tope] of topes) {
    if (valor.length > tope) {
      return {
        ok: false,
        mensaje: `El campo "${etiqueta}" es demasiado largo (máximo ${tope} caracteres).`,
      };
    }
  }

  return {
    ok: true,
    fila: {
      tipo_solicitante: e.tipoSolicitante,
      nombre,
      apellido,
      rut,
      correo,
      telefono,
      tiene_whatsapp: e.tieneWhatsapp === true,
      razon_social: razonSocial,
      rut_empresa: rutEmpresa,
      giro,
      direccion_comercial: direccionComercial,
      origen,
      destino,
      tipo_carga: tipoCarga,
      peso,
      fecha_estimada: fechaEstimada,
      requiere_encarpe: e.requiereEncarpe,
      comentarios: comentarios || null,
    },
  };
}

/** IP del visitante según las cabeceras del proxy (Vercel pone x-forwarded-for).
 *  Solo se usa para el límite de envíos. */
async function ipDelVisitante(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  // x-forwarded-for puede traer varias IPs: la primera es el cliente.
  const ip = xff?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip || null;
}

export async function enviarSolicitudCotizacion(
  entrada: EntradaCotizacion,
): Promise<ResultadoAccion<{ numeroSolicitud: number }>> {
  // 1. Honeypot. Se responde como si hubiera salido bien, a propósito: un bot
  //    al que se le dice "te detectamos" prueba otra cosa; uno que cree que
  //    funcionó, no. El número 0 no corresponde a ninguna fila real.
  if (limpiar(entrada.sitioWeb)) {
    console.warn("[cotizacion] honeypot activado, solicitud descartada");
    return { ok: true, numeroSolicitud: 0 };
  }

  const validacion = validar(entrada);
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje };

  const supabase = createAdminClient();
  const ip = await ipDelVisitante();

  // 2. Límite por IP. Si la consulta del límite falla, NO se bloquea el envío:
  //    perder una solicitud real por un problema nuestro es peor que dejar
  //    pasar una de más.
  if (ip) {
    const desde = new Date(
      Date.now() - VENTANA_MINUTOS * 60 * 1000,
    ).toISOString();
    const { count, error } = await supabase
      .from("cotizaciones_fletes")
      .select("id", { count: "exact", head: true })
      .eq("ip_solicitante", ip)
      .gte("created_at", desde);

    if (error) {
      console.error("[cotizacion] no se pudo verificar el límite por IP", error);
    } else if ((count ?? 0) >= LIMITE_POR_IP) {
      return {
        ok: false,
        mensaje:
          "Ya enviaste varias solicitudes en la última hora. Si necesitas corregir algo, responde el correo que te llegó.",
      };
    }
  }

  // 3. Guardar PRIMERO, mandar correos después. Si el SMTP falla, la
  //    solicitud igual queda registrada y se puede recuperar — al revés, un
  //    correo enviado sobre una fila que no se guardó no deja rastro.
  const { data, error } = await supabase
    .from("cotizaciones_fletes")
    .insert({ ...validacion.fila, ip_solicitante: ip })
    .select("numero_solicitud")
    .single();

  if (error || !data) {
    return errorInesperado("cotizacion.insert", error);
  }

  const numeroSolicitud = data.numero_solicitud;
  const f = validacion.fila;
  const datos: DatosCotizacion = {
    numeroSolicitud,
    tipoSolicitante: f.tipo_solicitante,
    nombre: f.nombre,
    apellido: f.apellido,
    rut: f.rut,
    correo: f.correo,
    telefono: f.telefono,
    // Las columnas con default en la base llegan opcionales en el tipo
    // Insert, así que acá se resuelven al mismo valor que pondría Postgres.
    tieneWhatsapp: f.tiene_whatsapp ?? false,
    razonSocial: f.razon_social ?? null,
    rutEmpresa: f.rut_empresa ?? null,
    giro: f.giro ?? null,
    direccionComercial: f.direccion_comercial ?? null,
    origen: f.origen,
    destino: f.destino,
    tipoCarga: f.tipo_carga,
    peso: f.peso,
    fechaEstimada: f.fecha_estimada,
    requiereEncarpe: f.requiere_encarpe,
    comentarios: f.comentarios ?? null,
  };

  // 4. Correo interno. Un fallo acá NO se le muestra al interesado: su
  //    solicitud sí se recibió. Queda el log y la bandera en false para
  //    poder encontrar las que no avisaron.
  const textoWhatsApp = `Hola ${datos.nombre}, le escribimos de Cordillera M&P por su solicitud de cotización N° ${numeroSolicitud}.`;
  try {
    const { asunto, html } = construirCorreoCotizacion(datos, {
      tel: enlaceTel(datos.telefono),
      whatsapp: datos.tieneWhatsapp
        ? enlaceWhatsApp(datos.telefono, textoWhatsApp)
        : null,
    });
    await enviarCorreoHtml({
      destinatarios: [CORREO_COTIZACIONES],
      asunto,
      cuerpoHtml: html,
    });
    await supabase
      .from("cotizaciones_fletes")
      .update({ correo_interno_enviado: true })
      .eq("numero_solicitud", numeroSolicitud);
  } catch (err) {
    console.error(
      `[cotizacion] 🔴 solicitud ${numeroSolicitud} GUARDADA pero el correo a ${CORREO_COTIZACIONES} falló — revisar cotizaciones_fletes where correo_interno_enviado = false`,
      err,
    );
  }

  // 5. Acuse de recibo al interesado. También aislado: que no le llegue el
  //    acuse no invalida la solicitud ni debe mostrarle un error.
  try {
    const { asunto, html } = construirAcuseCotizacion(datos);
    await enviarCorreoHtml({
      destinatarios: [datos.correo],
      asunto,
      cuerpoHtml: html,
    });
    await supabase
      .from("cotizaciones_fletes")
      .update({ acuse_enviado: true })
      .eq("numero_solicitud", numeroSolicitud);
  } catch (err) {
    console.error(
      `[cotizacion] acuse de recibo de la solicitud ${numeroSolicitud} no se pudo enviar`,
      err,
    );
  }

  return { ok: true, numeroSolicitud };
}
