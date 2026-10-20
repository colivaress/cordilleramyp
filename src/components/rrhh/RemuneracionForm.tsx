"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { ListaErrores } from "@/components/rrhh/ListaErrores";
import { registrarRemuneracion } from "@/app/(app)/rrhh/actions";
import { leerRemuneracion, type FormularioRemuneracion } from "@/lib/rrhh/ficha";

/**
 * Registrar un cambio de sueldo (solo administrador; la pantalla ni lo
 * muestra al administrador de contrato, y la acción y la RLS lo rechazan).
 * Nunca sobrescribe: agrega una fila al historial con vigencia y motivo.
 */
export function RemuneracionForm({
  personalId,
  inicial,
}: {
  personalId: string;
  inicial: FormularioRemuneracion;
}) {
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const guardado = useEstadoGuardado();
  const set = (k: keyof FormularioRemuneracion, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    const local = leerRemuneracion(f);
    if (!local.ok) {
      setErrores(local.errores);
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res = await registrarRemuneracion(personalId, f);
        if (!res.ok) {
          if ("errores" in res) setErrores(res.errores);
          throw new Error(res.mensaje);
        }
      });
      toast.success("Cambio de sueldo registrado.");
      setF((x) => ({ ...x, comentario: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="rem-desde">Rige desde (mes)</Label>
          <Input id="rem-desde" type="month" value={f.vigente_desde} onChange={(e) => set("vigente_desde", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rem-liquido">Líquido pactado</Label>
          <Input id="rem-liquido" inputMode="numeric" autoComplete="off" placeholder="$" value={f.liquido_pactado} onChange={(e) => set("liquido_pactado", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rem-colacion">Colación</Label>
          <Input id="rem-colacion" inputMode="numeric" autoComplete="off" placeholder="0 si no tiene" value={f.colacion} onChange={(e) => set("colacion", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rem-movilizacion">Movilización</Label>
          <Input id="rem-movilizacion" inputMode="numeric" autoComplete="off" placeholder="0 si no tiene" value={f.movilizacion} onChange={(e) => set("movilizacion", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rem-comentario">Motivo del cambio</Label>
        <Textarea id="rem-comentario" rows={2} value={f.comentario} onChange={(e) => set("comentario", e.target.value)} placeholder="Por ejemplo: sueldo de ingreso, reajuste anual, cambio de cargo" />
      </div>
      <p className="text-xs text-muted-foreground">
        El líquido pactado corresponde a un mes completo sin ítems variables:
        las horas extra y los bonos se suman aparte, y una licencia o
        inasistencia lo reduce. El bruto que lo produce se calcula en cada
        liquidación.
      </p>
      <ListaErrores errores={errores} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardado.pendiente}>
          <ContenidoBoton pendiente={guardado.pendiente} texto="Registrar cambio" textoPendiente="Registrando…" />
        </Button>
        <IndicadorGuardado estado={guardado.estado} />
      </div>
    </form>
  );
}
