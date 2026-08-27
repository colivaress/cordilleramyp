import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Firma un lote de rutas de un bucket privado y devuelve un mapa ruta -> URL firmada.
 * Recibe el cliente Supabase para poder usarse tanto en páginas (cliente con
 * sesión por cookies) como en scripts / route handlers.
 */
export async function firmarRutas(
  supabase: SupabaseClient<Database>,
  bucket: "firmas" | "fallas",
  rutas: (string | null | undefined)[],
  expiraSegundos = 3600,
): Promise<Record<string, string>> {
  const limpias = Array.from(new Set(rutas.filter((r): r is string => !!r)));
  if (limpias.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(limpias, expiraSegundos);
  if (error || !data) return {};

  const mapa: Record<string, string> = {};
  data.forEach((d) => {
    if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
  });
  return mapa;
}
