import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { TiposDocumentoLista } from "@/components/rrhh/TiposDocumentoLista";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Catálogo de tipos de documento (§16.1). El conteo por tipo es lo que
// permite saber si desactivar uno deja documentos sin un tipo vigente.
export default async function TiposDocumentoPage() {
  await requireModuloRrhh();
  const supabase = await createClient();
  const [{ data: tipos }, { data: documentos }] = await Promise.all([
    supabase.from("rrhh_tipos_documento").select("id, nombre, activo").order("orden"),
    supabase.from("rrhh_documentos").select("tipo_id"),
  ]);
  const cuenta = new Map<string, number>();
  for (const d of documentos ?? []) cuenta.set(d.tipo_id, (cuenta.get(d.tipo_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tipos de documento</h1>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            Un tipo se desactiva, no se borra: los documentos ya cargados lo
            conservan, pero deja de aparecer al cargar documentos nuevos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TiposDocumentoLista
            tipos={(tipos ?? []).map((t) => ({ ...t, documentos: cuenta.get(t.id) ?? 0 }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
