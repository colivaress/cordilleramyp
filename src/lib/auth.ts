import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_PERSONAL, type Personal, type RolUsuario } from "@/lib/tipos";

/**
 * Devuelve el usuario autenticado y su fila en `personal` (rol, nombre, teléfono).
 * Redirige a /login si no hay sesión. Úsese en Server Components / layouts.
 *
 * Envuelta en React.cache(): el layout de (app) y cada page.tsx llaman
 * getSesion() por su cuenta (no se pasa como prop) — sin esto,
 * supabase.auth.getUser() se ejecutaba dos veces (una en el layout, otra en
 * la página) para la MISMA navegación. React.cache() memoiza por el árbol de
 * render de una sola request — la primera llamada hace el trabajo real, las
 * siguientes en la misma request devuelven el mismo resultado sin volver a
 * pegarle a la red. Medido: bajó ~400-700ms por navegación (ver PR).
 *
 * 🔴 NO reemplazar auth.getUser() por auth.getSession() (o por decodificar el
 * JWT de la cookie a mano) para "ahorrar" esos ~ms — es el atajo que alguien
 * va a intentar el día que quiera ganar 200ms más, y rompe la garantía real:
 * getUser() valida el token CONTRA el servidor de Auth; getSession() confía
 * en lo que diga la cookie local, que se puede falsificar. Todo requireRol()
 * del sistema (admin vs. supervisor, RLS de por medio) depende de que esta
 * identidad sea la validada por el servidor, no la que el cliente dice tener.
 * El arreglo correcto es llamarlo una sola vez y compartir el resultado
 * (esto), nunca llamarlo "menos" confiando en una fuente no verificada.
 */
export const getSesion = cache(async (): Promise<{
  userId: string;
  perfil: Personal;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Columnas explícitas, nunca "*": rut no es legible con un select directo
  // (grants por columna) y "*" fallaría entero.
  const { data: perfil, error } = await supabase
    .from("personal")
    .select(COLUMNAS_PERSONAL)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // No confundir un error real (RLS, red, credenciales) con "no tiene
    // perfil" — antes se ignoraba `error` y ambos casos mostraban el mismo
    // mensaje engañoso ("contacta a un administrador"), sin dejar rastro.
    console.error("getSesion: error consultando personal:", error);
    redirect("/login?error=error_perfil");
  }

  if (!perfil) {
    // El trigger handle_new_user no alcanzó a vincular la fila, o fue borrada.
    redirect("/login?error=perfil_no_encontrado");
  }

  // §2.10: una cuenta desactivada no puede usar la app aunque su sesión de
  // Supabase Auth siga vigente.
  if (!perfil.activo) {
    redirect("/login?error=cuenta_desactivada");
  }

  return { userId: user.id, perfil };
});

/**
 * Inicio de cada rol. El trabajador no tiene nada operativo: su única
 * pantalla es "Mis datos" (spec RRHH §16.7).
 */
export function inicioDeRol(rol: RolUsuario): string {
  return rol === "trabajador" ? "/mis-datos" : "/dashboard";
}

/** Como getSesion pero exige uno de los roles dados. */
export async function requireRol(...roles: RolUsuario[]) {
  const sesion = await getSesion();
  if (!roles.includes(sesion.perfil.rol)) {
    redirect(`${inicioDeRol(sesion.perfil.rol)}?error=sin_permiso`);
  }
  return sesion;
}

/**
 * Los roles que operan inspecciones. Toda pantalla o acción de tickets que
 * antes solo pedía "una sesión" (getSesion) pide esto: un rol nuevo NO
 * entra por omisión, hay que agregarlo acá a propósito. Misma regla que
 * private.es_operativo() en la base.
 */
export const ROLES_OPERATIVOS = [
  "administrador",
  "administrador_contrato",
  "supervisor",
] as const satisfies readonly RolUsuario[];

export function requireOperativo() {
  return requireRol(...ROLES_OPERATIVOS);
}
