"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { anularAsignacion, corregirAsignacion, type Conflicto } from "@/app/(app)/rrhh/turnos/actions";
import { fechaCorta } from "@/lib/rrhh/ficha";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Fila = { id: string; persona: string; personalId: string; jornada: string; desde: string; hasta: string | null };

/** Asignaciones vigentes que tocan el mes, con Corregir y Anular. Nada se
 *  borra: ambas acciones exigen un motivo y quedan en el historial. */
export function AsignacionesMes({ filas }: { filas: Fila[] }) {
  const [abierta, setAbierta] = useState<{ id: string; modo: "corregir" | "anular" } | null>(null);
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Sin asignaciones en este mes.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Jornada</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead>Hasta</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <Link href={`/rrhh/${f.personalId}`} className="text-brand-700 underline underline-offset-4">
                  {f.persona}
                </Link>
              </TableCell>
              <TableCell>{f.jornada}</TableCell>
              <TableCell className="whitespace-nowrap">{fechaCorta(f.desde)}</TableCell>
              <TableCell className="whitespace-nowrap">{f.hasta ? fechaCorta(f.hasta) : "Sin término"}</TableCell>
              <TableCell className="min-w-64">
                {abierta?.id === f.id ? (
                  <Cambio fila={f} modo={abierta.modo} cerrar={() => setAbierta(null)} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setAbierta({ id: f.id, modo: "corregir" })}>
                      Corregir
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setAbierta({ id: f.id, modo: "anular" })}>
                      Anular
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Cambio({ fila, modo, cerrar }: { fila: Fila; modo: "corregir" | "anular"; cerrar: () => void }) {
  const [desde, setDesde] = useState(fila.desde);
  const [hasta, setHasta] = useState(fila.hasta ?? "");
  const [motivo, setMotivo] = useState("");
  const [choques, setChoques] = useState<Conflicto[]>([]);
  const guardado = useEstadoGuardado();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    setChoques([]);
    try {
      await guardado.ejecutar(async () => {
        if (modo === "anular") {
          const res = await anularAsignacion({ id: fila.id, motivo });
          if (!res.ok) throw new Error(res.mensaje);
        } else {
          const res = await corregirAsignacion({ id: fila.id, desde, hasta, motivo });
          if (!res.ok) {
            setChoques(res.conflictos ?? []);
            throw new Error(res.mensaje);
          }
        }
      });
      toast.success(modo === "anular" ? "Asignación anulada." : "Asignación corregida.");
      cerrar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-2">
      {modo === "corregir" && (
        <div className="flex flex-wrap gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`desde-${fila.id}`}>Desde</Label>
            <Input id={`desde-${fila.id}`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`hasta-${fila.id}`}>Hasta (vacío = sin término)</Label>
            <Input id={`hasta-${fila.id}`} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor={`motivo-${fila.id}`}>{modo === "anular" ? "Por qué se anula" : "Motivo del cambio"}</Label>
        <Input id={`motivo-${fila.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {choques.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-danger-700">
          {choques.map((c, i) => (
            <li key={i}>
              Choca con {c.jornada}, {c.hasta ? `del ${fechaCorta(c.desde)} al ${fechaCorta(c.hasta)}` : `desde el ${fechaCorta(c.desde)}`}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={modo === "anular" ? "destructive" : "default"} disabled={guardado.pendiente || !motivo.trim()}>
          <ContenidoBoton
            pendiente={guardado.pendiente}
            texto={modo === "anular" ? "Anular" : "Guardar"}
            textoPendiente="Guardando…"
          />
        </Button>
        <Button type="button" variant="ghost" onClick={cerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
