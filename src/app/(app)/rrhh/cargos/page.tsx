import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { CatalogoLista } from "@/components/rrhh/CatalogoLista";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Catálogo de cargos de la ficha (antes texto libre). El conteo dice cuántas
// fichas lo usan: lo que hay que mirar antes de desactivarlo.
export default async function CargosPage() {
  await requireModuloRrhh();
  const supabase = await createClient();
  const [{ data: items }, { data: fichas }] = await Promise.all([
    supabase.from("rrhh_cargos").select("id, nombre, activo").order("nombre"),
    supabase.from("rrhh_fichas").select("cargo_id"),
  ]);
  const cuenta = new Map<string, number>();
  for (const f of fichas ?? []) cuenta.set(f.cargo_id, (cuenta.get(f.cargo_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Cargos</h1>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            El cargo es el puesto de la persona y no le da permisos en la app (eso es el rol). Un cargo se
            desactiva, no se borra: las fichas que ya lo tienen lo conservan, pero deja de ofrecerse en las
            nuevas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogoLista
            catalogo="cargos"
            items={(items ?? []).map((t) => ({ ...t, usos: cuenta.get(t.id) ?? 0 }))}
            etiquetaNuevo="Nuevo cargo"
            etiquetaItem="Cargo"
            etiquetaUsos="Fichas"
          />
        </CardContent>
      </Card>
    </div>
  );
}
