import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InspeccionForm } from "@/components/InspeccionForm";

export const dynamic = "force-dynamic";

export default async function NuevaInspeccionPage() {
  await requireRol("supervisor", "administrador");
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("checklist_items")
    .select("*")
    .order("orden");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nueva inspección
        </h1>
        <p className="text-sm text-muted-foreground">
          Completá la cabecera, luego el checklist de 18 elementos y las firmas.
        </p>
      </div>
      <InspeccionForm modo="nueva" items={items ?? []} />
    </div>
  );
}
