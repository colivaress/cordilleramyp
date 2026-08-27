import type { Tables, Enums } from "@/lib/supabase/database.types";

export type Personal = Tables<"personal">;
export type Ticket = Tables<"tickets">;
export type TicketRevision = Tables<"ticket_revisiones">;
export type ChecklistItem = Tables<"checklist_items">;
export type ChecklistRespuesta = Tables<"ticket_checklist_respuestas">;
export type Notificacion = Tables<"notificaciones">;
export type DestinatarioCorreo = Tables<"destinatarios_correo">;

export type TicketEstado = Enums<"ticket_estado">;
export type ItemEstado = Enums<"item_estado">;
export type RolUsuario = Enums<"rol_usuario">;
export type NotificacionTipo = Enums<"notificacion_tipo">;

/** Estado derivado de vencimiento (no persistido) — §3. */
export type EstadoVencimiento = "vigente" | "por_vencer" | "vencido";

/** Nivel de alerta visual — §3 (umbrales 48h / 24h). */
export type NivelAlerta = "ninguno" | "amarillo" | "naranja" | "vencido";

export const ETIQUETA_ESTADO: Record<TicketEstado, string> = {
  en_revision: "En revisión",
  finalizada_con_observaciones: "Finalizada con observaciones",
  en_reparacion_de_observaciones: "En reparación de observaciones",
  finalizada_sin_observaciones: "Finalizada sin observaciones",
};

export const ETIQUETA_ITEM: Record<ItemEstado, string> = {
  conforme: "Conforme",
  no_conforme: "No conforme",
  no_aplica: "No aplica",
};
