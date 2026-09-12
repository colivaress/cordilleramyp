"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { useAccionLarga } from "@/hooks/use-accion-larga";
import {
  finalizarInspeccion,
  finalizarReinspeccion,
} from "@/app/(app)/tickets/actions";

/**
 * §2.8: si "Finalizar revisión" falló (página desactualizada, red, sesión) el
 * ticket queda en `en_revision` pero con el checklist y las firmas ya guardados.
 * Este botón cierra la revisión sobre esos datos, sin tener que rehacer nada.
 *
 * Mismo nivel 2 (overlay bloqueante, no descartable) que "Finalizar revisión"
 * en InspeccionForm — es la misma acción cara (cierra una inspección),
 * disparada desde otro lugar.
 */
export function BotonFinalizarPendiente({
  ticketId,
  revisionNumero,
}: {
  ticketId: string;
  revisionNumero: number;
}) {
  const router = useRouter();
  const guardado = useEstadoGuardado();
  const overlay = useAccionLarga();

  async function finalizar() {
    try {
      await guardado.ejecutar(() =>
        overlay.ejecutar(async () => {
          if (revisionNumero <= 1) await finalizarInspeccion({ ticketId });
          else await finalizarReinspeccion({ ticketId, revisionNumero });
          toast.success("Revisión finalizada. Generar y enviar el informe.");
          router.push(`/tickets/${ticketId}/report`);
          router.refresh();
        }, "Finalizando inspección…"),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo finalizar la revisión.",
      );
    }
  }

  return (
    <>
      <Button type="button" onClick={finalizar} disabled={guardado.pendiente}>
        <ContenidoBoton
          pendiente={guardado.pendiente}
          texto="Finalizar revisión pendiente"
          textoPendiente="Finalizando…"
        />
      </Button>
      <OverlayBloqueante visible={overlay.visible} mensaje={overlay.mensaje} />
    </>
  );
}
