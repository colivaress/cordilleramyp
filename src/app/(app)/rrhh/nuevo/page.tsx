import Link from "next/link";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { rolesQuePuedeCrear } from "@/lib/rrhh/cuenta";
import { CuentaForm } from "@/components/rrhh/CuentaForm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Alta de una persona: crea su fila en personal (que ES la invitación) y le
// manda el correo para activar su cuenta. El contrato se completa después,
// en su ficha, cuando RRHH tenga los datos.
export default async function NuevaPersonaPage() {
  const { perfil } = await requireModuloRrhh();
  const [rolInicial] = rolesQuePuedeCrear(perfil.rol);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Agregar persona</h1>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cuenta y acceso</CardTitle>
          <CardDescription>
            Se crea la cuenta y se le envía una invitación por correo para que defina su contraseña. Nadie se
            registra por su cuenta ni elige su rol.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CuentaForm
            personalId={null}
            actor={perfil.rol}
            inicial={{
              nombre: "",
              apellido: "",
              rut: "",
              email: "",
              telefono: "",
              fechaNacimiento: "",
              rol: perfil.rol === "administrador" ? "supervisor" : rolInicial,
              tiposInspeccion: [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
