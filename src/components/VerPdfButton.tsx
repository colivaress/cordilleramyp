"use client";

import { toast } from "sonner";
import { FileTextIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { useAccionLarga } from "@/hooks/use-accion-larga";

/**
 * "Ver / descargar PDF" — antes un <a target="_blank"> plano (§4): generar el
 * PDF en el servidor toma segundos y no daba ninguna señal, solo la pestaña
 * nueva del navegador abriéndose vacía. Nivel 2 (overlay) porque generar el
 * PDF es una acción larga y bloqueante — igual que "Enviar por correo".
 *
 * `window.open` se llama SÍNCRONO, dentro del mismo gesto del click (antes
 * del fetch) — así el navegador no lo bloquea como popup; se redirige esa
 * pestaña ya abierta al PDF una vez que está listo.
 */
export function VerPdfButton({
  ticketId,
  rev = "",
}: {
  ticketId: string;
  rev?: string;
}) {
  const guardado = useEstadoGuardado();
  const overlay = useAccionLarga();

  async function verPdf() {
    const ventana = window.open("", "_blank");
    try {
      await guardado.ejecutar(() =>
        overlay.ejecutar(async () => {
          const qs = rev ? `?rev=${encodeURIComponent(rev)}` : "";
          const res = await fetch(`/api/informe/${ticketId}/enviar${qs}`);
          if (!res.ok) throw new Error("No se pudo generar el PDF.");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (ventana) ventana.location.href = url;
          else window.open(url, "_blank");
        }, "Generando PDF…"),
      );
    } catch (e) {
      ventana?.close();
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={verPdf}
        disabled={guardado.pendiente}
        aria-busy={guardado.pendiente}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ContenidoBoton
          pendiente={guardado.pendiente}
          texto="Ver / descargar PDF"
          textoPendiente="Generando…"
          icono={FileTextIcon}
        />
      </button>
      <OverlayBloqueante visible={overlay.visible} mensaje={overlay.mensaje} />
    </>
  );
}
