"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { desvincular, reincorporar } from "@/app/(app)/rrhh/actions";

/** Desvinculación = baja lógica (§16.8): la ficha, el historial de sueldo y
 *  los documentos se conservan; solo cambia de pestaña. No toca el acceso a
 *  la app (eso se maneja en Usuarios). */
export function Desvinculacion({
  personalId,
  desvinculado,
  hoy,
}: {
  personalId: string;
  desvinculado: boolean;
  hoy: string;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const guardado = useEstadoGuardado();

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = desvinculado
          ? await reincorporar(personalId)
          : await desvincular({ personalId, fecha, motivo });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(desvinculado ? "Trabajador reincorporado." : "Trabajador desvinculado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  if (desvinculado)
    return (
      <form onSubmit={ejecutar}>
        <Button type="submit" variant="outline" disabled={guardado.pendiente}>
          <ContenidoBoton pendiente={guardado.pendiente} texto="Reincorporar" textoPendiente="Reincorporando…" />
        </Button>
      </form>
    );

  return (
    <form onSubmit={ejecutar} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="desv-fecha">Fecha</Label>
        <Input id="desv-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="grid min-w-60 flex-1 gap-1.5">
        <Label htmlFor="desv-motivo">Motivo</Label>
        <Input id="desv-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: renuncia voluntaria" />
      </div>
      <Button type="submit" variant="destructive" disabled={guardado.pendiente || !motivo.trim()}>
        <ContenidoBoton pendiente={guardado.pendiente} texto="Desvincular" textoPendiente="Desvinculando…" />
      </Button>
    </form>
  );
}
