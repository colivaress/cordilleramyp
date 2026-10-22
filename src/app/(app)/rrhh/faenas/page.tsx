import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { CatalogoLista } from "@/components/rrhh/CatalogoLista";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Catálogo de faenas de la ficha: el lugar (cliente o planta) donde la
// persona está destinada a trabajar. Antes se llamaba "área". También es el
// filtro del listado y de Turnos. El conteo dice cuántas fichas la usan.
export default async function FaenasPage() {
  await requireModuloRrhh();
  const supabase = await createClient();
  const [{ data: items }, { data: fichas }] = await Promise.all([
    supabase.from("rrhh_faenas").select("id, nombre, activo").order("nombre"),
    supabase.from("rrhh_fichas").select("faena_id"),
  ]);
  const cuenta = new Map<string, number>();
  for (const f of fichas ?? []) if (f.faena_id) cuenta.set(f.faena_id, (cuenta.get(f.faena_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Faenas</h1>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            Una faena se desactiva, no se borra: las fichas que ya la tienen la conservan, pero deja de
            ofrecerse en las nuevas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogoLista
            catalogo="faenas"
            items={(items ?? []).map((t) => ({ ...t, usos: cuenta.get(t.id) ?? 0 }))}
            etiquetaNuevo="Nueva faena"
            etiquetaItem="Faena"
            etiquetaUsos="Fichas"
          />
        </CardContent>
      </Card>
    </div>
  );
}
