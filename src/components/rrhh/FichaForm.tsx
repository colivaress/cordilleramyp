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
import { cn } from "@/lib/utils";

type Opcion = { id: string; nombre: string; activo: boolean };

/** Datos contractuales y previsionales. Los editan administrador y
 *  administrador de contrato (no son montos de sueldo). Cargo y área salen
 *  de su catálogo: un texto libre deja "Encarpador" y "ENCARPADOR" como dos
 *  cargos distintos y los filtros dejan gente fuera sin avisar. */
export function FichaForm({
  personalId,
  inicial,
  existe,
  cargos,
  areas,
}: {
  personalId: string;
  inicial: FormularioFicha;
  existe: boolean;
  cargos: Opcion[];
  areas: Opcion[];
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
      toast.success(existe ? "Contrato actualizado." : "Contrato registrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  // Un cargo o área desactivado sigue apareciendo si es el que ya tiene la
  // ficha (baja lógica: no desaparece de lo histórico), pero no se ofrece
  // para elegirlo de nuevo.
  const catalogo = (id: "cargo_id" | "area_id", etiqueta: string, opciones: Opcion[], vacio: string) => (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={`ficha-${id}`}>{etiqueta}</Label>
      <select
        id={`ficha-${id}`}
        className={cn(nativeSelectClassName, "w-full truncate")}
        value={f[id]}
        onChange={(e) => set(id, e.target.value)}
      >
        <option value="">{vacio}</option>
        {opciones
          .filter((o) => o.activo || o.id === inicial[id])
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
              {!o.activo && " (desactivado)"}
            </option>
          ))}
      </select>
    </div>
  );

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
        {catalogo("cargo_id", "Cargo", cargos, "Elegir…")}
        {catalogo("area_id", "Área (opcional)", areas, "Sin área")}
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
            texto={existe ? "Guardar cambios" : "Registrar contrato"}
            textoPendiente="Guardando…"
          />
        </Button>
        <IndicadorGuardado estado={guardado.estado} />
      </div>
    </form>
  );
}
