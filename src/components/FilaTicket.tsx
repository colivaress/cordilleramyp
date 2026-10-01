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
  /** Solo un supervisor puede continuar una inspección en_revision — mismo
   *  rol que ya filtra el resto de esta pantalla (dashboard/page.tsx:
   *  `esSupervisor`, también lo que gatea `BuscadorPatente`). Un
   *  administrador nunca ve "Continuar": lo llevaría a una redirección,
   *  porque /tickets/[id]/reinspeccion exige rol supervisor y un
   *  administrador no puede crear ni editar ninguna inspección. */
  esSupervisor: boolean;
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
  esSupervisor,
}: FilaTicketProps) {
  const nivel = nivelAlerta(fechaVencimiento, estado);
  // Mientras el ticket está en_revision (recién creado, o una inspección que
  // se abandonó sin finalizar — nada en los datos distingue un caso del
  // otro, y no hace falta: en cualquiera de los dos lo que falta es
  // completar el formulario, no ver un informe que todavía no existe de
  // verdad). Para cualquier otro estado, el botón sigue yendo al informe
  // como hasta ahora.
  //
  // `&& esSupervisor` — un administrador ve todos los tickets, de cualquier
  // supervisor, pero no puede crear ni editar ninguna inspección
  // (/tickets/[id]/reinspeccion exige rol supervisor). Sin este chequeo, un
  // administrador vería "Continuar" sobre el en_revision de otra persona y
  // el clic solo lo llevaría a una redirección. La autorización real (solo
  // el supervisor a cargo de ESTA revisión puede continuarla, no cualquier
  // supervisor) la siguen aplicando la política RLS de
  // `tickets`/`ticket_revisiones` y autorizarRevisionEnCurso del lado del
  // servidor — este link no decide permisos, solo evita el camino que ya
  // se sabe que termina en un callejón sin salida.
  const enCurso = estado === "en_revision" && esSupervisor;
  return (
    <TableRow className={cn(clasesFilaAlerta(nivel))}>
      <TableCell>
        <Link
          href={
            enCurso
              ? `/tickets/${ticketId}/reinspeccion`
              : `/tickets/${ticketId}/report`
          }
          className={cn(
            buttonVariants({ variant: "outline" }),
            "border-brand-600/40 text-brand-700 hover:bg-brand-50 hover:text-brand-800",
          )}
        >
          {enCurso ? "Continuar" : "Ver"}
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
