"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { leerCuenta, rechazoPorCampo, type FormularioCuenta } from "@/lib/rrhh/cuenta";
import { invitar } from "@/lib/invitacion";
import { errorInesperado, type ResultadoAccion } from "@/lib/resultado-accion";

/**
 * Sección "Cuenta y acceso" de la ficha (antes /usuarios). Todas entran con
 * requireModuloRrhh (administrador y adm. de contrato), pero eso NO decide
 * qué campos se pueden cambiar: rol y tipos de inspección los autoriza
 * rechazoPorCampo() contra lo guardado, y la base lo repite (personal_insert,
 * trigger personal_rol_solo_admin, políticas pti_*).
 */

type Errores = { ok: false; mensaje: string; errores: string[] };
export type ResultadoCuenta = ResultadoAccion<{ aviso?: string }> | Errores;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDO = { ok: false as const, mensaje: "Persona no válida." };
const REVISA = "Revisa los datos marcados antes de guardar.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidar(personalId?: string) {
  revalidatePath("/rrhh");
  if (personalId) revalidatePath(`/rrhh/${personalId}`);
}

/** Un WITH CHECK de RLS violado (42501) o el trigger del rol: permiso, no
 *  infraestructura — reintentar no cambia nada. */
function esPermiso(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42501";
}

async function tiposDe(supabase: Supabase, personalId: string): Promise<string[]> {
  const { data } = await supabase
    .from("personal_tipos_inspeccion")
    .select("tipo_inspeccion")
    .eq("personal_id", personalId);
  return (data ?? []).map((t) => t.tipo_inspeccion);
}

/**
 * Reemplaza por completo los tipos de un supervisor (borra y vuelve a
 * insertar — la tabla es chica). `tipos = []` es un estado VÁLIDO A
 * PROPÓSITO: sin ningún tipo, el supervisor no puede realizar ni ver
 * ninguna inspección. Sirve para suspenderlo sin desactivarle la cuenta.
 */
async function reemplazarTipos(supabase: Supabase, personalId: string, tipos: string[]) {
  const { error: errDelete } = await supabase
    .from("personal_tipos_inspeccion")
    .delete()
    .eq("personal_id", personalId);
  if (errDelete) return errDelete;
  if (tipos.length === 0) return null;
  const { error } = await supabase
    .from("personal_tipos_inspeccion")
    .insert(tipos.map((tipo_inspeccion) => ({ personal_id: personalId, tipo_inspeccion })));
  return error;
}

export async function crearPersona(
  formulario: FormularioCuenta,
): Promise<ResultadoAccion<{ id: string; aviso?: string }> | Errores> {
  const { perfil } = await requireModuloRrhh();
  const r = leerCuenta(formulario, { creando: true });
  if (!r.ok) return { ok: false, mensaje: REVISA, errores: r.errores };
  const c = r.valor;
  const rechazo = rechazoPorCampo({
    actor: perfil.rol,
    creando: true,
    rolActual: null,
    rolNuevo: c.rol,
    tiposActuales: [],
    tiposNuevos: c.tiposInspeccion,
  });
  if (rechazo) return { ok: false, mensaje: rechazo };

  const supabase = await createClient();
  const { data: existente } = await supabase.from("personal").select("id").ilike("email", c.email).maybeSingle();
  if (existente) return { ok: false, mensaje: "Ya existe una persona con ese correo." };

  // Una fila con user_id nulo ES la invitación: handle_new_user() la vincula
  // cuando la persona activa su cuenta.
  const { data: creada, error } = await supabase
    .from("personal")
    .insert({
      nombre: c.nombre,
      apellido: c.apellido,
      rut: c.rut,
      email: c.email,
      telefono: c.telefono,
      fecha_nacimiento: c.fecha_nacimiento,
      rol: c.rol,
      activo: true,
      user_id: null,
    })
    .select("id")
    .single();
  if (error) {
    if (esPermiso(error)) return { ok: false, mensaje: "No tienes permiso para crear una persona con ese rol." };
    if (error.code === "23505") return { ok: false, mensaje: "Ese RUT ya está registrado para otra persona." };
    return errorInesperado("crearPersona.insert", error);
  }

  if (c.rol === "supervisor" && c.tiposInspeccion.length > 0) {
    const errTipos = await reemplazarTipos(supabase, creada.id, c.tiposInspeccion);
    if (errTipos) return errorInesperado("crearPersona.tipos", errTipos);
  }

  const aviso = await invitar({
    email: c.email,
    nombre: c.nombre,
    apellido: c.apellido,
    rol: c.rol,
    telefono: c.telefono ?? "",
    fechaNacimiento: c.fecha_nacimiento,
  });
  revalidar();
  return aviso ? { ok: true, id: creada.id, aviso } : { ok: true, id: creada.id };
}

export async function guardarCuenta(personalId: string, formulario: FormularioCuenta): Promise<ResultadoCuenta> {
  const { perfil } = await requireModuloRrhh();
  if (!UUID.test(personalId)) return NO_VALIDO;
  const r = leerCuenta(formulario, { creando: false });
  if (!r.ok) return { ok: false, mensaje: REVISA, errores: r.errores };
  const c = r.valor;

  const supabase = await createClient();
  const [{ data: actual }, tiposActuales] = await Promise.all([
    supabase.from("personal").select("rol").eq("id", personalId).maybeSingle(),
    tiposDe(supabase, personalId),
  ]);
  if (!actual) return { ok: false, mensaje: "Esta persona ya no existe." };

  const rechazo = rechazoPorCampo({
    actor: perfil.rol,
    creando: false,
    rolActual: actual.rol,
    rolNuevo: c.rol,
    tiposActuales,
    tiposNuevos: c.tiposInspeccion,
  });
  if (rechazo) return { ok: false, mensaje: rechazo };

  // El correo no se edita: es el vínculo con la cuenta de autenticación.
  // El rol solo viaja si cambió (y para entonces ya se comprobó que quien
  // llama es administrador; el trigger de la base lo vuelve a exigir).
  const { data: actualizado, error } = await supabase
    .from("personal")
    .update({
      nombre: c.nombre,
      apellido: c.apellido,
      rut: c.rut,
      telefono: c.telefono,
      fecha_nacimiento: c.fecha_nacimiento,
      ...(c.rol !== actual.rol ? { rol: c.rol } : {}),
    })
    .eq("id", personalId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (esPermiso(error)) return { ok: false, mensaje: "No tienes permiso para dejar a esta persona con ese rol." };
    if (error.code === "23505") return { ok: false, mensaje: "Ese RUT ya está registrado para otra persona." };
    return errorInesperado("guardarCuenta.update", error);
  }
  // Un UPDATE que la RLS no deja ver es éxito con cero filas, no un error:
  // pasa cuando el adm. de contrato intenta tocar a un administrador.
  if (!actualizado) return { ok: false, mensaje: "No tienes permiso para modificar a esta persona." };

  if (c.rol === "supervisor") {
    const cambian =
      tiposActuales.length !== c.tiposInspeccion.length ||
      tiposActuales.some((t) => !c.tiposInspeccion.includes(t));
    if (cambian) {
      const errTipos = await reemplazarTipos(supabase, personalId, c.tiposInspeccion);
      if (errTipos) return errorInesperado("guardarCuenta.tipos", errTipos);
    }
  }

  revalidar(personalId);
  return { ok: true };
}

/**
 * Suspender / devolver el acceso a la app (personal.activo) SIN
 * desvincular. Lo único que no se puede: devolverle el acceso a alguien
 * desvinculado — eso es "Reincorporar" (la base lo exige igual).
 */
export async function cambiarAcceso(input: { personalId: string; activo: boolean }): Promise<ResultadoAccion> {
  const { perfil } = await requireModuloRrhh();
  if (!UUID.test(input.personalId)) return NO_VALIDO;
  if (!input.activo && input.personalId === perfil.id)
    return { ok: false, mensaje: "No puedes suspender tu propio acceso." };

  const supabase = await createClient();
  if (input.activo) {
    const { data: ficha } = await supabase
      .from("rrhh_fichas")
      .select("fecha_desvinculacion")
      .eq("personal_id", input.personalId)
      .maybeSingle();
    if (ficha?.fecha_desvinculacion)
      return { ok: false, mensaje: "Esta persona está desvinculada. Para devolverle el acceso, reincorpórala." };
  }

  const { data, error } = await supabase
    .from("personal")
    .update({ activo: input.activo })
    .eq("id", input.personalId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23514")
      return { ok: false, mensaje: "Esta persona está desvinculada. Para devolverle el acceso, reincorpórala." };
    return errorInesperado("cambiarAcceso", error);
  }
  if (!data) return { ok: false, mensaje: "No tienes permiso para modificar a esta persona." };
  revalidar(input.personalId);
  return { ok: true };
}

export async function reenviarInvitacion(personalId: string): Promise<ResultadoAccion<{ aviso?: string }>> {
  await requireModuloRrhh();
  if (!UUID.test(personalId)) return NO_VALIDO;
  const supabase = await createClient();

  const { data: u } = await supabase
    .from("personal")
    .select("email, nombre, apellido, rol, telefono, fecha_nacimiento, activo")
    .eq("id", personalId)
    .maybeSingle();
  if (!u) return { ok: false, mensaje: "Persona no encontrada." };
  // "Ya activó su cuenta" es auth.users.last_sign_in_at
  // (private.estado_acceso_personal(), migración 20260918020000), no
  // personal.user_id: user_id se puebla desde el instante en que se invita.
  const { data: acceso } = await supabase.rpc("estado_acceso_personal");
  const yaInicioSesion = acceso?.find((a) => a.personal_id === personalId)?.alguna_vez_inicio_sesion ?? false;
  if (yaInicioSesion) return { ok: false, mensaje: "Esta persona ya activó su cuenta; no hay invitación pendiente." };
  // handle_new_user() (migración 20260918010000) exige activo = true para
  // vincular la cuenta: el correo saldría, pero el alta se rechazaría.
  if (!u.activo)
    return { ok: false, mensaje: "El acceso de esta persona está suspendido; devuélveselo antes de reenviar la invitación." };

  const aviso = await invitar({
    email: u.email ?? "",
    nombre: u.nombre,
    apellido: u.apellido ?? "",
    rol: u.rol,
    telefono: u.telefono ?? "",
    fechaNacimiento: u.fecha_nacimiento ?? "",
  });
  revalidar(personalId);
  return aviso ? { ok: true, aviso } : { ok: true };
}
