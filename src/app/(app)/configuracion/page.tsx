import Link from "next/link";
import { MailIcon, TruckIcon } from "lucide-react";
import { requireRol } from "@/lib/auth";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Landing de configuración — exclusivo administrador/administrador_contrato,
// mismo patrón que el resto de /configuracion y /usuarios. Reemplaza al link
// directo a /configuracion/correos del nav: ahora hay dos dominios
// (Correo, Transportes), cada uno con su propia pantalla ya existente
// (/configuracion/correos no cambia, solo se llega un clic más adentro).
export default async function ConfiguracionPage() {
  await requireRol("administrador", "administrador_contrato");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Destinatarios de correo y catálogo de transportes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/configuracion/correos" className="group">
          <Card className="h-full transition-colors group-hover:border-brand-300">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MailIcon className="size-5 text-brand-600" />
                <CardTitle>Correo</CardTitle>
              </div>
              <CardDescription>
                Quién recibe las alertas de vencimiento y los informes, por
                tipo de inspección.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/configuracion/transportes" className="group">
          <Card className="h-full transition-colors group-hover:border-brand-300">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TruckIcon className="size-5 text-brand-600" />
                <CardTitle>Transportes</CardTitle>
              </div>
              <CardDescription>
                Catálogo de transportes que alimenta el selector del
                formulario de inspecciones.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
