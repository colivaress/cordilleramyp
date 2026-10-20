"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { ListaErrores } from "@/components/rrhh/ListaErrores";
import { cambiarActivoJornada, crearJornada } from "@/app/(app)/rrhh/jornadas/actions";
import {
  NOMBRE_DIA,
  describirDias,
  formularioJornadaVacio,
  horasSemanales,
  leerFormularioJornada,
  type DiaJornada,
} from "@/lib/rrhh/jornadas";

type Jornada = { id: string; nombre: string; activo: boolean; dias: DiaJornada[]; asignados: number };

export function JornadasGestion({ jornadas }: { jornadas: Jornada[] }) {
  const [f, setF] = useState(formularioJornadaVacio);
  const [errores, setErrores] = useState<string[]>([]);
  const guardado = useEstadoGuardado();
  const previa = leerFormularioJornada(f);

  const setDia = (i: number, cambio: Partial<(typeof f.dias)[number]>) =>
    setF((x) => ({ ...x, dias: x.dias.map((d, j) => (j === i ? { ...d, ...cambio } : d)) }));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    if (!previa.ok) {
      setErrores(previa.errores);
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res = await crearJornada(f);
        if (!res.ok) {
          if ("errores" in res) setErrores(res.errores);
          throw new Error(res.mensaje);
        }
      });
      toast.success("Jornada creada.");
      setF(formularioJornadaVacio());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear.");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nueva jornada</CardTitle>
          <CardDescription>
            Marca los días que se trabajan, con entrada, salida y minutos de
            colación. Una vez creada, su horario no se puede cambiar: para otro
            turno se crea otra jornada y se asigna desde una fecha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={crear} className="grid gap-4">
            <div className="grid max-w-sm gap-1.5">
              <Label htmlFor="jornada-nombre">Nombre</Label>
              <Input id="jornada-nombre" value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} placeholder="Por ejemplo: Turno mañana" />
            </div>
            <div className="grid gap-2">
              {f.dias.map((d, i) => (
                <fieldset key={d.dia} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_1fr]">
                  <legend className="sr-only">{NOMBRE_DIA[d.dia]}</legend>
                  <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-1">
                    <input type="checkbox" className="size-5 accent-brand-600" checked={d.trabaja} onChange={(e) => setDia(i, { trabaja: e.target.checked })} />
                    {NOMBRE_DIA[d.dia]}
                  </label>
                  {d.trabaja && (
                    <>
                      <div className="grid gap-1">
                        <Label htmlFor={`j-${d.dia}-entrada`} className="text-xs">Entrada</Label>
                        <Input id={`j-${d.dia}-entrada`} type="time" value={d.entrada} onChange={(e) => setDia(i, { entrada: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`j-${d.dia}-salida`} className="text-xs">Salida</Label>
                        <Input id={`j-${d.dia}-salida`} type="time" value={d.salida} onChange={(e) => setDia(i, { salida: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`j-${d.dia}-colacion`} className="text-xs">Colación (min)</Label>
                        <Input id={`j-${d.dia}-colacion`} inputMode="numeric" value={d.colacion} onChange={(e) => setDia(i, { colacion: e.target.value })} />
                      </div>
                    </>
                  )}
                </fieldset>
              ))}
            </div>
            {previa.ok && (
              <p className="text-sm">
                Total: <span className="font-semibold">{String(horasSemanales(previa.valor.dias)).replace(".", ",")} horas semanales</span>
              </p>
            )}
            <ListaErrores errores={errores} />
            <div>
              <Button type="submit" disabled={guardado.pendiente}>
                <ContenidoBoton pendiente={guardado.pendiente} texto="Crear jornada" textoPendiente="Creando…" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jornadas</CardTitle>
          <CardDescription>
            Desactivar una jornada solo la saca del selector; quien ya la tiene
            asignada la conserva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jornadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay jornadas.</p>
          ) : (
            <ul className="grid gap-2">
              {jornadas.map((j) => (
                <FilaJornada key={j.id} j={j} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilaJornada({ j }: { j: Jornada }) {
  const guardado = useEstadoGuardado();
  async function alternar() {
    try {
      await guardado.ejecutar(async () => {
        const res = await cambiarActivoJornada({ id: j.id, activo: !j.activo });
        if (!res.ok) throw new Error(res.mensaje);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="text-sm">
        <span className="font-medium">{j.nombre}</span> · {String(horasSemanales(j.dias)).replace(".", ",")} h semanales ·{" "}
        {j.asignados} {j.asignados === 1 ? "trabajador" : "trabajadores"}{" "}
        {j.activo ? (
          <Badge className="bg-success-100 text-success-700">Activa</Badge>
        ) : (
          <Badge className="bg-neutral-100 text-neutral-700">Inactiva</Badge>
        )}
        <span className="block text-xs text-muted-foreground">{describirDias(j.dias)}</span>
      </div>
      <Button type="button" variant="outline" disabled={guardado.pendiente} onClick={alternar}>
        {j.activo ? "Desactivar" : "Activar"}
      </Button>
    </li>
  );
}
