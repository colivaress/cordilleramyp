"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PIEZA ÚNICA de retroalimentación de nivel 1 (§ retroalimentación visual).
 * No crear un quinto/sexto patrón nuevo para un botón o campo puntual —
 * usar este hook. Sirve para los dos casos que existen en la app:
 *
 * 1. Autoguardado con debounce (checklist por ítem, observación general):
 *    llamar `marcarCambio()` de forma SÍNCRONA en el evento de cambio del
 *    usuario (antes de programar el debounce) — es la respuesta inmediata a
 *    "¿registró mi toque?", que no puede esperar a que salga la request.
 *    Cuando el debounce dispara, envolver la llamada real en `ejecutar()`.
 *
 * 2. Botón sin debounce (Finalizar revisión, Guardar usuario, Enviar por
 *    correo, etc.): llamar `ejecutar()` directo, sin pasar por
 *    `marcarCambio()` — el botón entra en "guardando" apenas se dispara el
 *    click, que es exactamente cuándo hay que deshabilitarlo.
 */
export type EstadoGuardado =
  | "idle"
  | "cambiando"
  | "guardando"
  | "guardado"
  | "error";

type Opciones = {
  /** Cuánto queda visible "guardado" antes de volver a "idle". */
  duracionGuardadoMs?: number;
};

export function useEstadoGuardado({ duracionGuardadoMs = 2000 }: Opciones = {}) {
  const [estado, setEstado] = useState<EstadoGuardado>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const marcarCambio = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setError(null);
    setEstado("cambiando");
  }, []);

  const ejecutar = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setError(null);
      setEstado("guardando");
      try {
        const resultado = await fn();
        if (montadoRef.current) {
          setEstado("guardado");
          timerRef.current = setTimeout(() => {
            if (montadoRef.current) setEstado("idle");
          }, duracionGuardadoMs);
        }
        return resultado;
      } catch (e) {
        if (montadoRef.current) {
          setEstado("error");
          setError(e instanceof Error ? e.message : "No se pudo guardar.");
        }
        throw e;
      }
    },
    [duracionGuardadoMs],
  );

  /** Para `disabled={pendiente}` — true mientras hay algo en curso, en
   *  cualquiera de las dos etapas (cambio recién hecho o request en vuelo). */
  const pendiente = estado === "cambiando" || estado === "guardando";

  return { estado, error, pendiente, marcarCambio, ejecutar };
}

/**
 * Misma máquina de estados que `useEstadoGuardado`, direccionada por clave —
 * para una COLECCIÓN de controles ya conocida por id (los 18 ítems del
 * checklist, las filas de una tabla) donde no conviene extraer un componente
 * separado por elemento solo para poder llamar el hook una vez por fila.
 * Mismos cuatro estados, mismas reglas — no es un mecanismo nuevo, es el
 * mismo direccionado por `clave` en vez de una única instancia.
 */
export function useEstadoGuardadoPorClave({ duracionGuardadoMs = 2000 }: Opciones = {}) {
  const [estados, setEstados] = useState<Record<string, EstadoGuardado>>({});
  const [errores, setErrores] = useState<Record<string, string | null>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    const timers = timersRef.current;
    return () => {
      montadoRef.current = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const marcarCambio = useCallback((clave: string) => {
    if (timersRef.current[clave]) clearTimeout(timersRef.current[clave]);
    setErrores((e) => ({ ...e, [clave]: null }));
    setEstados((s) => ({ ...s, [clave]: "cambiando" }));
  }, []);

  /** Vuelve a "idle" sin pasar por "guardando" — para cuando el debounce
   *  dispara pero, tras revisar el estado más reciente, decide que no hay
   *  nada que guardar todavía (ej. una observación sin foto aún: no se
   *  puede persistir por el constraint de la base). Sin esto, el indicador
   *  quedaría pegado en "cambiando" para siempre. */
  const limpiar = useCallback((clave: string) => {
    if (timersRef.current[clave]) clearTimeout(timersRef.current[clave]);
    setErrores((e) => ({ ...e, [clave]: null }));
    setEstados((s) => ({ ...s, [clave]: "idle" }));
  }, []);

  const ejecutar = useCallback(
    async <T,>(clave: string, fn: () => Promise<T>): Promise<T> => {
      if (timersRef.current[clave]) clearTimeout(timersRef.current[clave]);
      setErrores((e) => ({ ...e, [clave]: null }));
      setEstados((s) => ({ ...s, [clave]: "guardando" }));
      try {
        const resultado = await fn();
        if (montadoRef.current) {
          setEstados((s) => ({ ...s, [clave]: "guardado" }));
          timersRef.current[clave] = setTimeout(() => {
            if (montadoRef.current)
              setEstados((s) => ({ ...s, [clave]: "idle" }));
          }, duracionGuardadoMs);
        }
        return resultado;
      } catch (e) {
        if (montadoRef.current) {
          setEstados((s) => ({ ...s, [clave]: "error" }));
          setErrores((er) => ({
            ...er,
            [clave]: e instanceof Error ? e.message : "No se pudo guardar.",
          }));
        }
        throw e;
      }
    },
    [duracionGuardadoMs],
  );

  const estadoDe = useCallback(
    (clave: string): EstadoGuardado => estados[clave] ?? "idle",
    [estados],
  );
  const errorDe = useCallback(
    (clave: string): string | null => errores[clave] ?? null,
    [errores],
  );

  return { estadoDe, errorDe, marcarCambio, limpiar, ejecutar };
}
