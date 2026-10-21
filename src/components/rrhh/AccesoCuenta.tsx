"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { cambiarAcceso, reenviarInvitacion } from "@/app/(app)/rrhh/cuenta-actions";

/**
 * Estado del acceso a la app. Hay TRES formas de que alguien no trabaje y
 * no significan lo mismo; cada control dice su consecuencia, con el mismo
 * criterio del aviso de "sin ningún tipo de inspección":
 *   - sin tipos de inspección → entra, pero no ve ni hace inspecciones;
 *   - acceso suspendido (personal.activo = false) → no puede usar la app;
 *   - desvinculado (sección Desvinculación) → dejó la empresa; además corta
 *     el acceso, y solo "Reincorporar" lo devuelve.
 */
export function AccesoCuenta({
  personalId,
  esYo,
  activo,
  desvinculado,
  invitacionPendiente,
  antiguedadInvitacion,
}: {
  personalId: string;
  esYo: boolean;
  activo: boolean;
  desvinculado: boolean;
  invitacionPendiente: boolean;
  antiguedadInvitacion: string | null;
}) {
  const guardado = useEstadoGuardado();
  const [confirmando, setConfirmando] = useState(false);

  async function correr(fn: () => Promise<{ ok: boolean; mensaje?: string; aviso?: string }>, exito: string) {
    try {
      const r = await guardado.ejecutar(async () => {
        const res = await fn();
        if (!res.ok) throw new Error(res.mensaje);
        return res;
      });
      toast.success(exito);
      if (r.aviso) toast.warning(r.aviso, { duration: 8000 });
      setConfirmando(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Acceso a la app:</span>
        {desvinculado ? (
          <Badge className="bg-danger-100 text-danger-700">Sin acceso (desvinculado)</Badge>
        ) : !activo ? (
          <Badge className="bg-danger-100 text-danger-700">Acceso suspendido</Badge>
        ) : invitacionPendiente ? (
          <Badge className="bg-warning-100 text-warning-700">Invitación pendiente</Badge>
        ) : (
          <Badge className="bg-success-100 text-success-700">Activo</Badge>
        )}
        {invitacionPendiente && antiguedadInvitacion && (
          <span className="text-xs text-muted-foreground">enviada {antiguedadInvitacion}</span>
        )}
      </div>

      {desvinculado ? (
        <p className="text-xs text-muted-foreground">
          Al desvincularla se le cortó el acceso. Para devolvérselo, reincorpórala en la sección Desvinculación.
        </p>
      ) : activo ? (
        <div className="flex flex-wrap items-center gap-2">
          {invitacionPendiente && (
            <Button
              type="button"
              variant="outline"
              disabled={guardado.pendiente}
              onClick={() => correr(() => reenviarInvitacion(personalId), "Invitación reenviada.")}
            >
              Reenviar invitación
            </Button>
          )}
          {!esYo &&
            (confirmando ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={guardado.pendiente}
                  onClick={() => correr(() => cambiarAcceso({ personalId, activo: false }), "Acceso suspendido.")}
                >
                  <ContenidoBoton pendiente={guardado.pendiente} texto="Sí, suspender" textoPendiente="Suspendiendo…" />
                </Button>
                <Button type="button" variant="outline" disabled={guardado.pendiente} onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" disabled={guardado.pendiente} onClick={() => setConfirmando(true)}>
                Suspender acceso
              </Button>
            ))}
          <p className="basis-full text-xs text-muted-foreground">
            Suspender: no podrá usar la app aunque tenga la sesión abierta, pero sigue siendo parte de la empresa
            (no cambia de pestaña ni toca su contrato). Si dejó la empresa, usa Desvinculación.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={guardado.pendiente}
            onClick={() => correr(() => cambiarAcceso({ personalId, activo: true }), "Acceso devuelto.")}
          >
            <ContenidoBoton pendiente={guardado.pendiente} texto="Devolver acceso" textoPendiente="Guardando…" />
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            No puede usar la app hasta que se le devuelva el acceso.
          </p>
        </div>
      )}
    </div>
  );
}
