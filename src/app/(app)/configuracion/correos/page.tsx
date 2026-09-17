import Link from "next/link";
import { BellIcon, SendIcon } from "lucide-react";
import { requireRol } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Exclusivo de administrador — ruta + RLS de las tablas que toca (ver
// actions.ts), mismo patrón que /usuarios (§2.10). Sin configuración de
// remitente en ningún punto de esta pantalla ni de sus dos vistas: la
// contraseña SMTP sigue solo en la variable de entorno, nunca en la base.
export default async function ConfiguracionCorreosPage() {
  await requireRol("administrador", "administrador_contrato");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración correos</h1>
        <p className="text-sm text-muted-foreground">
          Quién recibe qué, por tipo de inspección. Los destinatarios de acá
          son externos a Cordillera M&amp;P — el personal del sistema recibe
          por su rol, no por esta pantalla.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/configuracion/correos/alertas" className="group">
          <Card className="h-full transition-colors group-hover:border-brand-300">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BellIcon className="size-5 text-brand-600" />
                <CardTitle>Alertas</CardTitle>
              </div>
              <CardDescription>
                Quién más, además de administradores y el supervisor del
                ticket, recibe el aviso cuando una inspección está por vencer
                (48h, 24h y al vencer).
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/configuracion/correos/informes" className="group">
          <Card className="h-full transition-colors group-hover:border-brand-300">
            <CardHeader>
              <div className="flex items-center gap-2">
                <SendIcon className="size-5 text-brand-600" />
                <CardTitle>Informes</CardTitle>
              </div>
              <CardDescription>
                Quién puede recibir el informe de cada tipo de inspección
                cuando alguien lo envía por correo desde &quot;Enviar por
                correo&quot;.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Cada tipo de inspección tiene su propia lista, en cada una de las
          dos vistas — un mismo correo puede estar en varias listas a la vez.
          Un destinatario autorizado para Encarpe no recibe nada de
          Control de Salida a menos que se agregue también ahí.
        </CardContent>
      </Card>
    </div>
  );
}
