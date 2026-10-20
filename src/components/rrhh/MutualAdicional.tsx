"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
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
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { registrarMutualAdicional } from "@/app/(app)/rrhh/parametros/actions";
import {
  escribirDecimal,
  nombreMes,
  nombrePeriodo,
  type TramoMutualAdicional,
} from "@/lib/rrhh/parametros";

/** "2026-10-01" → "octubre 2026" */
function mesDeFecha(fecha: string) {
  const [anio, mes] = fecha.split("-").map(Number);
  return nombrePeriodo(anio, mes);
}

/** "2027-01-01" exclusivo → "diciembre 2026", el último mes que cubre. */
function mesAnterior(fecha: string) {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 1 ? nombrePeriodo(anio - 1, 12) : nombrePeriodo(anio, mes - 1);
}

export function MutualAdicional({
  tramos,
  anio,
  mes,
}: {
  tramos: TramoMutualAdicional[];
  anio: number;
  mes: number;
}) {
  const [mesElegido, setMes] = useState(mes);
  const [anioTexto, setAnio] = useState(String(anio));
  const [tasa, setTasa] = useState("");
  const guardado = useEstadoGuardado();

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = await registrarMutualAdicional({
          anio: Number(anioTexto),
          mes: mesElegido,
          tasa,
        });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Tasa adicional registrada.");
      setTasa("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasa adicional de mutual</CardTitle>
        <CardDescription>
          Es de la empresa, no del mes: depende de su riesgo y se revisa cada
          dos años. Se registra desde el mes en que empieza a regir y queda
          vigente hasta el próximo cambio. La tasa básica legal va en cada
          período.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {tramos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay ninguna tasa registrada: no se puede calcular ninguna
            liquidación hasta registrarla.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desde</TableHead>
                  <TableHead>Hasta</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tramos.map((t) => (
                  <TableRow key={t.vigenteDesde}>
                    <TableCell className="capitalize">{mesDeFecha(t.vigenteDesde)}</TableCell>
                    <TableCell className="capitalize">
                      {t.vigenteHasta ? mesAnterior(t.vigenteHasta) : "Vigente"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {escribirDecimal(t.tasa)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form onSubmit={registrar} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mutual-mes">Rige desde</Label>
            <select
              id="mutual-mes"
              className={nativeSelectClassName + " capitalize"}
              value={mesElegido}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {nombreMes(i + 1)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mutual-anio">Año</Label>
            <Input
              id="mutual-anio"
              inputMode="numeric"
              className="w-24"
              value={anioTexto}
              onChange={(e) => setAnio(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mutual-tasa">Tasa (%)</Label>
            <Input
              id="mutual-tasa"
              inputMode="decimal"
              autoComplete="off"
              className="w-28"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={guardado.pendiente || !tasa.trim()}>
            <ContenidoBoton
              pendiente={guardado.pendiente}
              texto="Registrar"
              textoPendiente="Registrando…"
            />
          </Button>
          <IndicadorGuardado estado={guardado.estado} />
        </form>
        <p className="text-xs text-muted-foreground">
          Si ya hay una tasa que parte ese mismo mes, se corrige. Si el mes
          cae dentro de otra, esa termina el mes anterior.
        </p>
      </CardContent>
    </Card>
  );
}
