"use client";

import { useEffect, useRef, useState } from "react";
import { FileTextIcon, Loader2Icon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Ver / descargar PDF" — enlace directo (`<a target="_blank">`), NO
 * fetch+blob. Se probó la variante fetch+blob y se revirtió a propósito:
 * el navegador tiene que seguir abriendo el PDF transmitido en su visor
 * nativo, sin cargarlo entero en memoria antes de mostrar nada — con señal
 * mala un blob no muestra nada hasta terminar de bajar, las descargas por
 * blob fallan o se comportan raro en varios navegadores móviles, y este
 * documento lo abre un guardia de portería con el camión esperando (§5 de
 * la fase "tipos de inspección" / auditoría de uso en teléfono) — necesita
 * el visor nativo del PDF, no un archivo para descargar.
 *
 * La única retroalimentación que se agrega es un acuse visual breve del
 * click (texto + spinner por ~1.5s) — nunca se llama `preventDefault`, así
 * que el navegador sigue el enlace nativo de inmediato, en paralelo. No
 * depende de si la pestaña nueva terminó de cargar (eso no es observable
 * desde acá) — solo confirma que el click se registró.
 */
export function VerPdfButton({
  ticketId,
  rev = "",
}: {
  ticketId: string;
  rev?: string;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function onClick() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAbriendo(true);
    timerRef.current = setTimeout(() => setAbriendo(false), 1500);
  }

  const qs = rev ? `?rev=${encodeURIComponent(rev)}` : "";

  return (
    <a
      href={`/api/informe/${ticketId}/enviar${qs}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {abriendo ? (
        <Loader2Icon className="animate-spin motion-reduce:animate-none" />
      ) : (
        <FileTextIcon />
      )}
      {abriendo ? "Abriendo…" : "Ver / descargar PDF"}
    </a>
  );
}
