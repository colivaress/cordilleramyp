"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RETARDO_MS = 300;

/**
 * Nivel 2 de retroalimentación visual: overlay bloqueante al centro, solo
 * para acciones largas donde el usuario no debe tocar nada más (enviar el
 * informe por correo, generar/descargar el PDF, finalizar la inspección).
 *
 * El overlay solo aparece si la acción sigue corriendo pasados ~300ms — si
 * termina antes, `visible` nunca pasa a true (evita el parpadeo de una
 * acción rápida). Mientras está visible bloquea toda interacción y NO se
 * puede descartar (no hay cierre por click afuera ni por Esc — ver
 * `OverlayBloqueante`, que no implementa ninguno de los dos). Desaparece
 * apenas la acción resuelve, bien o mal; el resultado lo sigue comunicando
 * el toast de siempre (no se duplica acá — el overlay solo dice "está
 * corriendo", nunca "terminó bien/mal").
 *
 * Este hook NO maneja el foco de vuelta al cerrarse — se probó acá primero
 * y en los tres usos reales (InspeccionForm, BotonFinalizarPendiente,
 * EmailRecipientsSelect) `ejecutar` va anidado DENTRO de un
 * `guardado.ejecutar(...)` de `useEstadoGuardado`, que es el que realmente
 * controla `disabled={pendiente}` del botón. Medido en vivo: el `finally`
 * de ACÁ corre antes que el `catch`/reseteo de ese `guardado` de afuera —
 * en el momento en que este `finally` intentaría restaurar el foco, el
 * botón TODAVÍA está deshabilitado (un elemento disabled no puede recibir
 * foco, el intento queda en silencio, sin error). La restauración tiene
 * que vivir en el borde exterior real — donde llama el componente, después
 * de que TODO (incluido el `guardado.ejecutar` de afuera) terminó. Ver esa
 * lógica en cada llamador — usan `enfocarCuandoHabilitado` de abajo, no
 * `.focus()` directo (ver por qué en su propio comentario).
 */
export function useAccionLarga() {
  const [visible, setVisible] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const ejecutar = useCallback(
    async <T,>(fn: () => Promise<T>, mensajeAccion: string): Promise<T> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (montadoRef.current) {
          setMensaje(mensajeAccion);
          setVisible(true);
        }
      }, RETARDO_MS);
      try {
        return await fn();
      } finally {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (montadoRef.current) setVisible(false);
      }
    },
    [],
  );

  return { visible, mensaje, ejecutar };
}

/**
 * Restaura el foco a `el` cuando el cierre del overlay NO navegó (la acción
 * falló). No alcanza con llamar `el.focus()` directo en el `finally` del
 * llamador: en ese instante, `setEstado("error")` de `useEstadoGuardado` ya
 * se llamó, pero React todavía no re-renderizó — el botón sigue con
 * `disabled` en el DOM un instante más, y un elemento disabled no puede
 * recibir foco (el intento queda en silencio, sin error, dando la falsa
 * impresión de que esto "no se puede arreglar"). Reintenta en el siguiente
 * frame hasta que el elemento ya no esté disabled (o se acaben los
 * intentos, por si quedó desmontado/removido — ahí el intento final es
 * best-effort y no hace nada si el elemento ya no existe).
 */
export function enfocarCuandoHabilitado(
  el: HTMLElement | null,
  intentosRestantes = 20,
) {
  if (!el || !el.isConnected) return;
  if (!(el instanceof HTMLButtonElement) || !el.disabled) {
    el.focus();
    return;
  }
  if (intentosRestantes <= 0) {
    el.focus();
    return;
  }
  requestAnimationFrame(() => enfocarCuandoHabilitado(el, intentosRestantes - 1));
}
