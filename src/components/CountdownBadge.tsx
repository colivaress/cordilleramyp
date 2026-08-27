import { cn } from "@/lib/utils";
import type { TicketEstado } from "@/lib/tipos";
import {
  formatearTiempoRestante,
  horasRestantes,
  nivelAlerta,
} from "@/lib/vencimiento";

const CLASES: Record<string, string> = {
  vencido: "bg-danger-100 text-danger-700",
  naranja: "bg-alert-100 text-alert-700",
  amarillo: "bg-warning-100 text-warning-700",
  ninguno: "bg-neutral-100 text-neutral-700",
};

/**
 * Muestra el tiempo restante hasta la fecha de vencimiento y colorea según los
 * umbrales de §3. Se recalcula en cada render (no persiste).
 */
export function CountdownBadge({
  fechaVencimiento,
  estadoTicket,
  className,
}: {
  fechaVencimiento: string | null;
  estadoTicket: TicketEstado;
  className?: string;
}) {
  if (!fechaVencimiento) return null;
  const nivel = nivelAlerta(fechaVencimiento, estadoTicket);
  const horas = horasRestantes(fechaVencimiento);

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 text-xs font-medium",
        CLASES[nivel] ?? CLASES.ninguno,
        className,
      )}
      title={`Vence: ${new Date(fechaVencimiento).toLocaleString("es-CL")}`}
    >
      {formatearTiempoRestante(horas)}
    </span>
  );
}
