import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEditarMontos } from "@/lib/rrhh/guardas";
import {
  codigoPeriodo,
  desdeBase,
  leerCodigoPeriodo,
  nombrePeriodo,
} from "@/lib/rrhh/parametros";
import { formatearCLP } from "@/lib/dinero";
import { IrAPeriodo } from "@/components/rrhh/IrAPeriodo";
import { MutualAdicional } from "@/components/rrhh/MutualAdicional";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Spec RRHH §3: pantalla visible solo para administrador. La guarda va en la
// página (ver guardas.ts); la RLS de rrhh_parametros_periodo además solo deja
// escribir a private.es_admin().
export default async function ParametrosPage() {
  await requireEditarMontos();
  const supabase = await createClient();

  const [{ data: periodos }, { data: afps }, { data: mutual }] = await Promise.all([
    supabase
      .from("rrhh_parametros_periodo")
      .select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
    supabase.from("rrhh_afp_periodo").select("anio, mes, afp, comision"),
    supabase
      .from("rrhh_mutual_adicional")
      .select("vigente_desde, vigente_hasta, tasa")
      .order("vigente_desde"),
  ]);

  // Mes actual en Chile, no en la zona del servidor (UTC).
  const hoy = leerCodigoPeriodo(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()),
  )!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Parámetros previsionales
          </h1>
          <p className="text-sm text-muted-foreground">
            Indicadores de cada mes: se cargan desde el PDF de Previred. Sin el
            período cargado completo, no se puede calcular la liquidación de
            ese mes.
          </p>
        </div>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cargar o corregir un período</CardTitle>
        </CardHeader>
        <CardContent>
          <IrAPeriodo anio={hoy.anio} mes={hoy.mes} />
        </CardContent>
      </Card>

      <MutualAdicional
        anio={hoy.anio}
        mes={hoy.mes}
        tramos={(mutual ?? []).map((t) => ({
          vigenteDesde: t.vigente_desde,
          vigenteHasta: t.vigente_hasta,
          tasa: t.tasa,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Períodos cargados</CardTitle>
          <CardDescription>
            Corregir un período cambia el cálculo de las liquidaciones de ese
            mes que todavía no se emiten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!periodos?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay ningún período cargado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">UF fin de mes</TableHead>
                    <TableHead className="text-right">UTM</TableHead>
                    <TableHead className="text-right">Ingreso mínimo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Actualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodos.map((p) => {
                    const completo = desdeBase(
                      p.anio,
                      p.mes,
                      p,
                      (afps ?? []).filter((a) => a.anio === p.anio && a.mes === p.mes),
                    ).ok;
                    return (
                      <TableRow key={codigoPeriodo(p.anio, p.mes)}>
                        <TableCell>
                          <Link
                            href={`/rrhh/parametros/${codigoPeriodo(p.anio, p.mes)}`}
                            className="font-medium text-brand-700 capitalize underline-offset-4 hover:underline"
                          >
                            {nombrePeriodo(p.anio, p.mes)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.uf_mes.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatearCLP(p.utm)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatearCLP(p.imm)}</TableCell>
                        <TableCell>
                          {completo ? (
                            <Badge className="bg-success-100 text-success-700">Completo</Badge>
                          ) : (
                            <Badge className="bg-danger-100 text-danger-700">Incompleto</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(p.updated_at).toLocaleString("es-CL", {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: "America/Santiago",
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
