import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { firmarRutas } from "@/lib/storage";
import { nombreCompleto } from "@/lib/mensajes";
import { BUCKET_DOCUMENTOS } from "@/lib/rrhh/documentos";
import { vigenteEn } from "@/lib/rrhh/ficha";
import { horasSemanales, leerDias, type DiaJornada } from "@/lib/rrhh/jornadas";
import { asignacionDelDia } from "@/lib/rrhh/turnos";

type Cliente = SupabaseClient<Database>;

/**
 * Todo lo de UN trabajador que muestran la ficha (/rrhh/[id]) y "Mis datos"
 * (/mis-datos). Una sola consulta por tabla, con la RLS de quien pide: el
 * trabajador solo recibe lo suyo aunque llame con otro id.
 */
export async function cargarFichaCompleta(supabase: Cliente, personalId: string, hoy: string) {
  const [persona, ficha, historial, asignaciones, cambiosJornada, documentos, ruts, contactos] = await Promise.all([
    supabase
      .from("personal")
      .select("id, nombre, apellido, email, telefono, fecha_nacimiento, rol, activo, created_at")
      .eq("id", personalId)
      .maybeSingle(),
    supabase
      .from("rrhh_fichas")
      .select("*, cargo:rrhh_cargos(nombre), faena:rrhh_faenas(nombre)")
      .eq("personal_id", personalId)
      .maybeSingle(),
    supabase
      .from("rrhh_historial_sueldo")
      .select("*")
      .eq("personal_id", personalId)
      .order("created_at", { ascending: false }),
    supabase
      .from("rrhh_jornada_trabajador")
      .select("id, personal_id, jornada_id, vigente_desde, vigente_hasta, anulada_en, created_at, jornada:rrhh_jornadas(id, nombre, dias)")
      .eq("personal_id", personalId)
      .order("vigente_desde", { ascending: false })
      .order("created_at", { ascending: false }),
    // Rastro de cada asignación (alta, correcciones, anulación): quién y cuándo.
    supabase
      .from("rrhh_jornada_trabajador_cambios")
      .select("id, asignacion_id, accion, vigente_desde, vigente_hasta, motivo, hecho_por, hecho_en")
      .eq("personal_id", personalId)
      .order("hecho_en", { ascending: true }),
    supabase
      .from("rrhh_documentos")
      .select("id, nombre_archivo, ruta, tamano_bytes, created_at, tipo:rrhh_tipos_documento(nombre)")
      .eq("personal_id", personalId)
      .order("created_at", { ascending: false }),
    // El RUT no se lee con un select de personal (grants por columna): esta
    // función aplica la misma regla de lectura que las tablas rrhh_*.
    supabase.rpc("rrhh_ruts"),
    // Dato de un tercero: tampoco se lee con un select de personal.
    supabase.rpc("rrhh_contactos_emergencia"),
  ]);

  // Autor de cada cambio de sueldo (§16.3). El trabajador en "Mis datos" no
  // puede leer la fila del administrador (RLS de personal): ve "—".
  const autores = [
    ...new Set(
      [...(historial.data ?? []).map((h) => h.created_by), ...(cambiosJornada.data ?? []).map((c) => c.hecho_por)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const { data: nombresAutores } = autores.length
    ? await supabase.from("personal").select("id, nombre, apellido").in("id", autores)
    : { data: [] };
  const autorDe = new Map((nombresAutores ?? []).map((p) => [p.id, nombreCompleto(p.nombre, p.apellido)]));

  // La vista devuelve todo como nullable; las filas reales siempre traen
  // estos campos (vienen de columnas not null).
  const remuneraciones = (historial.data ?? []).map((h) => ({
    autor: (h.created_by && autorDe.get(h.created_by)) || null,
    id: h.id!,
    vigente_desde: h.vigente_desde!,
    created_at: h.created_at!,
    comentario: h.comentario,
    liquido_pactado: h.liquido_pactado!,
    colacion: h.colacion!,
    movilizacion: h.movilizacion!,
    liquido_pactado_anterior: h.liquido_pactado_anterior,
    colacion_anterior: h.colacion_anterior,
    movilizacion_anterior: h.movilizacion_anterior,
  }));

  const jornadas = (asignaciones.data ?? []).map((a) => {
    const dias: DiaJornada[] = (a.jornada && leerDias(a.jornada.dias)) || [];
    return {
      id: a.id,
      personal_id: a.personal_id,
      jornada_id: a.jornada_id,
      vigente_desde: a.vigente_desde,
      vigente_hasta: a.vigente_hasta,
      anulada_en: a.anulada_en,
      created_at: a.created_at,
      nombre: a.jornada?.nombre ?? "—",
      dias,
      horas: horasSemanales(dias),
      cambios: (cambiosJornada.data ?? [])
        .filter((c) => c.asignacion_id === a.id)
        .map((c) => ({
          id: c.id,
          accion: c.accion,
          vigente_desde: c.vigente_desde,
          vigente_hasta: c.vigente_hasta,
          motivo: c.motivo,
          hecho_en: c.hecho_en,
          autor: (c.hecho_por && autorDe.get(c.hecho_por)) || null,
        })),
    };
  });
  const contacto = (contactos.data ?? []).find((c) => c.personal_id === personalId) ?? null;

  const urls = await firmarRutas(
    supabase,
    BUCKET_DOCUMENTOS,
    (documentos.data ?? []).map((d) => d.ruta),
  );

  return {
    persona: persona.data,
    rut: (ruts.data ?? []).find((r) => r.personal_id === personalId)?.rut ?? null,
    ficha: ficha.data,
    remuneraciones,
    remuneracionVigente: vigenteEn(remuneraciones, hoy),
    jornadas,
    jornadaVigente: asignacionDelDia(jornadas, hoy),
    contactoEmergencia: contacto && { nombre: contacto.nombre, telefono: contacto.telefono, relacion: contacto.relacion },
    documentos: (documentos.data ?? []).map((d) => ({
      id: d.id,
      nombre: d.nombre_archivo,
      tipo: d.tipo?.nombre ?? "—",
      tamano: d.tamano_bytes,
      fecha: d.created_at,
      url: urls[d.ruta] ?? null,
    })),
  };
}

export type FichaCompleta = Awaited<ReturnType<typeof cargarFichaCompleta>>;
