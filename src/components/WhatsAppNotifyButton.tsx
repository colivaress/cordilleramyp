"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { createClient } from "@/lib/supabase/client";
import {
  construirMensajeVencimiento,
  enlaceWhatsApp,
  type FallaResumen,
} from "@/lib/mensajes";
import { puedeNotificarVencimiento } from "@/lib/vencimiento";
import type { TicketEstado } from "@/lib/tipos";

export function WhatsAppNotifyButton({
  ticketId,
  numeroInspeccion,
  numeroRevision,
  patenteCamion,
  patenteRampla,
  transporte,
  conductor,
  supervisorTelefono,
  supervisorNombre,
  fallas,
  fechaVencimiento,
  estadoTicket,
}: {
  ticketId: string;
  numeroInspeccion: number;
  numeroRevision: number;
  patenteCamion: string;
  patenteRampla: string;
  transporte?: string | null;
  conductor?: string | null;
  supervisorTelefono?: string | null;
  supervisorNombre?: string | null;
  fallas: FallaResumen[];
  fechaVencimiento: string | null;
  estadoTicket: TicketEstado;
}) {
  const [enviando, setEnviando] = useState(false);

  // §3: el botón solo aplica en estado "por vencer" o "vencido".
  if (!puedeNotificarVencimiento(fechaVencimiento, estadoTicket)) return null;

  const deshabilitado = !supervisorTelefono;

  async function notificar() {
    if (!supervisorTelefono) return;
    setEnviando(true);
    const mensaje = construirMensajeVencimiento({
      numeroInspeccion,
      numeroRevision,
      patenteCamion,
      patenteRampla,
      transporte,
      conductor,
      fallas,
      fechaVencimiento,
      supervisorNombre,
    });
    window.open(enlaceWhatsApp(supervisorTelefono, mensaje), "_blank", "noopener,noreferrer");

    const supabase = createClient();
    const { error } = await supabase.from("notificaciones").insert({
      ticket_id: ticketId,
      tipo: "whatsapp",
      destinatario: supervisorTelefono,
      contenido: mensaje,
    });
    setEnviando(false);
    if (error) {
      toast.error("Se abrió WhatsApp pero no se pudo registrar la notificación.");
      return;
    }
    toast.success("Notificación de vencimiento registrada.");
  }

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="outline"
      disabled={deshabilitado || enviando}
      onClick={notificar}
      aria-label="Notificar por WhatsApp"
      title={
        deshabilitado
          ? "El supervisor a cargo no tiene teléfono cargado"
          : "Notificar por WhatsApp"
      }
      className="border-alert-300 text-alert-700 hover:bg-alert-50"
    >
      <WhatsAppIcon className="size-4" />
    </Button>
  );
}
