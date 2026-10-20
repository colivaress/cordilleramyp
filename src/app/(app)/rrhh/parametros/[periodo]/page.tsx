import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditarMontos } from "@/lib/rrhh/guardas";
import {
  copiarParaNuevoPeriodo,
  desdeBase,
  formularioDesdeBase,
  formularioVacio,
  leerCodigoPeriodo,
  nombrePeriodo,
  type FormularioParametros,
} from "@/lib/rrhh/parametros";
import { cargarParametrosPeriodo, periodoAnterior } from "@/lib/rrhh/parametros-servidor";
import { ParametrosForm } from "@/components/rrhh/ParametrosForm";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ParametrosPeriodoPage({
  params,
}: {
  params: Promise<{ periodo: string }>;
}) {
  await requireEditarMontos();
  const { periodo } = await params;
  const p = leerCodigoPeriodo(periodo);
  if (!p) notFound();

  const supabase = await createClient();
  const [{ data: fila }, { data: afps }] = await Promise.all([
    supabase
      .from("rrhh_parametros_periodo")
      .select("*")
      .eq("anio", p.anio)
      .eq("mes", p.mes)
      .maybeSingle(),
    supabase.from("rrhh_afp_periodo").select("afp, comision").eq("anio", p.anio).eq("mes", p.mes),
  ]);

  let inicial: FormularioParametros;
  let aviso: string | null = null;
  let pendientes: string[] = [];

  if (fila) {
    inicial = formularioDesdeBase(fila, afps ?? []);
    const r = desdeBase(p.anio, p.mes, fila, afps ?? []);
    if (!r.ok) pendientes = r.errores;
  } else {
    const anterior = await periodoAnterior(supabase, p.anio, p.mes);
    const base = anterior ? await cargarParametrosPeriodo(supabase, anterior.anio, anterior.mes) : null;
    if (anterior && base?.ok) {
      inicial = copiarParaNuevoPeriodo(base.valor, p.anio, p.mes);
      aviso = `Período nuevo. Se copiaron los valores de ${nombrePeriodo(anterior.anio, anterior.mes)} salvo la UF y la UTM, que hay que escribir. Revisa cada valor contra el PDF de indicadores de Previred del mes antes de guardar.`;
    } else {
      inicial = formularioVacio(p.anio, p.mes);
      aviso = "Período nuevo, sin un período anterior completo del cual copiar: hay que cargar todos los valores.";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight capitalize">
            {nombrePeriodo(p.anio, p.mes)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Parámetros previsionales del período. Las tasas van en porcentaje
            (10 = 10%) y los decimales con coma.
          </p>
        </div>
        <Link href="/rrhh/parametros" className={buttonVariants({ variant: "outline" })}>
          Volver a los períodos
        </Link>
      </div>

      {aviso && (
        <p className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          {aviso}
        </p>
      )}
      {pendientes.length > 0 && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
          <p className="font-medium">Este período está incompleto y no sirve para calcular:</p>
          <ul className="mt-1 list-disc pl-5">
            {pendientes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <ParametrosForm inicial={inicial} existe={!!fila} />
    </div>
  );
}
