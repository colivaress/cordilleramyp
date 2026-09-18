import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsuariosTabla } from "@/components/usuarios/UsuariosTabla";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  // §2.10: panel de administrador y administrador_contrato (ruta + RLS de
  // `personal` — este último no puede crear/editar/borrar filas admin, eso
  // lo aplica la RLS, no esta página).
  const { perfil } = await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  // Fase "tipos de inspección" — parte 4/4: tipos permitidos por supervisor.
  //
  // estado_acceso_personal(): el dato real de "¿esta persona alguna vez
  // inició sesión?" vive en auth.users.last_sign_in_at, no en
  // personal.user_id (que se puebla desde el instante en que se invita, no
  // cuando la persona entra por primera vez — esa distinción es la que
  // hacía que la columna Estado mintiera). Función SECURITY DEFINER en
  // private, con su propia guarda de rol adentro — ver la migración
  // 20260918020000.
  const [{ data: usuarios }, { data: permisos }, { data: acceso }] = await Promise.all([
    supabase.from("personal").select("*").order("nombre"),
    supabase.from("personal_tipos_inspeccion").select("personal_id, tipo_inspeccion"),
    supabase.rpc("estado_acceso_personal"),
  ]);

  const tiposPorSupervisor: Record<string, string[]> = {};
  for (const p of permisos ?? []) {
    (tiposPorSupervisor[p.personal_id] ??= []).push(p.tipo_inspeccion);
  }

  const accesoPorPersonal: Record<string, boolean> = {};
  for (const a of acceso ?? []) {
    accesoPorPersonal[a.personal_id] = a.alguna_vez_inicio_sesion ?? false;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Supervisores y administradores del sistema. Las cuentas nuevas se crean
          desde aquí — nadie se registra por su cuenta ni elige su rol.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
          <CardDescription>
            “Invitación pendiente” = la persona aún no inició sesión. Un usuario
            desactivado no puede usar la app aunque su sesión siga abierta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsuariosTabla
            usuarios={usuarios ?? []}
            perfilId={perfil.id}
            perfilRol={perfil.rol}
            tiposPorSupervisor={tiposPorSupervisor}
            accesoPorPersonal={accesoPorPersonal}
          />
        </CardContent>
      </Card>
    </div>
  );
}
