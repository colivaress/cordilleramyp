import { cn } from "@/lib/utils";
import { ETIQUETA_ESTADO, type TicketEstado } from "@/lib/tipos";

// §6: un color fijo por estado, par -100/-700 (fondo/texto) para contraste legible.
const CLASES: Record<TicketEstado, string> = {
  en_revision: "bg-neutral-100 text-neutral-700",
  finalizada_con_observaciones: "bg-warning-100 text-warning-700",
  en_reparacion_de_observaciones: "bg-brand-100 text-brand-700",
  finalizada_sin_observaciones: "bg-success-100 text-success-700",
};

export function TicketStatusBadge({
  estado,
  revision,
}: {
  estado: TicketEstado;
  revision?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
        CLASES[estado],
      )}
    >
      {ETIQUETA_ESTADO[estado]}
      {revision && revision > 1 ? ` · Rev. #${revision}` : ""}
    </span>
  );
}
