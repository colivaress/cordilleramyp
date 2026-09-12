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
