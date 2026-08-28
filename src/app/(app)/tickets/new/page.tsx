import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InspeccionForm } from "@/components/InspeccionForm";

export const dynamic = "force-dynamic";

export default async function NuevaInspeccionPage() {
  // §2.6: solo el supervisor crea inspecciones. Bloquea el acceso directo por URL.
  await requireRol("supervisor");
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
          Completar los datos de inspección, luego realizar el checklist de los
          elementos a fiscalizar y firmar.
        </p>
      </div>
      <InspeccionForm modo="nueva" items={items ?? []} />
    </div>
  );
}
