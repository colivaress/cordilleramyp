import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InspeccionForm } from "@/components/InspeccionForm";
import { ETIQUETA_TIPO_INSPECCION } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function NuevaInspeccionPage() {
  // §2.6: solo el supervisor crea inspecciones. Bloquea el acceso directo por URL.
  const { perfil } = await requireRol("supervisor");
  const supabase = await createClient();

  // Fase "tipos de inspección" — parte 4/4: qué tipos puede REALIZAR este
  // supervisor. Sin ninguna fila -> ninguno (la ausencia de permiso es
  // ausencia de acceso, no acceso total — ver la migración de RLS). Es un
  // estado válido a propósito (suspender sin desactivar la cuenta), así que
  // acá se explica, no se muestra un combo vacío ni se deja fallar el envío.
  const { data: permitidos } = await supabase
    .from("personal_tipos_inspeccion")
    .select("tipo_inspeccion")
    .eq("personal_id", perfil.id);
  const clavesPermitidas = new Set((permitidos ?? []).map((p) => p.tipo_inspeccion));

  if (clavesPermitidas.size === 0) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nueva inspección
          </h1>
        </div>
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-6 text-warning-800">
          <p className="font-medium">
            No tenés ningún tipo de inspección asignado.
          </p>
          <p className="mt-1 text-sm">
            Un administrador tiene que asignarte al menos uno desde el panel
            de Usuarios antes de que puedas crear una inspección.
          </p>
        </div>
      </div>
    );
  }

  // Trae TODOS los ítems (de los 4 tipos) sin filtrar — InspeccionForm filtra
  // por el tipo que elija el supervisor — y solo los tipos que le fueron
  // asignados, para poblar el combo.
  const [{ data: items }, { data: tipos }] = await Promise.all([
    supabase.from("checklist_items").select("*").order("orden"),
    supabase
      .from("tipos_inspeccion")
      .select("*")
      .in("clave", [...clavesPermitidas]),
  ]);

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
        {clavesPermitidas.size < 4 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Tipos habilitados para tu cuenta:{" "}
            {[...clavesPermitidas]
              .map((c) => ETIQUETA_TIPO_INSPECCION[c] ?? c)
              .join(", ")}
            .
          </p>
        )}
      </div>
      <InspeccionForm modo="nueva" items={items ?? []} tipos={tipos ?? []} />
    </div>
  );
}
