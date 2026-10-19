import type { Database } from "@/lib/supabase/database.types";

export type EstadoCotizacion = Database["public"]["Enums"]["cotizacion_estado"];

/**
 * Texto visible de cada estado, centralizado — mismo criterio que §2.12 pide
 * para los estados de inspección: el enum de la base no cambia, el label sí
 * puede, y no debe estar repetido en cada componente.
 */
export const ETIQUETA_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  nueva: "Sin responder",
  cotizada: "Cotizada",
  ganada: "Ganada",
  perdida: "Perdida",
};

/** Variante de Badge por estado. "Sin responder" va en `default` (el color
 *  de marca) a propósito: es lo único de esta pantalla que pide una acción. */
export const VARIANTE_ESTADO_COTIZACION: Record<
  EstadoCotizacion,
  "default" | "secondary" | "outline" | "destructive"
> = {
  nueva: "default",
  cotizada: "secondary",
  ganada: "outline",
  perdida: "destructive",
};
