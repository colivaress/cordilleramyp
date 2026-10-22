"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { ListaErrores } from "@/components/rrhh/ListaErrores";
import { asignarTurno, type Conflicto } from "@/app/(app)/rrhh/turnos/actions";
import { fechaCorta } from "@/lib/rrhh/ficha";
import { leerTurno } from "@/lib/rrhh/turnos";

type Rango = { desde: string; hasta: string };

/**
 * Asignación masiva: una jornada, un rango y las personas marcadas. Todo o
 * nada (ver asignarTurno): si alguien choca, no se guarda nada y se lista
 * quién choca con qué, para que quien asigna decida.
 */
export function AsignarTurno({
  jornadas,
  personas,
  semana,
  mes,
}: {
  jornadas: { id: string; nombre: string; horas: number }[];
  personas: { id: string; nombre: string }[];
  semana: Rango;
  mes: Rango;
}) {
  const [jornadaId, setJornada] = useState("");
  const [desde, setDesde] = useState(semana.desde);
  const [hasta, setHasta] = useState(semana.hasta);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [choques, setChoques] = useState<Conflicto[]>([]);
  const guardado = useEstadoGuardado();

  const visibles = new Set(personas.map((p) => p.id));
  // Si cambia el filtro de faena, solo cuentan los marcados que siguen en la lista.
  const seleccion = marcados.filter((id) => visibles.has(id));
  const todos = personas.length > 0 && seleccion.length === personas.length;

  function rango(r: Rango) {
    setDesde(r.desde);
    setHasta(r.hasta);
  }

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    const formulario = { jornadaId, desde, hasta, personalIds: seleccion };
    const local = leerTurno(formulario);
    setChoques([]);
    if (!local.ok) {
      setErrores(local.errores);
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res = await asignarTurno(formulario);
        if (!res.ok) {
          setErrores(res.errores ?? []);
          setChoques(res.conflictos ?? []);
          throw new Error(res.mensaje);
        }
        toast.success(res.asignadas === 1 ? "Turno asignado a 1 persona." : `Turno asignado a ${res.asignadas} personas.`);
      });
      setMarcados([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo asignar.");
    }
  }

  if (jornadas.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No hay jornadas activas.{" "}
        <Link href="/rrhh/jornadas" className="text-brand-700 underline underline-offset-4">
          Crea una en Jornadas
        </Link>
        .
      </p>
    );

  return (
    <form onSubmit={asignar} className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="turno-jornada">Jornada</Label>
          <select id="turno-jornada" className={nativeSelectClassName} value={jornadaId} onChange={(e) => setJornada(e.target.value)}>
            <option value="">Elegir…</option>
            {jornadas.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre} ({String(j.horas).replace(".", ",")} h)
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="turno-desde">Desde</Label>
          <Input id="turno-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="turno-hasta">Hasta</Label>
          <Input id="turno-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => rango(semana)}>
            Esta semana
          </Button>
          <Button type="button" variant="outline" onClick={() => rango(mes)}>
            Este mes
          </Button>
          <Button type="button" variant="outline" onClick={() => setHasta("")}>
            Sin término
          </Button>
        </div>
      </div>
      {!hasta && (
        <p className="text-xs text-muted-foreground">
          Sin fecha de término la jornada rige hasta nuevo aviso. Para rotar después, habrá que cerrarla primero.
        </p>
      )}

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Trabajadores ({seleccion.length} de {personas.length})</legend>
        {personas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay personas con contrato vigente para mostrar. Solo se asignan turnos a quien tiene contrato registrado.
          </p>
        ) : (
          <div className="grid gap-1 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-3">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={todos}
                onChange={(e) => setMarcados(e.target.checked ? personas.map((p) => p.id) : [])}
              />
              Marcar todos
            </label>
            {personas.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-600"
                  checked={seleccion.includes(p.id)}
                  onChange={(e) =>
                    setMarcados((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))
                  }
                />
                {p.nombre}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <ListaErrores errores={errores} />
      {choques.length > 0 && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          <p className="font-medium">No se asignó a nadie. Estas personas ya tienen jornada en esas fechas:</p>
          <ul className="mt-1 list-disc pl-5">
            {choques.map((c, i) => (
              <li key={i}>
                {c.persona}: {c.jornada}, {c.hasta ? `del ${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}` : `desde el ${fechaCorta(c.desde)}, hasta nuevo aviso`}
              </li>
            ))}
          </ul>
          <p className="mt-1">Desmárcalas, o corrige o anula esas asignaciones abajo, y vuelve a asignar.</p>
        </div>
      )}

      <div>
        <Button type="submit" disabled={guardado.pendiente || !jornadaId || seleccion.length === 0}>
          <ContenidoBoton pendiente={guardado.pendiente} texto="Asignar turno" textoPendiente="Asignando…" />
        </Button>
      </div>
    </form>
  );
}
