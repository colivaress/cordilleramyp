"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { calcularTotales, formatearCLP, leerMontoCLP, TASA_IVA } from "@/lib/dinero";
import type { EstadoCotizacion } from "../estados";
import { cambiarEstadoCotizacion, emitirCotizacion } from "../actions";

/** Días de validez que se ofrecen por defecto. 15 es lo habitual en una
 *  cotización de flete; el campo igual es editable. */
const VALIDEZ_POR_DEFECTO = 15;

export function EmitirCotizacion({
  id,
  estado,
  valorNetoActual,
  validezDiasActual,
  observacionesActuales,
  correoDestino,
  emitidaPor,
}: {
  id: string;
  estado: EstadoCotizacion;
  valorNetoActual: number | null;
  validezDiasActual: number | null;
  observacionesActuales: string | null;
  correoDestino: string;
  emitidaPor: string;
}) {
  const idBase = useId();
  const guardado = useEstadoGuardado();
  const guardadoEstado = useEstadoGuardado();

  const [neto, setNeto] = useState(
    valorNetoActual ? String(valorNetoActual) : "",
  );
  const [validez, setValidez] = useState(
    String(validezDiasActual ?? VALIDEZ_POR_DEFECTO),
  );
  const [observaciones, setObservaciones] = useState(
    observacionesActuales ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const netoNumero = leerMontoCLP(neto);
  const totales = netoNumero ? calcularTotales(netoNumero) : null;
  const validezNumero = Number(validez);
  const validezOk =
    Number.isInteger(validezNumero) && validezNumero > 0 && validezNumero <= 365;

  const yaCotizada = estado === "cotizada" || estado === "ganada";
  const enviando = guardado.pendiente;

  async function enviar() {
    setError(null);
    setAviso(null);
    if (!netoNumero) {
      setError("Escribe el valor neto.");
      return;
    }
    if (!validezOk) {
      setError("La validez debe estar entre 1 y 365 días.");
      return;
    }

    try {
      const r = await guardado.ejecutar(() =>
        emitirCotizacion({
          id,
          valorNeto: netoNumero,
          validezDias: validezNumero,
          observaciones,
        }),
      );
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      setConfirmando(false);
      setAviso(
        `Cotización por ${r.totalFormateado} enviada a ${correoDestino}.`,
      );
    } catch {
      setError(
        "No se pudo enviar la cotización. Revisa la conexión e intenta de nuevo.",
      );
    }
  }

  async function marcar(nuevo: EstadoCotizacion) {
    setError(null);
    setAviso(null);
    try {
      const r = await guardadoEstado.ejecutar(() =>
        cambiarEstadoCotizacion({ id, estado: nuevo }),
      );
      if (!r.ok) setError(r.mensaje);
    } catch {
      setError("No se pudo cambiar el estado.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {yaCotizada ? "Reemitir cotización" : "Crear cotización"}
        </CardTitle>
        <CardDescription>
          Se genera un PDF con los datos de esta solicitud y se envía a{" "}
          <strong>{correoDestino}</strong>, firmado por {emitidaPor}.
          {yaCotizada &&
            " Esta solicitud ya tiene una cotización enviada: volver a emitirla reemplaza el valor guardado."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${idBase}-neto`}>Valor neto</Label>
            <Input
              id={`${idBase}-neto`}
              value={neto}
              onChange={(e) => {
                setNeto(e.target.value);
                setConfirmando(false);
              }}
              inputMode="numeric"
              placeholder="450000"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              En pesos, sin decimales. El IVA se calcula solo.
            </p>
          </div>
          <div>
            <Label htmlFor={`${idBase}-validez`}>Validez (días)</Label>
            <Input
              id={`${idBase}-validez`}
              value={validez}
              onChange={(e) => {
                setValidez(e.target.value);
                setConfirmando(false);
              }}
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aparece en el PDF como la fecha hasta la que vale.
            </p>
          </div>
        </div>

        {/* El desglose se muestra ANTES de enviar, no después: el objetivo es
            que quien cotiza vea el total que le va a llegar al cliente
            mientras todavía puede corregirlo. */}
        {totales && (
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex justify-between text-sm">
              <span>Neto</span>
              <span className="font-medium">{formatearCLP(totales.neto)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>IVA ({Math.round(TASA_IVA * 100)}%)</span>
              <span className="font-medium">{formatearCLP(totales.iva)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatearCLP(totales.total)}</span>
            </div>
          </div>
        )}

        <div>
          <Label htmlFor={`${idBase}-obs`}>
            Observaciones{" "}
            <span className="font-normal text-muted-foreground">
              (opcional, salen en el PDF)
            </span>
          </Label>
          <Textarea
            id={`${idBase}-obs`}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Incluye peaje. No incluye estadía por espera en planta."
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {aviso && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {aviso}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {/* Un paso de confirmación porque el botón manda un correo a un
            tercero: una vez que sale, no se puede recoger. Muestra el total
            en el propio botón para que no haya que mirar a otro lado. */}
        {confirmando ? (
          <>
            <Button onClick={enviar} disabled={enviando}>
              <ContenidoBoton
                pendiente={enviando}
                texto={`Confirmar envío de ${totales ? formatearCLP(totales.total) : ""}`}
                textoPendiente="Generando y enviando…"
              />
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              setError(null);
              setAviso(null);
              if (!netoNumero) {
                setError("Escribe el valor neto.");
                return;
              }
              if (!validezOk) {
                setError("La validez debe estar entre 1 y 365 días.");
                return;
              }
              setConfirmando(true);
            }}
          >
            {yaCotizada ? "Reemitir y enviar" : "Crear y enviar cotización"}
          </Button>
        )}

        {estado !== "nueva" && (
          <div className="ml-auto flex gap-2">
            {estado !== "ganada" && (
              <Button
                variant="outline"
                onClick={() => marcar("ganada")}
                disabled={guardadoEstado.pendiente}
              >
                Marcar ganada
              </Button>
            )}
            {estado !== "perdida" && (
              <Button
                variant="outline"
                onClick={() => marcar("perdida")}
                disabled={guardadoEstado.pendiente}
              >
                Marcar perdida
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
