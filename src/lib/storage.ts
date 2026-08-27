import { createClient } from "@/lib/supabase/server";

/**
 * Firma un lote de rutas de un bucket privado y devuelve un mapa ruta -> URL firmada.
 * Las rutas nulas/vacías se ignoran.
 */
export async function firmarRutas(
  bucket: "firmas" | "fallas",
  rutas: (string | null | undefined)[],
  expiraSegundos = 3600,
): Promise<Record<string, string>> {
  const limpias = Array.from(
    new Set(rutas.filter((r): r is string => !!r)),
  );
  if (limpias.length === 0) return {};

  const supabase = await createClient();
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
