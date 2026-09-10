import type { Tables, Enums } from "@/lib/supabase/database.types";

export type Personal = Tables<"personal">;
export type Ticket = Tables<"tickets">;
export type TicketRevision = Tables<"ticket_revisiones">;
export type ChecklistItem = Tables<"checklist_items">;
export type ChecklistRespuesta = Tables<"ticket_checklist_respuestas">;
export type ChecklistFoto = Tables<"ticket_checklist_fotos">;
export type Notificacion = Tables<"notificaciones">;
export type DestinatarioCorreo = Tables<"destinatarios_correo">;
export type TipoInspeccion = Tables<"tipos_inspeccion">;

export type TicketEstado = Enums<"ticket_estado">;
export type ItemEstado = Enums<"item_estado">;
export type ItemModo = Enums<"item_modo">;
export type RolUsuario = Enums<"rol_usuario">;
export type NotificacionTipo = Enums<"notificacion_tipo">;

/**
 * Etiquetas cortas del combo "Tipo de inspección" (formulario de nueva
 * inspección) — a propósito NO son `tipos_inspeccion.titulo` (ese es el
 * título completo del informe/PDF, un texto distinto y más largo). El orden
 * es el orden en que deben aparecer las opciones del combo, no el orden en
 * que están las filas en la base.
 */
export const ORDEN_TIPOS_INSPECCION = [
  "control_salida",
  "encarpe",
  "exportacion_chimolsa",
  "desencarpe",
] as const;

export const ETIQUETA_TIPO_INSPECCION: Record<string, string> = {
  control_salida: "Control de Salida",
  encarpe: "Encarpe",
  exportacion_chimolsa: "Exportación (Chimolsa)",
  desencarpe: "Desencarpe",
};

/** Estado derivado de vencimiento (no persistido) — §3. */
export type EstadoVencimiento = "vigente" | "por_vencer" | "vencido";

/** Nivel de alerta visual — §3 (umbrales 48h / 24h). */
export type NivelAlerta = "ninguno" | "amarillo" | "naranja" | "vencido";

// §2.12: SOLO texto visible. Los valores del enum en la columna `tickets.estado`
// (`finalizada_con_observaciones`, `finalizada_sin_observaciones`) NO cambian —
// filtros por query, RLS y lógica de negocio siguen usándolos igual.
export const ETIQUETA_ESTADO: Record<TicketEstado, string> = {
  en_revision: "En revisión",
  finalizada_con_observaciones: "Con observaciones",
  en_reparacion_de_observaciones: "En reparación de observaciones",
  finalizada_sin_observaciones: "Finalizado",
};

export const ETIQUETA_ITEM: Record<ItemEstado, string> = {
  conforme: "Conforme",
  no_conforme: "No conforme",
  no_aplica: "No aplica",
};
