import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TransportesLista } from "@/components/configuracion-transportes/TransportesLista";

export const dynamic = "force-dynamic";

// Exclusivo de administrador/administrador_contrato — ruta + RLS de
// `transportes` (ver la migración), mismo patrón que el resto de
// /configuracion. Trae TODOS los transportes (activos e inactivos): esta
// pantalla es la única que necesita ver los inactivos, para poder
// reactivarlos — el selector del formulario de inspecciones filtra a
// `activo = true` con su propia consulta (tickets/new/page.tsx).
export default async function ConfiguracionTransportesPage() {
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const { data: transportes } = await supabase
    .from("transportes")
    .select("*")
    .order("nombre");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transportes</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de transportes que alimenta el selector del formulario de
          inspecciones, en todos los tipos.
        </p>
      </div>
      <TransportesLista transportes={transportes ?? []} />
    </div>
  );
}
