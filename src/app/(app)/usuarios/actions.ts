"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRol } from "@/lib/auth";
import { ORDEN_TIPOS_INSPECCION, type RolUsuario } from "@/lib/tipos";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

export type UsuarioInput = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string; // "YYYY-MM-DD"
  rol: RolUsuario;
};

export type ResultadoUsuario = ResultadoAccion<{ aviso?: string }>;

/**
 * Un WITH CHECK de RLS violado (código Postgres 42501, "new row violates
 * row-level security policy") es un fallo de PERMISOS, no de infraestructura
 * — a diferencia de un USING que no matchea ninguna fila (eso es éxito
 * silencioso con cero filas, ver el comentario en editarUsuario/cambiarActivo
 * más abajo), un WITH CHECK que rechaza la fila NUEVA sí llega como error
 * real de Postgres. Pasa, por ejemplo, cuando administrador_contrato edita a
 * un supervisor (visible por USING) pero intenta dejarlo con
 * rol = 'administrador' (rechazado por WITH CHECK). El mensaje genérico
 * (MENSAJE_ERROR_GENERICO, "Intenta de nuevo...") es engañoso acá: reintentar
 * no cambia nada, es un permiso que nunca se va a dar.
 */
function esViolacionRLS(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42501";
}

/**
 * Cuando un UPDATE gobernado por RLS afecta cero filas sin error de
 * Postgres, hay dos causas indistinguibles a simple vista: (a) el USING de
 * la política no dejó ver la fila — un rechazo de permiso real, por
 * ejemplo administrador_contrato intentando tocar una fila que ya es
 * administrador — o (b) la fila ya no existe (alguien la borró mientras
 * tanto). Se distinguen consultando si el id todavía existe: la política
 * de SELECT sobre personal es incondicional (auth_read_personal,
 * qual = true, verificado contra la base), así que esta consulta no
 * depende del mismo permiso que acaba de fallar en el UPDATE.
 */
async function mensajeUpdateSinFilas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<{ ok: false; mensaje: string }> {
  const { data: existe } = await supabase
    .from("personal")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existe) return { ok: false, mensaje: "Este usuario ya no existe." };
  return {
    ok: false,
    mensaje: "No tienes permiso para modificar a este usuario.",
  };
}

function validar(input: UsuarioInput): ResultadoAccion {
  const req: [string, string][] = [
    ["nombre", input.nombre],
    ["apellido", input.apellido],
    ["email", input.email],
    ["fecha de nacimiento", input.fechaNacimiento],
  ];
  for (const [campo, valor] of req) {
    if (!String(valor ?? "").trim())
      return { ok: false, mensaje: `Falta completar "${campo}".` };
  }
  if (
    input.rol !== "supervisor" &&
    input.rol !== "administrador" &&
    input.rol !== "administrador_contrato"
  )
    return { ok: false, mensaje: "Rol inválido." };
  // §2.10/§3.1: el teléfono es obligatorio para un supervisor (lo usa el
  // WhatsApp automático y el manual).
  if (input.rol === "supervisor" && !input.telefono.trim())
    return { ok: false, mensaje: "El teléfono es obligatorio para un supervisor." };
  return { ok: true };
}

/** Envía (o reenvía) la invitación de Supabase Auth. Best-effort. */
async function invitar(input: {
  email: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  telefono: string;
  fechaNacimiento: string;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: {
        nombre: input.nombre,
        apellido: input.apellido,
        rol: input.rol,
        telefono: input.telefono,
        fecha_nacimiento: input.fechaNacimiento,
      },
    });
    if (error) {
      if (/already been registered|already registered/i.test(error.message))
        return "Ese correo ya tenía una cuenta de autenticación; no hizo falta invitarlo de nuevo.";
      return `No se pudo enviar la invitación por correo (${error.message}). La persona igual puede activar su cuenta en la página "Activar cuenta" con este correo.`;
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    return `No se pudo enviar la invitación automática (${msg}). La persona igual puede activar su cuenta en la página "Activar cuenta" con este correo.`;
  }
}

export async function agregarUsuario(
  input: UsuarioInput,
): Promise<ResultadoUsuario> {
  await requireRol("administrador", "administrador_contrato");
  const val = validar(input);
  if (!val.ok) return val;
  const supabase = await createClient();

  const email = input.email.trim().toLowerCase();
  const { data: existente } = await supabase
    .from("personal")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existente)
    return { ok: false, mensaje: "Ya existe un usuario con ese correo." };

  const { error } = await supabase.from("personal").insert({
    nombre: input.nombre.trim(),
    apellido: input.apellido.trim(),
    email,
    telefono: input.telefono.trim() || null,
    fecha_nacimiento: input.fechaNacimiento,
    rol: input.rol,
    activo: true,
    user_id: null,
  });
  if (error) {
    if (esViolacionRLS(error))
      return { ok: false, mensaje: "No tienes permiso para crear un usuario con ese rol." };
    return errorInesperado("agregarUsuario.insert", error);
  }

  const aviso = await invitar({
    email,
    nombre: input.nombre.trim(),
    apellido: input.apellido.trim(),
    rol: input.rol,
    telefono: input.telefono.trim(),
    fechaNacimiento: input.fechaNacimiento,
  });

  revalidatePath("/usuarios");
  return aviso ? { ok: true, aviso } : { ok: true };
}

export async function editarUsuario(
  input: UsuarioInput & { id: string },
): Promise<ResultadoUsuario> {
  await requireRol("administrador", "administrador_contrato");
  const val = validar(input);
  if (!val.ok) return val;
  const supabase = await createClient();

  // El correo no se edita (es el vínculo con la cuenta de autenticación).
  //
  // "Ni tocar esas filas" (administrador_contrato sobre una fila
  // administrador) y "no puede dejar una fila como administrador" se
  // validan en la RLS de personal_update (migración 20260917030000: USING
  // sobre la fila vieja, WITH CHECK sobre la fila nueva), no acá — por eso
  // hace falta el .select().maybeSingle(): un update bloqueado por RLS no
  // es un error de Postgres, es éxito con cero filas — sin este chequeo la
  // función diría "ok" sin haber cambiado nada.
  const { data: actualizado, error } = await supabase
    .from("personal")
    .update({
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      telefono: input.telefono.trim() || null,
      fecha_nacimiento: input.fechaNacimiento,
      rol: input.rol,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (esViolacionRLS(error))
      return {
        ok: false,
        mensaje: "No tienes permiso para dejar a este usuario con ese rol.",
      };
    return errorInesperado("editarUsuario.update", error);
  }
  if (!actualizado) return await mensajeUpdateSinFilas(supabase, input.id);

  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Fase "tipos de inspección" — parte 4/4. Reemplaza por completo el conjunto
 * de tipos permitidos de un supervisor (borra y vuelve a insertar — la tabla
 * es chica y esto es una acción de administrador, no un flujo de alto
 * tráfico). `tipos = []` dejando la fila vacía es un estado VÁLIDO A
 * PROPÓSITO — no "sin restricción": un supervisor sin ninguna fila no puede
 * realizar ni ver NINGUNA inspección (la ausencia de permiso es ausencia de
 * acceso, ver el comentario de la migración). Sirve para suspender a un
 * supervisor sin desactivarle la cuenta.
 */
export async function actualizarTiposInspeccion(input: {
  personalId: string;
  tipos: string[];
}): Promise<ResultadoUsuario> {
  await requireRol("administrador", "administrador_contrato");
  const validos = new Set<string>(ORDEN_TIPOS_INSPECCION);
  const tipos = [...new Set(input.tipos)].filter((t) => validos.has(t));

  const supabase = await createClient();
  const { error: errDelete } = await supabase
    .from("personal_tipos_inspeccion")
    .delete()
    .eq("personal_id", input.personalId);
  if (errDelete)
    return errorInesperado("actualizarTiposInspeccion.delete", errDelete);

  if (tipos.length > 0) {
    const { error: errInsert } = await supabase
      .from("personal_tipos_inspeccion")
      .insert(tipos.map((tipo_inspeccion) => ({ personal_id: input.personalId, tipo_inspeccion })));
    if (errInsert)
      return errorInesperado("actualizarTiposInspeccion.insert", errInsert);
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function cambiarActivo(input: {
  id: string;
  activo: boolean;
}): Promise<ResultadoUsuario> {
  const { perfil } = await requireRol("administrador", "administrador_contrato");
  if (!input.activo && input.id === perfil.id)
    return { ok: false, mensaje: "No puedes desactivar tu propia cuenta." };

  const supabase = await createClient();
  // "Ni tocar esas filas" (administrador_contrato sobre una fila
  // administrador) no se valida acá — lo hace la RLS de personal_update
  // (migración 20260917030000, USING con rol <> 'administrador' para este
  // rol). Por eso hace falta el .select().maybeSingle(): si la RLS bloquea
  // el update, Postgres/PostgREST no devuelve error, devuelve éxito con
  // cero filas afectadas — sin este chequeo, la función diría "ok" sin
  // haber cambiado nada.
  const { data: actualizado, error } = await supabase
    .from("personal")
    .update({ activo: input.activo })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return errorInesperado("cambiarActivo.update", error);
  if (!actualizado) return await mensajeUpdateSinFilas(supabase, input.id);

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function reenviarInvitacion(input: {
  id: string;
}): Promise<ResultadoUsuario> {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const { data: u } = await supabase
    .from("personal")
    .select("email, nombre, apellido, rol, telefono, fecha_nacimiento, user_id, activo")
    .eq("id", input.id)
    .maybeSingle();
  if (!u) return { ok: false, mensaje: "Usuario no encontrado." };
  if (u.user_id)
    return {
      ok: false,
      mensaje: "Este usuario ya activó su cuenta; no hay invitación pendiente.",
    };
  // handle_new_user() (migración 20260918010000) exige activo = true para
  // vincular una cuenta nueva — reenviar el correo sobre una fila desactivada
  // sería una acción que nunca puede terminar bien: el correo sale, pero al
  // completar el registro el trigger rechaza el alta.
  if (!u.activo)
    return {
      ok: false,
      mensaje:
        "Este usuario está desactivado; reactívalo antes de reenviar la invitación.",
    };

  const aviso = await invitar({
    email: u.email ?? "",
    nombre: u.nombre,
    apellido: u.apellido ?? "",
    rol: u.rol,
    telefono: u.telefono ?? "",
    fechaNacimiento: u.fecha_nacimiento ?? "",
  });

  revalidatePath("/usuarios");
  return aviso ? { ok: true, aviso } : { ok: true };
}
