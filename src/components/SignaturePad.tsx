"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
};

/**
 * Área de firma digital sobre <canvas> (§2.5). Reutilizable — se instancian dos
 * (conductor y fiscalizador). Botón "Limpiar". Captura mouse/touch.
 *
 * §2.8: la firma no debe perderse al navegar entre pasos del wizard. Para eso:
 *  - `onChange` avisa el PNG (dataURL) apenas se termina un trazo, para que el
 *    padre lo persista (estado + subida inmediata a Storage);
 *  - `initialDataUrl` re-dibuja una firma ya capturada al re-montar/re-mostrar;
 *  - el componente re-dibuja tras un resize (signature_pad limpia el canvas al
 *    cambiar su tamaño) y cuando vuelve a ser visible.
 */
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    label: string;
    visible?: boolean;
    initialDataUrl?: string | null;
    onChange?: (dataUrl: string | null) => void;
  }
>(function SignaturePad({ label, visible = true, initialDataUrl = null, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  // Última firma conocida (sobrevive a resize / ocultar-mostrar / re-montar).
  const dataUrlRef = useRef<string | null>(initialDataUrl);
  const [vacio, setVacio] = useState(!initialDataUrl);

  useImperativeHandle(ref, () => ({
    isEmpty: () =>
      padRef.current ? padRef.current.isEmpty() : !dataUrlRef.current,
    toDataURL: () =>
      (padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL("image/png")
        : dataUrlRef.current) ?? "",
    clear: () => {
      padRef.current?.clear();
      dataUrlRef.current = null;
      setVacio(true);
      onChange?.(null);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    const ajustar = () => {
      const { width } = canvas.getBoundingClientRect();
      if (width === 0) return false; // oculto: no tocar el canvas
      canvas.width = width * ratio;
      canvas.height = 180 * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      return true;
    };
    const redibujar = () => {
      const url = dataUrlRef.current;
      if (url && padRef.current) {
        padRef.current
          .fromDataURL(url)
          .then(() => setVacio(false))
          .catch(() => {});
      }
    };
    const onResize = () => {
      if (!ajustar()) return;
      padRef.current?.clear();
      redibujar();
    };

    ajustar();
    const pad = new SignaturePadLib(canvas, {
      penColor: "#0f172a",
      backgroundColor: "rgba(255,255,255,0)",
    });
    padRef.current = pad;
    redibujar(); // pinta initialDataUrl si vino

    const onEnd = () => {
      const url = pad.isEmpty() ? null : pad.toDataURL("image/png");
      dataUrlRef.current = url;
      setVacio(!url);
      onChange?.(url);
    };
    pad.addEventListener("endStroke", onEnd);

    // Hallazgo de la investigación del pad "muerto" en iPhone (bloque 5):
    // antes esto escuchaba `window`'s "resize" — que en iOS Safari también
    // se dispara cada vez que el TECLADO aparece o desaparece en CUALQUIER
    // campo de la página (una observación de un ítem no conforme, el
    // textarea de observación general), no solo cuando el ancho real del
    // canvas cambia. Cada disparo reseteaba las dimensiones del canvas
    // (`ajustar()` — cambiar width/height de un <canvas> siempre borra su
    // contenido, es comportamiento nativo) y llamaba `pad.clear()` en medio
    // de lo que sea que estuviera pasando — si el dedo seguía sobre el
    // canvas en ese instante (por ejemplo, tocando el textarea de un ítem
    // justo arriba de las firmas en una pantalla chica), es plausible que
    // el trazo en curso quedara con el puntero "levantado" a medias del
    // lado de signature_pad, dejando el pad sin responder a toques nuevos
    // hasta el próximo resize. Esto no está confirmado como LA causa — no
    // se pudo reproducir de forma confiable en este entorno (mismo
    // problema que otros bugs específicos de iOS de este proyecto) — pero
    // es la hipótesis con más sustento del código real, y observar el
    // tamaño del propio <canvas> en vez de una señal indirecta del window
    // es estrictamente más correcto de cualquier forma: un ResizeObserver
    // solo dispara cuando ESTE elemento cambia de tamaño de verdad (p. ej.
    // rotar el teléfono, o cruzar el breakpoint sm:grid-cols-2), nunca por
    // un teclado abriéndose en un campo de texto en otra parte de la
    // página. Las cuatro preguntas de la investigación original siguen
    // abiertas — esto reduce un disparador real, no cierra el caso.
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);

    return () => {
      pad.removeEventListener("endStroke", onEnd);
      observer.disconnect();
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §2.8: al reabrir el paso Firmas (o si cambió el ancho mientras estaba oculto)
  // reajustar y volver a pintar la firma guardada.
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width } = canvas.getBoundingClientRect();
    if (width === 0) return;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = width * ratio;
      canvas.height = 180 * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
    }
    if (pad.isEmpty() && dataUrlRef.current) {
      pad
        .fromDataURL(dataUrlRef.current)
        .then(() => setVacio(false))
        .catch(() => {});
    }
  }, [visible]);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <canvas
        ref={canvasRef}
        className="h-[180px] w-full touch-none rounded-lg border border-input bg-white"
      />
      {vacio ? (
        <p className="text-xs text-muted-foreground">Firmar en el recuadro.</p>
      ) : (
        <p className="text-xs text-success-700">Firma capturada y guardada.</p>
      )}
      {/* Fila propia, debajo del canvas y del texto de estado — no debe
          quedar al lado de donde el dedo firma (ver §9). */}
      <Button
        type="button"
        variant="outline"
        className="mt-1 w-fit"
        onClick={() => {
          padRef.current?.clear();
          dataUrlRef.current = null;
          setVacio(true);
          onChange?.(null);
        }}
      >
        Limpiar
      </Button>
    </div>
  );
});
