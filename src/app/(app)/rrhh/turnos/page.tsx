import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { fechaCorta, hoyChile } from "@/lib/rrhh/ficha";
import { horasSemanales, leerDias } from "@/lib/rrhh/jornadas";
import { rangoMes, rangoSemana, seSolapan, sumarDias, textoSinJornada, tramosSinJornada } from "@/lib/rrhh/turnos";
import { mesEtiqueta } from "@/lib/dashboard";
import { nombreCompleto } from "@/lib/mensajes";
import { AsignarTurno } from "@/components/rrhh/AsignarTurno";
import { AsignacionesMes } from "@/components/rrhh/AsignacionesMes";
import { buttonVariants } from "@/components/ui/button";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// Turnos (spec RRHH §8): asignar una jornada a varias personas por rango de
// fechas, y corregir o anular lo asignado. La ficha de cada persona solo
// muestra el historial. Guarda en la página (ver guardas.ts) y en cada
// acción; la RLS de rrhh_jornada_trabajador dice lo mismo.
export default async function TurnosPage({ searchParams }: { searchParams: Promise<{ mes?: string; faena?: string }> }) {
  await requireModuloRrhh();
  const { mes: mesParam = "", faena = "" } = await searchParams;
  const hoy = hoyChile();
  const mes = MES.test(mesParam) ? mesParam : hoy.slice(0, 7);
  const delMes = rangoMes(mes);
  const supabase = await createClient();

  const [{ data: jornadas }, { data: faenas }, { data: fichas }, { data: personal }, { data: asignaciones }] = await Promise.all([
    supabase.from("rrhh_jornadas").select("id, nombre, dias, activo").order("nombre"),
    supabase.from("rrhh_faenas").select("id, nombre").order("nombre"),
    supabase.from("rrhh_fichas").select("personal_id, faena_id, fecha_ingreso, fecha_desvinculacion"),
    supabase.from("personal").select("id, nombre, apellido").order("nombre"),
    supabase
      .from("rrhh_jornada_trabajador")
      .select("id, personal_id, jornada_id, vigente_desde, vigente_hasta, anulada_en")
      .is("anulada_en", null)
      .order("vigente_desde"),
  ]);

  const nombreJornada = new Map((jornadas ?? []).map((j) => [j.id, j.nombre]));
  const nombreDe = new Map((personal ?? []).map((p) => [p.id, nombreCompleto(p.nombre, p.apellido)]));
  // Solo personas con contrato vigente: sin contrato no hay horas que medir.
  const conContrato = (fichas ?? [])
    .filter((f) => !f.fecha_desvinculacion && (!faena || f.faena_id === faena))
    .map((f) => ({ ...f, nombre: nombreDe.get(f.personal_id) ?? "—" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const ids = new Set(conContrato.map((p) => p.personal_id));
  const todas = asignaciones ?? [];

  const delPeriodo = todas
    .filter((a) => ids.has(a.personal_id) && seSolapan({ desde: a.vigente_desde, hasta: a.vigente_hasta }, delMes))
    .map((a) => ({
      id: a.id,
      persona: nombreDe.get(a.personal_id) ?? "—",
      personalId: a.personal_id,
      jornada: nombreJornada.get(a.jornada_id) ?? "—",
      desde: a.vigente_desde,
      hasta: a.vigente_hasta,
    }))
    .sort((a, b) => a.persona.localeCompare(b.persona, "es") || a.desde.localeCompare(b.desde));

  // Huecos del mes, desde el ingreso de cada uno: sin jornada ese día no se
  // pueden medir sus horas. Se avisan con nombre y fecha.
  const huecos = conContrato.flatMap((p) => {
    const desde = p.fecha_ingreso > delMes.desde ? p.fecha_ingreso : delMes.desde;
    if (desde > delMes.hasta) return [];
    const propias = todas.filter((a) => a.personal_id === p.personal_id);
    return tramosSinJornada(propias, desde, delMes.hasta).map((t) => textoSinJornada(t, p.nombre));
  });

  const mesAnterior = sumarDias(delMes.desde, -1).slice(0, 7);
  const mesSiguiente = sumarDias(delMes.hasta, 1).slice(0, 7);
  const enlaceMes = (m: string) => `/rrhh/turnos?mes=${m}${faena ? `&faena=${faena}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
          <p className="text-sm text-muted-foreground">
            Asigna una jornada a varias personas a la vez, por rango de fechas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/rrhh/jornadas" className={buttonVariants({ variant: "outline" })}>
            Jornadas
          </Link>
          <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
            Volver a RRHH
          </Link>
        </div>
      </div>

      <p className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
        En Chile la distribución de la jornada es parte del contrato (Art. 10 Nº5 del Código del Trabajo) y el
        empleador solo puede mover la hora de inicio hasta 60 minutos, con 30 días de aviso (Art. 12). Un sistema
        de turnos rotativos tiene que estar pactado en el contrato o en un anexo: que esta pantalla permita
        reasignar no significa que la empresa pueda hacerlo libremente.
      </p>

      <form action="/rrhh/turnos" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="mes" value={mes} />
        <select name="faena" defaultValue={faena} className={nativeSelectClassName} aria-label="Faena">
          <option value="">Todas las faenas</option>
          {(faenas ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Filtrar
        </button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Asignar turno</CardTitle>
          <CardDescription>
            Se asigna a todos los marcados o a ninguno: si alguien ya tiene jornada en esas fechas, no se guarda nada
            y se muestra con qué choca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AsignarTurno
            jornadas={(jornadas ?? [])
              .filter((j) => j.activo)
              .map((j) => ({ id: j.id, nombre: j.nombre, horas: horasSemanales(leerDias(j.dias) ?? []) }))}
            personas={conContrato.map((p) => ({ id: p.personal_id, nombre: p.nombre }))}
            semana={rangoSemana(hoy)}
            mes={rangoMes(hoy)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{mesEtiqueta(mes)}</CardTitle>
            <div className="flex gap-2">
              <Link href={enlaceMes(mesAnterior)} className={buttonVariants({ variant: "outline" })}>
                ← {mesEtiqueta(mesAnterior)}
              </Link>
              <Link href={enlaceMes(mesSiguiente)} className={buttonVariants({ variant: "outline" })}>
                {mesEtiqueta(mesSiguiente)} →
              </Link>
            </div>
          </div>
          <CardDescription>
            Del {fechaCorta(delMes.desde)} al {fechaCorta(delMes.hasta)}. Una asignación no se borra: se corrige su
            rango o se anula, y cada cambio queda en el historial de la ficha con quién y cuándo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {huecos.length > 0 && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
              <p className="font-medium">Días sin jornada: las horas de estos días no se pueden calcular.</p>
              <ul className="mt-1 list-disc pl-5">
                {huecos.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <AsignacionesMes filas={delPeriodo} />
        </CardContent>
      </Card>
    </div>
  );
}
