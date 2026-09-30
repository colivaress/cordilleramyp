import Link from "next/link";
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
  const [
    { data: items },
    { data: tipos },
    { count: totalActivos },
    { data: sinTerminar },
    { data: transportesCatalogo },
  ] = await Promise.all([
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
      // Recuperación EXPLÍCITA, no silenciosa: una inspección nueva es
      // siempre un ticket nuevo (ver InspeccionForm) — si el supervisor
      // dejó una sin terminar, se la ofrece acá por su número y tipo, y
      // depende de él elegir continuarla o empezar otra igual. Revisión 1
      // en_revision es exactamente, y solo, "el ticket todavía no cerró su
      // primera vuelta" — nunca puede tratarse de una re-inspección (esas
      // dejan `en_revision` apenas arrancan, ver iniciarReinspeccion).
      supabase
        .from("tickets")
        .select("id, numero_inspeccion, tipo_inspeccion")
        .eq("supervisor_id", perfil.id)
        .eq("estado", "en_revision")
        .eq("revision_actual", 1)
        .order("numero_inspeccion", { ascending: false }),
      // Catálogo gestionable (/configuracion/transportes) — solo los
      // activos, orden alfabético. tickets.transporte sigue siendo texto
      // libre (no FK): esto solo restringe lo que el selector ofrece, no
      // lo que puede quedar guardado en un ticket ya creado.
      supabase
        .from("transportes")
        .select("nombre")
        .eq("activo", true)
        .order("nombre"),
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
      {(sinTerminar ?? []).length > 0 && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-warning-800">
          <p className="font-medium">
            {sinTerminar!.length === 1
              ? "Tienes una inspección sin terminar:"
              : "Tienes inspecciones sin terminar:"}
          </p>
          <ul className="mt-2 grid gap-1 text-sm">
            {sinTerminar!.map((t) => (
              <li key={t.id}>
                Nro {t.numero_inspeccion},{" "}
                {ETIQUETA_TIPO_INSPECCION[t.tipo_inspeccion ?? ""] ??
                  t.tipo_inspeccion}
                {" — "}
                <Link
                  href={`/tickets/${t.id}/reinspeccion`}
                  className="font-medium underline underline-offset-2"
                >
                  Continuarla
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warning-700">
            Puedes ignorar este aviso y completar los datos de abajo para
            empezar una inspección distinta.
          </p>
        </div>
      )}
      <InspeccionForm
        modo="nueva"
        items={items ?? []}
        tipos={tipos ?? []}
        transportes={(transportesCatalogo ?? []).map((t) => t.nombre)}
      />
    </div>
  );
}
