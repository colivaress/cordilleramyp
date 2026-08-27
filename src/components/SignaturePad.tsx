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
 */
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { label: string; onChange?: (dataUrl: string | null) => void }
>(function SignaturePad({ label, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [vacio, setVacio] = useState(true);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
    clear: () => {
      padRef.current?.clear();
      setVacio(true);
      onChange?.(null);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const resize = () => {
      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = 180 * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
      setVacio(true);
    };
    resize();

    const pad = new SignaturePadLib(canvas, {
      penColor: "#0f172a",
      backgroundColor: "rgba(255,255,255,0)",
    });
    padRef.current = pad;

    const onEnd = () => {
      setVacio(pad.isEmpty());
      onChange?.(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", onEnd);
    window.addEventListener("resize", resize);

    return () => {
      pad.removeEventListener("endStroke", onEnd);
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            padRef.current?.clear();
            setVacio(true);
            onChange?.(null);
          }}
        >
          Limpiar
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-[180px] w-full touch-none rounded-lg border border-input bg-white"
      />
      {vacio && (
        <p className="text-xs text-muted-foreground">Firmar en el recuadro.</p>
      )}
    </div>
  );
});
