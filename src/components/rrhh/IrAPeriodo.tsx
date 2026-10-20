"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { codigoPeriodo, leerCodigoPeriodo, nombreMes } from "@/lib/rrhh/parametros";

/** Elige mes y año y abre la pantalla de ese período (nuevo o ya cargado). */
export function IrAPeriodo({ anio, mes }: { anio: number; mes: number }) {
  const router = useRouter();
  const [mesElegido, setMes] = useState(mes);
  const [anioTexto, setAnio] = useState(String(anio));
  const codigo = codigoPeriodo(Number(anioTexto), mesElegido);
  const valido = leerCodigoPeriodo(codigo) !== null;

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) router.push(`/rrhh/parametros/${codigo}`);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="periodo-mes">Mes</Label>
        <select
          id="periodo-mes"
          className={nativeSelectClassName + " capitalize"}
          value={mesElegido}
          onChange={(e) => setMes(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {nombreMes(i + 1)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="periodo-anio">Año</Label>
        <Input
          id="periodo-anio"
          inputMode="numeric"
          className="w-24"
          value={anioTexto}
          onChange={(e) => setAnio(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </div>
      <Button type="submit" disabled={!valido}>
        Abrir período
      </Button>
    </form>
  );
}
