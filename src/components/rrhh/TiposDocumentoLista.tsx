"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import {
  agregarTipoDocumento,
  cambiarActivoTipoDocumento,
  renombrarTipoDocumento,
} from "@/app/(app)/rrhh/tipos-documento/actions";

type Tipo = { id: string; nombre: string; activo: boolean; documentos: number };

export function TiposDocumentoLista({ tipos }: { tipos: Tipo[] }) {
  const [nombre, setNombre] = useState("");
  const guardado = useEstadoGuardado();

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = await agregarTipoDocumento({ nombre });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Tipo agregado.");
      setNombre("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar.");
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={agregar} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo-nuevo">Nuevo tipo</Label>
          <Input id="tipo-nuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <Button type="submit" disabled={guardado.pendiente || !nombre.trim()}>
          <ContenidoBoton pendiente={guardado.pendiente} texto="Agregar" textoPendiente="Agregando…" />
        </Button>
      </form>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Documentos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tipos.map((t) => (
              <FilaTipo key={t.id} t={t} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilaTipo({ t }: { t: Tipo }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(t.nombre);
  const guardado = useEstadoGuardado();

  async function correr(accion: () => Promise<{ ok: boolean; mensaje?: string }>, exito: string) {
    try {
      await guardado.ejecutar(async () => {
        const res = await accion();
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(exito);
      setEditando(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {editando ? <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className="w-56" /> : t.nombre}
      </TableCell>
      <TableCell className="text-right tabular-nums">{t.documentos}</TableCell>
      <TableCell>
        {t.activo ? (
          <Badge className="bg-success-100 text-success-700">Activo</Badge>
        ) : (
          <Badge className="bg-neutral-100 text-neutral-700">Inactivo</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-2">
          {editando ? (
            <Button
              type="button"
              disabled={guardado.pendiente}
              onClick={() => correr(() => renombrarTipoDocumento({ id: t.id, nombre }), "Tipo renombrado.")}
            >
              Guardar
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditando(true)}>
              Renombrar
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={guardado.pendiente}
            onClick={() =>
              correr(
                () => cambiarActivoTipoDocumento({ id: t.id, activo: !t.activo }),
                t.activo ? "Tipo desactivado." : "Tipo activado.",
              )
            }
          >
            {t.activo ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
