"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  finalizarInspeccion,
  finalizarReinspeccion,
} from "@/app/(app)/tickets/actions";

/**
 * §2.8: si "Finalizar revisión" falló (página desactualizada, red, sesión) el
 * ticket queda en `en_revision` pero con el checklist y las firmas ya guardados.
 * Este botón cierra la revisión sobre esos datos, sin tener que rehacer nada.
 */
export function BotonFinalizarPendiente({
  ticketId,
  revisionNumero,
}: {
  ticketId: string;
  revisionNumero: number;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function finalizar() {
    setCargando(true);
    try {
      if (revisionNumero <= 1) await finalizarInspeccion({ ticketId });
      else await finalizarReinspeccion({ ticketId, revisionNumero });
      toast.success("Revisión finalizada. Generar y enviar el informe.");
      router.push(`/tickets/${ticketId}/report`);
      router.refresh();
    } catch (e) {
      setCargando(false);
      toast.error(
        e instanceof Error ? e.message : "No se pudo finalizar la revisión.",
      );
    }
  }

  return (
    <Button type="button" onClick={finalizar} disabled={cargando}>
      {cargando ? "Finalizando…" : "Finalizar revisión pendiente"}
    </Button>
  );
}
