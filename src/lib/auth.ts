import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Personal, RolUsuario } from "@/lib/tipos";

/**
 * Devuelve el usuario autenticado y su fila en `personal` (rol, nombre, teléfono).
 * Redirige a /login si no hay sesión. Úsese en Server Components / layouts.
 */
export async function getSesion(): Promise<{ userId: string; perfil: Personal }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("personal")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!perfil) {
    // El trigger handle_new_user no alcanzó a crear la fila, o fue borrada.
    redirect("/login?error=perfil_no_encontrado");
  }

  return { userId: user.id, perfil };
}

/** Como getSesion pero exige uno de los roles dados. */
export async function requireRol(...roles: RolUsuario[]) {
  const sesion = await getSesion();
  if (!roles.includes(sesion.perfil.rol)) {
    redirect("/dashboard?error=sin_permiso");
  }
  return sesion;
}
