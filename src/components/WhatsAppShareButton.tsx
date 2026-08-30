"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

/** ¿El navegador puede compartir archivos con la Web Share API? (client-only). */
function soportaCompartirArchivos(): boolean {
  try {
    const prueba = new File([new Blob()], "prueba.pdf", {
      type: "application/pdf",
    });
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [prueba] })
    );
  } catch {
    return false;
  }
}

const suscribir = () => () => {};

/**
 * §4.2 — "Enviar por WhatsApp" del informe. Usa la Web Share API nativa del
 * navegador (`navigator.share`), no la API de Meta (§3.1). Genera el mismo PDF
 * del informe (§4.1), lo adjunta como `File` y abre el panel de "Compartir" del
 * dispositivo. En escritorio la mayoría de los navegadores no soportan compartir
 * archivos: el botón se muestra deshabilitado con un tooltip.
 */
export function WhatsAppShareButton({
  ticketId,
  transporte,
  patenteCamion,
  nombreArchivo,
}: {
  ticketId: string;
  transporte: string;
  patenteCamion: string;
  nombreArchivo: string;
}) {
  // SSR -> false; en el cliente, la capacidad real (sin mismatch de hidratación).
  const soportado = useSyncExternalStore(
    suscribir,
    soportaCompartirArchivos,
    () => false,
  );
  const [ocupado, setOcupado] = useState(false);

  async function compartir() {
    setOcupado(true);
    try {
      const res = await fetch(`/api/informe/${ticketId}/enviar`);
      if (!res.ok) throw new Error(`No se pudo generar el PDF (${res.status}).`);
      const blob = await res.blob();
      const archivo = new File([blob], nombreArchivo, {
        type: "application/pdf",
      });

      if (!navigator.canShare?.({ files: [archivo] })) {
        toast.error(
          "Este dispositivo no permite compartir el archivo por WhatsApp.",
        );
        return;
      }

      await navigator.share({
        files: [archivo],
        title: `Informe de Inspección — ${transporte} ${patenteCamion}`,
        text: `Se realiza Check List a camión de transportes ${transporte}.`,
      });
    } catch (e) {
      // Cancelar el panel de compartir es un flujo normal, no un error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        e instanceof Error ? e.message : "No se pudo compartir el informe.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={compartir}
      disabled={!soportado || ocupado}
      title={
        soportado
          ? undefined
          : "Compartir por WhatsApp solo está disponible desde el celular"
      }
      className="border-alert-300 text-alert-700 hover:bg-alert-50"
    >
      <WhatsAppIcon className="size-4" />
      {ocupado ? "Preparando…" : "Enviar por WhatsApp"}
    </Button>
  );
}
