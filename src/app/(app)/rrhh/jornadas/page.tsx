import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { leerDias } from "@/lib/rrhh/jornadas";
import { JornadasGestion } from "@/components/rrhh/JornadasGestion";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Patrones de jornada (§8). Los configuran administrador y adm. de contrato
// (ruta + RLS de rrhh_jornadas).
export default async function JornadasPage() {
  await requireModuloRrhh();
  const supabase = await createClient();
  const [{ data: jornadas }, { data: asignaciones }] = await Promise.all([
    supabase.from("rrhh_jornadas").select("id, nombre, activo, dias").order("nombre"),
    supabase.from("rrhh_jornada_trabajador").select("personal_id, jornada_id"),
  ]);

  // Trabajadores que la tuvieron asignada alguna vez (no solo hoy).
  const asignados = new Map<string, Set<string>>();
  for (const a of asignaciones ?? []) asignados.set(a.jornada_id, (asignados.get(a.jornada_id) ?? new Set()).add(a.personal_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jornadas</h1>
          <p className="text-sm text-muted-foreground">Horarios de trabajo. Se asignan a las personas, por rango de fechas, en Turnos.</p>
        </div>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>
      <JornadasGestion
        jornadas={(jornadas ?? []).map((j) => ({
          id: j.id,
          nombre: j.nombre,
          activo: j.activo,
          dias: leerDias(j.dias) ?? [],
          asignados: asignados.get(j.id)?.size ?? 0,
        }))}
      />
    </div>
  );
}
