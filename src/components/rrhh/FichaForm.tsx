"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { ListaErrores } from "@/components/rrhh/ListaErrores";
import { guardarFicha } from "@/app/(app)/rrhh/actions";
import {
  ETIQUETA_SALUD,
  ETIQUETA_TIPO_CONTRATO,
  SISTEMAS_SALUD,
  TIPOS_CONTRATO,
  leerFicha,
  type FormularioFicha,
} from "@/lib/rrhh/ficha";
import { AFPS, NOMBRE_AFP } from "@/lib/rrhh/parametros";

/** Datos contractuales y previsionales. Los editan administrador y
 *  administrador de contrato (no son montos de sueldo). */
export function FichaForm({
  personalId,
  inicial,
  existe,
}: {
  personalId: string;
  inicial: FormularioFicha;
  existe: boolean;
}) {
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const guardado = useEstadoGuardado();
  const set = <K extends keyof FormularioFicha>(k: K, v: FormularioFicha[K]) => setF((x) => ({ ...x, [k]: v }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    const local = leerFicha(f);
    if (!local.ok) {
      setErrores(local.errores);
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res = await guardarFicha(personalId, f);
        if (!res.ok) {
          if ("errores" in res) setErrores(res.errores);
          throw new Error(res.mensaje);
        }
      });
      toast.success("Ficha guardada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  type CampoTexto = Exclude<keyof FormularioFicha, "afecto_afc">;
  const campo = (id: CampoTexto, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ficha-${id}`}>{etiqueta}</Label>
      <Input
        id={`ficha-${id}`}
        value={f[id]}
        onChange={(e) => set(id, e.target.value)}
        autoComplete="off"
        {...props}
      />
    </div>
  );

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campo("rut", "RUT", { placeholder: "12.345.678-9" })}
        {campo("cargo", "Cargo")}
        {campo("area", "Área (opcional)")}
        {campo("fecha_ingreso", "Fecha de ingreso", { type: "date" })}
        <div className="grid gap-1.5">
          <Label htmlFor="ficha-tipo_contrato">Tipo de contrato</Label>
          <select
            id="ficha-tipo_contrato"
            className={nativeSelectClassName}
            value={f.tipo_contrato}
            onChange={(e) => set("tipo_contrato", e.target.value)}
          >
            <option value="">Elegir…</option>
            {TIPOS_CONTRATO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_CONTRATO[t]}
              </option>
            ))}
          </select>
        </div>
        {f.tipo_contrato && f.tipo_contrato !== "indefinido" &&
          campo("fecha_termino_contrato", f.tipo_contrato === "plazo_fijo" ? "Fecha de término" : "Fecha de término (si se conoce)", { type: "date" })}
        <div className="grid gap-1.5">
          <Label htmlFor="ficha-afp">AFP</Label>
          <select id="ficha-afp" className={nativeSelectClassName} value={f.afp} onChange={(e) => set("afp", e.target.value)}>
            <option value="">Elegir…</option>
            {AFPS.map((a) => (
              <option key={a} value={a}>
                {NOMBRE_AFP[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ficha-sistema_salud">Salud</Label>
          <select
            id="ficha-sistema_salud"
            className={nativeSelectClassName}
            value={f.sistema_salud}
            onChange={(e) => set("sistema_salud", e.target.value)}
          >
            <option value="">Elegir…</option>
            {SISTEMAS_SALUD.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SALUD[s]}
              </option>
            ))}
          </select>
        </div>
        {f.sistema_salud === "isapre" && (
          <>
            {campo("isapre", "Isapre")}
            {campo("plan_isapre_uf", "Plan pactado (UF)", { inputMode: "decimal", placeholder: "3,5" })}
          </>
        )}
        {campo("cargas_familiares", "Cargas familiares", { inputMode: "numeric" })}
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={f.afecto_afc}
            onChange={(e) => set("afecto_afc", e.target.checked)}
          />
          Afecto al seguro de cesantía
        </label>
      </div>

      <ListaErrores errores={errores} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardado.pendiente}>
          <ContenidoBoton
            pendiente={guardado.pendiente}
            texto={existe ? "Guardar cambios" : "Crear ficha"}
            textoPendiente="Guardando…"
          />
        </Button>
        <IndicadorGuardado estado={guardado.estado} />
      </div>
    </form>
  );
}
