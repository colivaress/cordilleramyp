import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/lib/tipos";

/**
 * Envía (o reenvía) la invitación de Supabase Auth. Best-effort: devuelve
 * un aviso para mostrar si falló, o null. Movida tal cual desde
 * usuarios/actions.ts (la cuenta ahora se administra desde la ficha de
 * RRHH). Solo se importa desde Server Actions: usa el cliente service_role.
 */
export async function invitar(input: {
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
      // Sin esto, Supabase arma el enlace del correo contra el Site URL
      // global del proyecto (una configuración del dashboard de Supabase,
      // no de este código) — si ese valor está mal puesto para el entorno
      // (ya pasó con el de staging), el enlace queda roto sin que nada acá
      // lo explique. NEXT_PUBLIC_APP_URL es la URL pública real de CADA
      // entorno (mismo patrón que ya usa el cron de alertas de
      // vencimiento) — nunca depende del origin del request que dispara la
      // Server Action, así que invitar desde un entorno de desarrollo
      // nunca genera enlaces a ese entorno.
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
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
