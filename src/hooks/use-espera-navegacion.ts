"use client";

import { useEffect, useRef } from "react";

const TIMEOUT_NAVEGACION_MS = 15000;

/**
 * Se lanza SOLO cuando la guardia anti-deadlock se rinde — es decir, cuando
 * la acción del servidor (finalizarInspeccion/finalizarReinspeccion) YA
 * TERMINÓ BIEN y lo único que no se pudo confirmar es la navegación al
 * informe. Es un tipo de error distinto a propósito: si el mensaje dijera
 * "error" o "falló", el supervisor cree que perdió el trabajo y vuelve a
 * apretar "Finalizar revisión" — ahí la guardia del servidor lo rechaza con
 * "ya fue finalizada" y queda con dos avisos seguidos pensando que se perdió
 * todo. El llamador debe mostrar esto con un toast NO alarmante (warning,
 * no error) y nunca reformular el texto — distinguir "la acción falló" de
 * "la acción salió bien pero no pude mostrarte el resultado" es lo único que
 * separa esas dos experiencias.
 */
export class NavegacionNoConfirmadaError extends Error {}

/**
 * "Esperar a que la navegación esté confirmada" — Next.js no da una promesa
 * que indique cuándo router.push() terminó de mostrar la página nueva. El
 * overlay bloqueante de "Finalizar revisión" tiene que seguir visible hasta
 * que el informe esté en pantalla, no hasta que la acción del servidor
 * respondió — antes se ocultaba apenas terminaba finalizarInspeccion() y
 * router.push(), dejando la pantalla vieja sola durante la navegación real
 * (~0.6-1s medido localmente, más en una conexión de patio).
 *
 * El mecanismo: al llamar router.push() hacia la ruta nueva, ESTE componente
 * (el formulario/botón que dispara la navegación) se desmonta apenas la
 * página de destino está lista para mostrarse — es Next.js reemplazando el
 * árbol. El overlay, portado a document.body pero hijo de este árbol en
 * React, se desmonta CON él, en el mismo instante. Por eso alcanza con
 * devolver una promesa que NUNCA se resuelve por su cuenta en el camino
 * feliz — el desmontaje la abandona sola, sin nada colgado ni fugas.
 *
 * Guardia anti-deadlock (obligatoria — sin esto, una navegación que nunca
 * se confirma deja al supervisor con el overlay bloqueado para siempre): si
 * este componente SIGUE montado más allá de `timeoutMs`, la promesa se
 * RECHAZA. El llamador (useAccionLarga.ejecutar) atrapa eso, esconde el
 * overlay, y el catch de más arriba muestra el error — nunca se queda
 * esperando indefinidamente.
 */
export function useEsperaNavegacion() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function esperar(timeoutMs: number = TIMEOUT_NAVEGACION_MS): Promise<never> {
    return new Promise((_resolve, reject) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        reject(
          new NavegacionNoConfirmadaError(
            "La inspección se finalizó correctamente, pero no pudimos mostrarte el informe. Búscalo en el listado de inspecciones.",
          ),
        );
      }, timeoutMs);
    });
  }

  return esperar;
}
