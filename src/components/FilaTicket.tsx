import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { TicketStatusBadge } from "@/components/TicketStatusBadge";
import { CountdownBadge } from "@/components/CountdownBadge";
import { cn } from "@/lib/utils";
import { clasesFilaAlerta, nivelAlerta } from "@/lib/vencimiento";
import { ETIQUETA_TIPO_INSPECCION, type TicketEstado } from "@/lib/tipos";

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export type FilaTicketProps = {
  ticketId: string;
  numeroInspeccion: number;
  numeroRevision: number;
  tipoInspeccion: string | null;
  patenteCamion: string;
  patenteRampla: string;
  transporte: string;
  estado: TicketEstado;
  fecha: string | null;
  fechaVencimiento: string | null;
  supervisorNombre: string;
};

/**
 * Una fila de la tabla de inspecciones — ÚNICA para toda la pantalla. La usan
 * tanto el listado normal (dashboard/page.tsx, server) como los resultados
 * del buscador de patentes (BuscadorPatente.tsx, client): una sola forma de
 * mostrar una inspección acá, no dos que haya que mantener sincronizadas.
 */
export function FilaTicket({
  ticketId,
  numeroInspeccion,
  numeroRevision,
  tipoInspeccion,
  patenteCamion,
  patenteRampla,
  transporte,
  estado,
  fecha,
  fechaVencimiento,
  supervisorNombre,
}: FilaTicketProps) {
  const nivel = nivelAlerta(fechaVencimiento, estado);
  return (
    <TableRow className={cn(clasesFilaAlerta(nivel))}>
      <TableCell>
        {/* §2.6: "Ver" lleva directo al informe. */}
        <Link
          href={`/tickets/${ticketId}/report`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "border-brand-600/40 text-brand-700 hover:bg-brand-50 hover:text-brand-800",
          )}
        >
          Ver
        </Link>
      </TableCell>
      <TableCell className="font-mono tabular-nums whitespace-nowrap">
        {numeroInspeccion}
        <span className="ml-1 text-xs text-muted-foreground">
          #{numeroRevision}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {tipoInspeccion
          ? (ETIQUETA_TIPO_INSPECCION[tipoInspeccion] ?? tipoInspeccion)
          : "—"}
      </TableCell>
      <TableCell className="font-medium">
        {patenteCamion}
        <span className="text-muted-foreground"> / {patenteRampla}</span>
      </TableCell>
      <TableCell>{transporte}</TableCell>
      <TableCell>
        <TicketStatusBadge estado={estado} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatearFecha(fecha)}
      </TableCell>
      <TableCell>
        <CountdownBadge
          fechaVencimiento={fechaVencimiento}
          estadoTicket={estado}
          formatoTabla
        />
      </TableCell>
      <TableCell>{supervisorNombre}</TableCell>
    </TableRow>
  );
}
