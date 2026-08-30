import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente Supabase con `service_role` — SOLO para código server-only sin sesión
 * de usuario (p. ej. el cron de §3.1, que recorre todos los tickets abiertos y
 * marca el aviso enviado). Bypassa RLS. **Nunca** importar desde un Client
 * Component; `SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_` (§9).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) para operaciones server-only.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
