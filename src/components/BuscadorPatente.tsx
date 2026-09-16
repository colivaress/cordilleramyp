"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/TicketStatusBadge";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import {
  buscarPorPatente,
  tomarInspeccionConObservaciones,
  type ResultadoBusquedaPatente,
  type ResultadoBusquedaTicket,
} from "@/app/(app)/tickets/actions";
import { ETIQUETA_TIPO_INSPECCION } from "@/lib/tipos";

function formatearFecha(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function etiquetaCoincidencia(coincidioEn: ("camion" | "rampla")[]): string {
  const tiene = (v: "camion" | "rampla") => coincidioEn.includes(v);
  if (tiene("camion") && tiene("rampla")) return "Coincide en patente camión y rampla";
  if (tiene("camion")) return "Coincide en patente camión";
  return "Coincide en patente rampla";
}

/**
 * Buscador de patentes — pensado para usarse ANTES de crear una inspección
 * nueva: el supervisor escribe (parte de) una patente y ve si ese camión
 * tiene inspecciones pendientes o con observaciones, y QUÉ había que
 * reparar (no solo que "tiene observaciones" — eso es lo que compara contra
 * el camión que tiene delante).
 *
 * Identidad del camión = patente_camion (§1) — el veredicto de cada
 * resultado es sobre ESE ticket puntual, nunca una fusión de dos patentes
 * distintas. La búsqueda también encuentra coincidencias en patente_rampla
 * (a veces es el dato que el inspector tiene a mano), pero cada tarjeta dice
 * explícitamente en cuál de las dos coincidió.
 */
export function BuscadorPatente() {
  const [termino, setTermino] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusquedaPatente | null>(
    null,
  );
  const [buscado, setBuscado] = useState(false);
  const guardado = useEstadoGuardado();

  async function ejecutarBusqueda() {
    if (!termino.trim() || guardado.pendiente) return;
    try {
      await guardado.ejecutar(async () => {
        const res = await buscarPorPatente(termino);
        if (!res.ok) throw new Error(res.mensaje);
        setResultado(res);
        setBuscado(true);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo buscar por patente.",
      );
    }
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    void ejecutarBusqueda();
  }

  const sinResultados =
    buscado &&
    resultado &&
    resultado.misInspecciones.length === 0 &&
    resultado.conObservaciones.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buscar por patente</CardTitle>
        <CardDescription>
          Antes de cargar una inspección nueva, revisá si ese camión ya tiene
          una pendiente o con observaciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="buscador-patente" className="sr-only">
              Patente
            </Label>
            <Input
              id="buscador-patente"
              type="text"
              inputMode="search"
              placeholder="Patente camión o rampla…"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              className="uppercase"
            />
          </div>
          <Button type="submit" disabled={!termino.trim() || guardado.pendiente}>
            <ContenidoBoton
              pendiente={guardado.pendiente}
              texto="Buscar"
              textoPendiente="Buscando…"
              icono={SearchIcon}
            />
          </Button>
          <IndicadorGuardado estado={guardado.estado} />
        </form>

        {buscado && resultado && !sinResultados && (
          <div className="grid gap-6">
            <GrupoResultados
              titulo="Mis inspecciones"
              vacio="No tenés inspecciones pendientes ni con observaciones para esta patente."
              resultados={resultado.misInspecciones}
              esPropio
              onTomada={ejecutarBusqueda}
            />
            <GrupoResultados
              titulo="Con observaciones (de otros inspectores)"
              vacio="Ningún otro inspector tiene una inspección con observaciones para esta patente."
              resultados={resultado.conObservaciones}
              esPropio={false}
              onTomada={ejecutarBusqueda}
            />
          </div>
        )}

        {sinResultados && (
          <EstadoVacio tiposPermitidos={resultado.tiposPermitidos} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * §5: requisito, no pulido. Nunca "la patente está limpia" — el supervisor
 * solo ve lo que la RLS le permite ver (los tipos que tiene asignados). Si
 * tiene menos de los 4 tipos y la patente tuviera observaciones en uno que
 * no puede revisar, esto quedaría oculto — un mensaje optimista lo llevaría
 * a cargar un camión que no debía.
 */
function EstadoVacio({ tiposPermitidos }: { tiposPermitidos: string[] }) {
  const etiquetas = tiposPermitidos
    .map((t) => ETIQUETA_TIPO_INSPECCION[t] ?? t)
    .join(", ");
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        {tiposPermitidos.length > 0 ? (
          <>
            No se encontraron inspecciones pendientes ni con observaciones
            para esa patente, <strong>en los tipos que podés revisar</strong>{" "}
            ({etiquetas}). Esto no confirma que el camión esté libre de
            observaciones en otros tipos que no podés ver.
          </>
        ) : (
          <>
            No tenés ningún tipo de inspección asignado — pedile a un
            administrador que te lo asigne en Usuarios. No se puede buscar
            nada mientras tanto.
          </>
        )}
      </span>
    </div>
  );
}

function GrupoResultados({
  titulo,
  vacio,
  resultados,
  esPropio,
  onTomada,
}: {
  titulo: string;
  vacio: string;
  resultados: ResultadoBusquedaTicket[];
  esPropio: boolean;
  onTomada: () => void;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {resultados.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <div className="grid gap-3">
          {resultados.map((r) => (
            <TarjetaResultado
              key={r.ticketId}
              r={r}
              esPropio={esPropio}
              onTomada={onTomada}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaResultado({
  r,
  esPropio,
  onTomada,
}: {
  r: ResultadoBusquedaTicket;
  esPropio: boolean;
  onTomada: () => void;
}) {
  const router = useRouter();
  const guardado = useEstadoGuardado();

  async function tomar() {
    try {
      await guardado.ejecutar(async () => {
        const res = await tomarInspeccionConObservaciones({ ticketId: r.ticketId });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success("Inspección tomada. Te llevamos a la re-inspección.");
      router.push(`/tickets/${r.ticketId}/reinspeccion`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo tomar.");
      onTomada();
    }
  }

  // §4: nadie debe abrir la de otro creyendo que es suya — esta tarjeta no
  // es "de cualquiera", queda envuelta en el borde/etiqueta del grupo "Con
  // observaciones (de otros inspectores)", nunca mezclada con "Mis
  // inspecciones" en la misma lista.
  return (
    <div
      className={
        esPropio
          ? "grid gap-2 rounded-md border p-3"
          : "grid gap-2 rounded-md border border-brand-200 bg-brand-50/40 p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono font-medium">#{r.numeroInspeccion}</span>
          <span className="text-muted-foreground">
            {ETIQUETA_TIPO_INSPECCION[r.tipoInspeccion] ?? r.tipoInspeccion}
          </span>
          <TicketStatusBadge estado={r.estado} />
        </div>
        <span className="text-xs text-muted-foreground">
          {formatearFecha(r.fecha)}
        </span>
      </div>

      <div className="text-xs text-muted-foreground">
        {r.patenteCamion} / {r.patenteRampla} —{" "}
        <span className="font-medium text-foreground">
          {etiquetaCoincidencia(r.coincidioEn)}
        </span>
      </div>

      {!esPropio && (
        <div className="text-xs text-muted-foreground">
          Inspector: <span className="font-medium">{r.quienLaHizoNombre}</span>
        </div>
      )}

      {r.itemsNoConformes.length > 0 && (
        <ul className="grid gap-1 rounded-md bg-danger-50 p-2 text-xs text-danger-900">
          {r.itemsNoConformes.map((it) => (
            <li key={it.itemKey}>
              <span className="font-medium">{it.nombre}:</span>{" "}
              {it.observacion || "sin observación registrada"}
            </li>
          ))}
        </ul>
      )}

      {!esPropio && r.estado === "finalizada_con_observaciones" && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={guardado.pendiente}
            onClick={tomar}
          >
            <ContenidoBoton
              pendiente={guardado.pendiente}
              texto="Tomar esta inspección"
              textoPendiente="Tomando…"
            />
          </Button>
          <IndicadorGuardado estado={guardado.estado} />
        </div>
      )}
      {!esPropio && r.estado === "en_reparacion_de_observaciones" && (
        <p className="text-xs text-muted-foreground">
          Ya la tomó otro supervisor.
        </p>
      )}
    </div>
  );
}
