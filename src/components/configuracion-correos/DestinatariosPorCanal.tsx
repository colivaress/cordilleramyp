"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlertIcon, UserPlusIcon } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  agregarDestinatario,
  cambiarActivoDestinatario,
  quitarDeTipo,
  type CanalCorreo,
} from "@/app/(app)/configuracion/correos/actions";
import type { DestinatarioCorreo } from "@/lib/tipos";

// Mismo patrón de validación que src/app/api/informe/[id]/enviar/route.ts
// (EMAIL_RE) — cliente y servidor tienen que aceptar/rechazar lo mismo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El título de tipos_inspeccion es el del informe/PDF ("Informe de
 *  Inspección Control de Salida") — para un encabezado de sección alcanza
 *  con la parte específica. Transform de texto sobre el dato real de la
 *  base, no una tabla de nombres hardcodeada por clave. */
function tituloCorto(titulo: string): string {
  return titulo.replace(/^Informe de Inspección\s+/i, "");
}

// Consecuencia concreta cuando la lista de un tipo queda vacía — no un
// guion ni un "0" (requisito explícito). Solo se tiene texto de dominio real
// para Control de Salida/Informes (lo dio el usuario: el guardia de
// portería no tiene con qué contrastar el camión); el resto usa un texto
// genérico pero igual de concreto sobre QUÉ se rompe, sin inventar un detalle
// operativo que no se conoce. Con fallback: un tipo nuevo en la base que no
// esté en este mapa igual muestra la versión genérica, nunca se rompe.
const CONSECUENCIA_INFORMES: Record<string, string> = {
  control_salida:
    "Nadie va a recibir el informe de Control de Salida — el guardia de portería no va a tener con qué contrastar el camión que tiene delante.",
};

function consecuenciaVacio(canal: CanalCorreo, tipoClave: string, tituloCortoTipo: string): string {
  if (canal === "informes") {
    return (
      CONSECUENCIA_INFORMES[tipoClave] ??
      `Sin destinatarios, "Enviar por correo" de ${tituloCortoTipo} no tiene a quién mandarle nada — nadie fuera de Cordillera M&P va a recibir ese informe.`
    );
  }
  return `Sin destinatarios externos, el aviso de vencimiento de ${tituloCortoTipo} solo llega a administradores y al supervisor del ticket — nadie fuera de Cordillera M&P se entera.`;
}

type Tipo = { clave: string; titulo: string };

export function DestinatariosPorCanal({
  canal,
  tipos,
  porTipo,
}: {
  canal: CanalCorreo;
  tipos: Tipo[];
  /** clave de tipo_inspeccion -> destinatarios habilitados para este canal en ese tipo. */
  porTipo: Record<string, DestinatarioCorreo[]>;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {canal === "informes" ? "Informes" : "Alertas"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {canal === "informes"
            ? 'Quién puede recibir el informe de cada tipo cuando alguien lo envía desde "Enviar por correo".'
            : "Quién más recibe el aviso cuando una inspección está por vencer (48h, 24h y al vencer), además de administradores y el supervisor del ticket."}
        </p>
        {canal === "vencimientos" && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              Los administradores activos y el supervisor del ticket ya
              reciben este aviso automáticamente por su rol — eso{" "}
              <strong>no se configura acá</strong>. Esta lista es solo para
              agregar destinatarios externos adicionales, por tipo de
              inspección.
            </span>
          </div>
        )}
      </div>

      {tipos.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay tipos de inspección cargados en tipos_inspeccion.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tipos.map((t) => (
            <SeccionTipo
              key={t.clave}
              canal={canal}
              tipo={t}
              destinatarios={porTipo[t.clave] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SeccionTipo({
  canal,
  tipo,
  destinatarios,
}: {
  canal: CanalCorreo;
  tipo: Tipo;
  destinatarios: DestinatarioCorreo[];
}) {
  const corto = tituloCorto(tipo.titulo);
  const activos = destinatarios.filter((d) => d.activo);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const guardado = useEstadoGuardado();

  const emailValido = EMAIL_RE.test(email.trim());
  const yaEnLaLista = destinatarios.some(
    (d) => d.email.toLowerCase() === email.trim().toLowerCase(),
  );
  const formValido = nombre.trim() && emailValido && !yaEnLaLista;

  function abrir() {
    setNombre("");
    setEmail("");
    setCargo("");
    setAbierto(true);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!formValido || guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = await agregarDestinatario({
          nombre,
          email,
          cargo,
          tipoInspeccion: tipo.clave,
          canal,
        });
        if (!res.ok) throw new Error(res.mensaje);
        setAbierto(false);
        toast.success(`Agregado a ${corto}.`);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{corto}</CardTitle>
            <CardDescription>
              {activos.length === 0
                ? "Sin destinatarios activos"
                : `${activos.length} destinatario${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"}`}
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={abrir}>
            <UserPlusIcon />
            Agregar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {activos.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{consecuenciaVacio(canal, tipo.clave, corto)}</span>
          </div>
        )}

        {destinatarios.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinatarios.map((d) => (
                  <FilaDestinatario
                    key={d.id}
                    destinatario={d}
                    canal={canal}
                    tipoClave={tipo.clave}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar destinatario — {corto}</DialogTitle>
            <DialogDescription>
              {canal === "informes"
                ? `Va a poder recibir el informe de ${corto} cuando alguien lo envíe. No afecta a los demás tipos.`
                : `Va a recibir el aviso de vencimiento de ${corto}. No afecta a los demás tipos.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={guardar} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`nombre-${canal}-${tipo.clave}`}>Nombre</Label>
              <Input
                id={`nombre-${canal}-${tipo.clave}`}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`email-${canal}-${tipo.clave}`}>Correo</Label>
              <Input
                id={`email-${canal}-${tipo.clave}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {email.trim() && !emailValido && (
                <span className="text-xs font-medium text-danger-700">
                  El correo no tiene un formato válido.
                </span>
              )}
              {yaEnLaLista && (
                <span className="text-xs font-medium text-danger-700">
                  Ese correo ya está en esta lista.
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cargo-${canal}-${tipo.clave}`}>
                Cargo (opcional)
              </Label>
              <Input
                id={`cargo-${canal}-${tipo.clave}`}
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAbierto(false)}
                disabled={guardado.pendiente}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!formValido || guardado.pendiente}>
                <ContenidoBoton
                  pendiente={guardado.pendiente}
                  texto="Agregar"
                  textoPendiente="Agregando…"
                />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Fila con su PROPIA instancia de useEstadoGuardado — mismo motivo que
 *  FilaUsuario en UsuariosTabla.tsx: compartir un solo estado "pendiente"
 *  entre filas apaga los botones de las demás cuando una está guardando. */
function FilaDestinatario({
  destinatario: d,
  canal,
  tipoClave,
}: {
  destinatario: DestinatarioCorreo;
  canal: CanalCorreo;
  tipoClave: string;
}) {
  const guardado = useEstadoGuardado();

  async function quitar() {
    try {
      await guardado.ejecutar(async () => {
        const res = await quitarDeTipo({
          destinatarioId: d.id,
          tipoInspeccion: tipoClave,
          canal,
        });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(`${d.nombre} sacado de esta lista.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar.");
    }
  }

  async function toggleActivo() {
    try {
      await guardado.ejecutar(async () => {
        const res = await cambiarActivoDestinatario({ id: d.id, activo: !d.activo });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(d.activo ? "Destinatario desactivado." : "Destinatario activado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {d.nombre}
        {d.cargo ? (
          <span className="text-muted-foreground"> · {d.cargo}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-xs">{d.email}</TableCell>
      <TableCell>
        {d.activo ? (
          <Badge className="bg-success-100 text-success-700">Activo</Badge>
        ) : (
          <Badge className="bg-danger-100 text-danger-700">Inactivo</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <IndicadorGuardado estado={guardado.estado} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={guardado.pendiente}
            onClick={quitar}
          >
            <ContenidoBoton
              pendiente={guardado.pendiente}
              texto="Quitar"
              textoPendiente="Quitando…"
            />
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
              texto={d.activo ? "Desactivar" : "Activar"}
              textoPendiente={d.activo ? "Desactivando…" : "Activando…"}
            />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
