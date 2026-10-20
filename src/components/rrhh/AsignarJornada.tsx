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
import { asignarJornada } from "@/app/(app)/rrhh/actions";

/** Asigna una jornada desde una fecha. Las asignaciones anteriores quedan:
 *  un cambio de turno no reescribe los meses ya liquidados (§8). */
export function AsignarJornada({
  personalId,
  jornadas,
  hoy,
}: {
  personalId: string;
  jornadas: { id: string; nombre: string; horas: number }[];
  hoy: string;
}) {
  const [jornadaId, setJornada] = useState("");
  const [desde, setDesde] = useState(hoy);
  const guardado = useEstadoGuardado();

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = await asignarJornada({ personalId, jornadaId, vigenteDesde: desde });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Jornada asignada.");
      setJornada("");
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
    <form onSubmit={asignar} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="jornada-id">Jornada</Label>
        <select id="jornada-id" className={nativeSelectClassName} value={jornadaId} onChange={(e) => setJornada(e.target.value)}>
          <option value="">Elegir…</option>
          {jornadas.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nombre} ({String(j.horas).replace(".", ",")} h)
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="jornada-desde">Rige desde</Label>
        <Input id="jornada-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <Button type="submit" disabled={guardado.pendiente || !jornadaId}>
        <ContenidoBoton pendiente={guardado.pendiente} texto="Asignar" textoPendiente="Asignando…" />
      </Button>
    </form>
  );
}
