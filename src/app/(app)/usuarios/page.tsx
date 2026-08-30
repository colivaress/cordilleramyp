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
  // §2.10: panel exclusivo del administrador (ruta + RLS de `personal`).
  const { perfil } = await requireRol("administrador");
  const supabase = await createClient();

  const { data: usuarios } = await supabase
    .from("personal")
    .select("*")
    .order("nombre");

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
          <UsuariosTabla usuarios={usuarios ?? []} perfilId={perfil.id} />
        </CardContent>
      </Card>
    </div>
  );
}
