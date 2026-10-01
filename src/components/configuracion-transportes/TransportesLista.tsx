"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  agregarTransporte,
  cambiarActivoTransporte,
  renombrarTransporte,
} from "@/app/(app)/configuracion/transportes/actions";
import type { Transporte } from "@/lib/tipos";

export function TransportesLista({
  transportes,
}: {
  transportes: Transporte[];
}) {
  const [nombreNuevo, setNombreNuevo] = useState("");
  const guardadoAlta = useEstadoGuardado();

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreNuevo.trim() || guardadoAlta.pendiente) return;
    try {
      await guardadoAlta.ejecutar(async () => {
        const res = await agregarTransporte({ nombre: nombreNuevo });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Transporte agregado.");
      setNombreNuevo("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar.");
    }
  }

  const activos = transportes.filter((t) => t.activo);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TruckIcon className="size-5 text-brand-600" />
            <CardTitle>Agregar transporte</CardTitle>
          </div>
          <CardDescription>
            Se agrega activo — aparece de inmediato en el selector del
            formulario de inspecciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={agregar} className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nombre-transporte-nuevo">Nombre</Label>
              <Input
                id="nombre-transporte-nuevo"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                disabled={guardadoAlta.pendiente}
                placeholder="Nombre del transporte"
              />
            </div>
            <Button type="submit" disabled={guardadoAlta.pendiente}>
              <ContenidoBoton
                pendiente={guardadoAlta.pendiente}
                texto="Agregar"
                textoPendiente="Agregando…"
              />
            </Button>
            <IndicadorGuardado estado={guardadoAlta.estado} />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            {activos.length === 0
              ? "Sin transportes activos"
              : `${activos.length} transporte${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"}`}
            . Renombrar un transporte no modifica las inspecciones ya
            creadas — el nombre queda copiado en cada ticket al momento de
            crearlo, así que el cambio aplica solo a las inspecciones
            nuevas de acá en adelante.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transportes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay transportes en el catálogo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transportes.map((t) => (
                  <FilaTransporte key={t.id} t={t} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilaTransporte({ t }: { t: Transporte }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(t.nombre);
  const guardado = useEstadoGuardado();

  async function guardarNombre() {
    const nuevo = nombre.trim();
    if (!nuevo || nuevo === t.nombre) {
      setEditando(false);
      setNombre(t.nombre);
      return;
    }
    try {
      await guardado.ejecutar(async () => {
        const res = await renombrarTransporte({ id: t.id, nombre: nuevo });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Transporte renombrado. No afecta inspecciones ya creadas.");
      setEditando(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo renombrar.");
    }
  }

  async function toggleActivo() {
    try {
      await guardado.ejecutar(async () => {
        const res = await cambiarActivoTransporte({ id: t.id, activo: !t.activo });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(t.activo ? "Transporte desactivado." : "Transporte activado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {editando ? (
          <div className="flex items-center gap-2">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={guardado.pendiente}
              autoFocus
              className="h-8 w-48"
            />
          </div>
        ) : (
          t.nombre
        )}
      </TableCell>
      <TableCell>
        {t.activo ? (
          <Badge className="bg-success-100 text-success-700">Activo</Badge>
        ) : (
          <Badge className="bg-danger-100 text-danger-700">Inactivo</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <IndicadorGuardado estado={guardado.estado} />
          {editando ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={guardado.pendiente}
                onClick={guardarNombre}
              >
                <ContenidoBoton
                  pendiente={guardado.pendiente}
                  texto="Guardar"
                  textoPendiente="Guardando…"
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={guardado.pendiente}
                onClick={() => {
                  setEditando(false);
                  setNombre(t.nombre);
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={guardado.pendiente}
                onClick={() => setEditando(true)}
              >
                Renombrar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={guardado.pendiente}
                onClick={toggleActivo}
              >
                <ContenidoBoton
                  pendiente={guardado.pendiente}
                  texto={t.activo ? "Desactivar" : "Activar"}
                  textoPendiente={t.activo ? "Desactivando…" : "Activando…"}
                />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
