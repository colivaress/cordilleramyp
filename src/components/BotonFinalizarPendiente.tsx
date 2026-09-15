"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { useAccionLarga } from "@/hooks/use-accion-larga";
import { useEsperaNavegacion } from "@/hooks/use-espera-navegacion";
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
  const esperarNavegacionInforme = useEsperaNavegacion();

  async function finalizar() {
    try {
      await guardado.ejecutar(() =>
        overlay.ejecutar(async () => {
          // finalizarInspeccion/finalizarReinspeccion ya revalidan /dashboard y
          // /tickets/[id] en el servidor — un router.refresh() acá duplicaría
          // la carga completa de /report sin invalidar nada más.
          if (revisionNumero <= 1) await finalizarInspeccion({ ticketId });
          else await finalizarReinspeccion({ ticketId, revisionNumero });
          toast.success("Revisión finalizada. Generar y enviar el informe.");
          router.push(`/tickets/${ticketId}/report`);
          // Mismo patrón que InspeccionForm: el overlay se queda hasta que
          // el informe esté en pantalla, no hasta acá — ver useEsperaNavegacion.
          await esperarNavegacionInforme();
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
