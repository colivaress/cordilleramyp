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
            No tienes ningún tipo de inspección asignado.
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
  // asignados Y siguen activos, para poblar el combo.
  //
  // `activo = true` — un tipo deshabilitado (ver migración
  // 20260927010000_tipos_inspeccion_activo.sql) desaparece del combo para
  // TODOS los supervisores, aunque tengan el permiso asignado en
  // personal_tipos_inspeccion — la fila del catálogo sigue existiendo (los
  // tickets ya creados con ese tipo, su checklist, su informe y su etiqueta
  // en listados no dependen de esta consulta, solo de que la fila exista).
  // Las pantallas de configuración de correos por tipo NO filtran por
  // `activo` — un administrador tiene que poder seguir viendo/editando los
  // destinatarios ya configurados para un tipo deshabilitado.
  const [{ data: items }, { data: tipos }, { count: totalActivos }] =
    await Promise.all([
      supabase.from("checklist_items").select("*").order("orden"),
      supabase
        .from("tipos_inspeccion")
        .select("*")
        .in("clave", [...clavesPermitidas])
        .eq("activo", true),
      // Total de tipos activos HOY en todo el catálogo (no solo los de este
      // supervisor) — para el texto "Tipos habilitados para tu cuenta" de
      // abajo: sin esto, comparar contra un "4" fijo mostraría el aviso (o
      // lo ocultaría mal) apenas se deshabilita/habilita un tipo, sin que
      // ningún permiso de este supervisor haya cambiado.
      supabase
        .from("tipos_inspeccion")
        .select("clave", { count: "exact", head: true })
        .eq("activo", true),
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
        {(tipos ?? []).length < (totalActivos ?? 0) && (
          <p className="mt-1 text-xs text-muted-foreground">
            Tipos habilitados para tu cuenta:{" "}
            {(tipos ?? [])
              .map((t) => ETIQUETA_TIPO_INSPECCION[t.clave] ?? t.clave)
              .join(", ")}
            .
          </p>
        )}
      </div>
      <InspeccionForm modo="nueva" items={items ?? []} tipos={tipos ?? []} />
    </div>
  );
}
