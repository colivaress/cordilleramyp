"use client";

import { useState, type ReactNode } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { FilaTicket } from "@/components/FilaTicket";
import {
  buscarPorPatente,
  type ResultadoBusquedaPatente,
} from "@/app/(app)/tickets/actions";
import { ETIQUETA_TIPO_INSPECCION } from "@/lib/tipos";

/**
 * Buscador de patentes — pensado para usarse ANTES de crear una inspección
 * nueva: el supervisor escribe (parte de) una patente y ve si ese camión
 * tiene inspecciones pendientes o con observaciones.
 *
 * §5: el resultado va en la MISMA tabla de inspecciones que ya existe (no en
 * tarjetas propias) — mientras no haya una búsqueda activa, este componente
 * es un simple passthrough de `children` (la tabla normal, con sus filtros y
 * paginación, sin tocar); al buscar, reemplaza esa tabla por una tabla con
 * exactamente las mismas filas (FilaTicket, componente compartido) filtradas
 * a lo encontrado. `activo` es `false` para el rol administrador (nunca ve
 * este buscador) — ahí este componente es transparente, cero cambio de
 * comportamiento.
 */
export function BuscadorPatente({
  activo,
  children,
}: {
  activo: boolean;
  children: ReactNode;
}) {
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

  function limpiar() {
    setTermino("");
    setResultado(null);
    setBuscado(false);
  }

  if (!activo) return <>{children}</>;

  const buscando = buscado && resultado !== null;
  const sinResultados =
    buscando &&
    resultado.misInspecciones.length === 0 &&
    resultado.conObservaciones.length === 0;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Buscar por patente</CardTitle>
          <CardDescription>
            Antes de cargar una inspección nueva, revisa si ese camión ya
            tiene una pendiente o con observaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            {buscando && (
              <Button type="button" variant="ghost" onClick={limpiar}>
                Limpiar
              </Button>
            )}
            <IndicadorGuardado estado={guardado.estado} />
          </form>
        </CardContent>
      </Card>

      {/* §5: avisos como una línea sobre la tabla, no como tarjetas con
          datos — coincidencia oculta y "hay más resultados" se muestran
          siempre que existan, tenga o no resultados visibles esta
          búsqueda (un tipo oculto puede coexistir con resultados visibles
          de otro tipo, o no haber ninguno visible). */}
      {buscando && resultado.hayCoincidenciaOculta && (
        <AvisoLinea>
          Esta patente tiene además una coincidencia en un tipo de inspección
          que no puedes revisar. No se puede mostrar cuál ni qué dice —
          pregúntale a un administrador o a otro inspector.
        </AvisoLinea>
      )}

      {buscando && !sinResultados && resultado.hayMasResultados && (
        <AvisoLinea tono="neutral">
          Hay más resultados de los que se muestran acá — escribe más letras
          o números para acotar la búsqueda.
        </AvisoLinea>
      )}

      {buscando && sinResultados && (
        <AvisoLinea tono={resultado.tiposPermitidos.length > 0 ? "neutral" : "advertencia"}>
          {resultado.tiposPermitidos.length > 0 ? (
            <>
              No se encontraron inspecciones pendientes ni con observaciones
              para esa patente, en los tipos que puedes revisar (
              {resultado.tiposPermitidos
                .map((t) => ETIQUETA_TIPO_INSPECCION[t] ?? t)
                .join(", ")}
              ).
            </>
          ) : (
            <>
              No tienes ningún tipo de inspección asignado — pídele a un
              administrador que te lo asigne en Usuarios. No se puede buscar
              nada mientras tanto.
            </>
          )}
        </AvisoLinea>
      )}

      {buscando && !sinResultados ? (
        <TablaResultados resultado={resultado} />
      ) : (
        !buscando && children
      )}
    </div>
  );
}

function AvisoLinea({
  tono = "advertencia",
  children,
}: {
  tono?: "advertencia" | "neutral";
  children: ReactNode;
}) {
  return (
    <div
      className={
        tono === "advertencia"
          ? "flex items-start gap-2 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-warning-900"
          : "flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      }
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * §5: MISMA tabla y MISMA fila (FilaTicket) que dashboard/page.tsx usa fuera
 * de una búsqueda — solo agrupada en "Mis inspecciones" / "Con
 * observaciones (de otros inspectores)" (§4: nadie debe abrir la de otro
 * creyendo que es suya). El detalle de ítems no conformes ya no vive acá:
 * queda, como siempre, detrás del botón "Ver" de cada fila.
 */
function TablaResultados({ resultado }: { resultado: ResultadoBusquedaPatente }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">Ver</span>
            </TableHead>
            <TableHead>Nro</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Camión / Rampla</TableHead>
            <TableHead>Transporte</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Supervisor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resultado.misInspecciones.length > 0 && (
            <>
              <GrupoSeparador texto="Mis inspecciones" />
              {resultado.misInspecciones.map((r) => (
                <FilaTicket key={r.ticketId} {...r} />
              ))}
            </>
          )}
          {resultado.conObservaciones.length > 0 && (
            <>
              <GrupoSeparador texto="Con observaciones (de otros inspectores)" />
              {resultado.conObservaciones.map((r) => (
                <FilaTicket key={r.ticketId} {...r} />
              ))}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function GrupoSeparador({ texto }: { texto: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={9}
        className="bg-muted/50 py-1.5 text-xs font-semibold text-muted-foreground"
      >
        {texto}
      </TableCell>
    </TableRow>
  );
}
