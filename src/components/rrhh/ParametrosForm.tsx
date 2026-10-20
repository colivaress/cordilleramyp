"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
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
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { guardarParametrosPeriodo } from "@/app/(app)/rrhh/parametros/actions";
import {
  AFPS,
  CAMPOS,
  NOMBRE_AFP,
  letraTramo,
  leerFormulario,
  type FormularioParametros,
  type GrupoCampo,
} from "@/lib/rrhh/parametros";

const GRUPOS: { grupo: GrupoCampo; titulo: string; descripcion: string }[] = [
  { grupo: "indicadores", titulo: "Indicadores del mes", descripcion: "UF con decimales; UTM e ingreso mínimo en pesos." },
  { grupo: "topes", titulo: "Topes imponibles", descripcion: "En UF." },
  { grupo: "trabajador", titulo: "Cotizaciones del trabajador", descripcion: "En porcentaje (10 = 10%)." },
  { grupo: "empleador", titulo: "Aportes del empleador", descripcion: "En porcentaje (10 = 10%)." },
];

export function ParametrosForm({
  inicial,
  existe,
}: {
  inicial: FormularioParametros;
  existe: boolean;
}) {
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const guardado = useEstadoGuardado();

  const set = (cambio: (copia: FormularioParametros) => void) =>
    setF((actual) => {
      const copia = structuredClone(actual);
      cambio(copia);
      return copia;
    });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    // Misma validación que repite el servidor: acá solo evita el viaje.
    const local = leerFormulario(f);
    if (!local.ok) {
      setErrores(local.errores);
      toast.error("Revisa los datos marcados antes de guardar.");
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res = await guardarParametrosPeriodo(f);
        if (!res.ok) {
          if ("errores" in res) setErrores(res.errores);
          throw new Error(res.mensaje);
        }
      });
      toast.success("Parámetros guardados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {GRUPOS.map(({ grupo, titulo, descripcion }) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle>{titulo}</CardTitle>
              <CardDescription>{descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {CAMPOS.filter((c) => c.grupo === grupo).map((c) => (
                <div key={c.clave} className="grid gap-1.5">
                  <Label htmlFor={c.clave}>{c.etiqueta}</Label>
                  <Input
                    id={c.clave}
                    inputMode="decimal"
                    autoComplete="off"
                    value={f.valores[c.clave]}
                    onChange={(e) => set((x) => (x.valores[c.clave] = e.target.value))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comisión de cada AFP</CardTitle>
          <CardDescription>
            Solo la comisión, en porcentaje. La cotización obligatoria va arriba,
            en &quot;Cotizaciones del trabajador&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {AFPS.map((afp) => (
            <div key={afp} className="grid gap-1.5">
              <Label htmlFor={`afp-${afp}`}>{NOMBRE_AFP[afp]}</Label>
              <Input
                id={`afp-${afp}`}
                inputMode="decimal"
                autoComplete="off"
                value={f.comisionAfp[afp]}
                onChange={(e) => set((x) => (x.comisionAfp[afp] = e.target.value))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impuesto único de segunda categoría</CardTitle>
          <CardDescription>
            Tabla mensual del SII en UTM. El factor va como fracción (0,04 para
            4%) y la rebaja en UTM. El último tramo va sin &quot;hasta&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {f.tramosImpuesto.map((t, i) => (
            <fieldset key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
              <legend className="sr-only">Tramo {i + 1}</legend>
              <span className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-3">Tramo {i + 1}</span>
              {(
                [
                  ["desde", "Desde (UTM)"],
                  ["hasta", "Hasta (UTM)"],
                  ["factor", "Factor"],
                  ["rebaja", "Rebaja (UTM)"],
                ] as const
              ).map(([k, etiqueta]) => (
                <div key={k} className="grid gap-1.5">
                  <Label htmlFor={`imp-${i}-${k}`}>{etiqueta}</Label>
                  <Input
                    id={`imp-${i}-${k}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={k === "hasta" && i === f.tramosImpuesto.length - 1 ? "y más" : undefined}
                    value={t[k]}
                    onChange={(e) => set((x) => (x.tramosImpuesto[i][k] = e.target.value))}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar tramo ${i + 1}`}
                disabled={f.tramosImpuesto.length === 1}
                onClick={() => set((x) => x.tramosImpuesto.splice(i, 1))}
              >
                <Trash2Icon />
              </Button>
            </fieldset>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                set((x) => {
                  const ultimo = x.tramosImpuesto[x.tramosImpuesto.length - 1];
                  x.tramosImpuesto.push({ desde: ultimo?.hasta ?? "", hasta: "", factor: "", rebaja: "" });
                })
              }
            >
              <PlusIcon /> Agregar tramo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación familiar</CardTitle>
          <CardDescription>
            Tramos A, B, C, D en orden: renta tope y monto por carga, en pesos.
            El último tramo va sin renta tope (y monto 0 si no tiene).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {f.tramosAsignacionFamiliar.map((t, i) => (
            <fieldset key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
              <legend className="sr-only">Tramo {letraTramo(i)}</legend>
              <span className="col-span-2 text-sm font-medium sm:col-span-1 sm:pb-3">Tramo {letraTramo(i)}</span>
              <div className="grid gap-1.5">
                <Label htmlFor={`asig-${i}-hasta`}>Renta hasta</Label>
                <Input
                  id={`asig-${i}-hasta`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={i === f.tramosAsignacionFamiliar.length - 1 ? "y más" : undefined}
                  value={t.hasta}
                  onChange={(e) => set((x) => (x.tramosAsignacionFamiliar[i].hasta = e.target.value))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`asig-${i}-monto`}>Monto por carga</Label>
                <Input
                  id={`asig-${i}-monto`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={t.monto}
                  onChange={(e) => set((x) => (x.tramosAsignacionFamiliar[i].monto = e.target.value))}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar tramo ${letraTramo(i)}`}
                disabled={f.tramosAsignacionFamiliar.length === 1}
                onClick={() => set((x) => x.tramosAsignacionFamiliar.splice(i, 1))}
              >
                <Trash2Icon />
              </Button>
            </fieldset>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => set((x) => x.tramosAsignacionFamiliar.push({ hasta: "", monto: "" }))}
            >
              <PlusIcon /> Agregar tramo
            </Button>
          </div>
        </CardContent>
      </Card>

      {errores.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
        >
          <p className="font-medium">No se guardó. Corrige esto:</p>
          <ul className="mt-1 list-disc pl-5">
            {errores.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardado.pendiente}>
          <ContenidoBoton
            pendiente={guardado.pendiente}
            texto={existe ? "Guardar cambios" : "Guardar período"}
            textoPendiente="Guardando…"
          />
        </Button>
        <IndicadorGuardado estado={guardado.estado} />
      </div>
    </form>
  );
}
