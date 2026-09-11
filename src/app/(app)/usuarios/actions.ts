"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRol } from "@/lib/auth";
import { ORDEN_TIPOS_INSPECCION, type RolUsuario } from "@/lib/tipos";

export type UsuarioInput = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string; // "YYYY-MM-DD"
  rol: RolUsuario;
};

export type ResultadoUsuario = { ok: true; aviso?: string };

function validar(input: UsuarioInput) {
  const req: [string, string][] = [
    ["nombre", input.nombre],
    ["apellido", input.apellido],
    ["email", input.email],
    ["fecha de nacimiento", input.fechaNacimiento],
  ];
  for (const [campo, valor] of req) {
    if (!String(valor ?? "").trim())
      throw new Error(`Falta completar "${campo}".`);
  }
  if (input.rol !== "supervisor" && input.rol !== "administrador")
    throw new Error("Rol inválido.");
  // §2.10/§3.1: el teléfono es obligatorio para un supervisor (lo usa el
  // WhatsApp automático y el manual).
  if (input.rol === "supervisor" && !input.telefono.trim())
    throw new Error("El teléfono es obligatorio para un supervisor.");
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
  await requireRol("administrador");
  validar(input);
  const supabase = await createClient();

  const email = input.email.trim().toLowerCase();
  const { data: existente } = await supabase
    .from("personal")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existente) throw new Error("Ya existe un usuario con ese correo.");

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
  if (error) throw new Error(`No se pudo crear el usuario: ${error.message}`);

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
  await requireRol("administrador");
  validar(input);
  const supabase = await createClient();

  // El correo no se edita (es el vínculo con la cuenta de autenticación).
  const { error } = await supabase
    .from("personal")
    .update({
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      telefono: input.telefono.trim() || null,
      fecha_nacimiento: input.fechaNacimiento,
      rol: input.rol,
    })
    .eq("id", input.id);
  if (error) throw new Error(`No se pudo guardar: ${error.message}`);

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
  await requireRol("administrador");
  const validos = new Set<string>(ORDEN_TIPOS_INSPECCION);
  const tipos = [...new Set(input.tipos)].filter((t) => validos.has(t));

  const supabase = await createClient();
  const { error: errDelete } = await supabase
    .from("personal_tipos_inspeccion")
    .delete()
    .eq("personal_id", input.personalId);
  if (errDelete)
    throw new Error(`No se pudieron actualizar los permisos: ${errDelete.message}`);

  if (tipos.length > 0) {
    const { error: errInsert } = await supabase
      .from("personal_tipos_inspeccion")
      .insert(tipos.map((tipo_inspeccion) => ({ personal_id: input.personalId, tipo_inspeccion })));
    if (errInsert)
      throw new Error(`No se pudieron guardar los permisos: ${errInsert.message}`);
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function cambiarActivo(input: {
  id: string;
  activo: boolean;
}): Promise<ResultadoUsuario> {
  const { perfil } = await requireRol("administrador");
  if (!input.activo && input.id === perfil.id)
    throw new Error("No puedes desactivar tu propia cuenta.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("personal")
    .update({ activo: input.activo })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function reenviarInvitacion(input: {
  id: string;
}): Promise<ResultadoUsuario> {
  await requireRol("administrador");
  const supabase = await createClient();

  const { data: u } = await supabase
    .from("personal")
    .select("email, nombre, apellido, rol, telefono, fecha_nacimiento, user_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!u) throw new Error("Usuario no encontrado.");
  if (u.user_id)
    throw new Error("Este usuario ya activó su cuenta; no hay invitación pendiente.");

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
