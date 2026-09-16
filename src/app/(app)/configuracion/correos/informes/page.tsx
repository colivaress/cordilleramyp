import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DestinatariosPorCanal } from "@/components/configuracion-correos/DestinatariosPorCanal";
import type { DestinatarioCorreo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  await requireRol("administrador");
  const supabase = await createClient();

  // §1: los tipos se leen de tipos_inspeccion, nunca de una lista fija en
  // código — si el catálogo cambia, esta pantalla no necesita un deploy
  // aparte para enterarse.
  const [{ data: tipos }, { data: filas }] = await Promise.all([
    supabase.from("tipos_inspeccion").select("clave, titulo").order("titulo"),
    supabase
      .from("destinatarios_correo_tipos")
      .select("tipo_inspeccion, destinatario:destinatarios_correo(*)")
      .eq("recibe_informes", true),
  ]);

  const porTipo: Record<string, DestinatarioCorreo[]> = {};
  for (const f of filas ?? []) {
    (porTipo[f.tipo_inspeccion] ??= []).push(f.destinatario);
  }

  return (
    <DestinatariosPorCanal canal="informes" tipos={tipos ?? []} porTipo={porTipo} />
  );
}
