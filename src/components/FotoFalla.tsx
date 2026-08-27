"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * §2.4: miniatura de la foto de un ítem no conforme; al hacer clic se abre en
 * grande en un lightbox (modal), no en una pestaña nueva.
 */
export function FotoFalla({ src, alt }: { src: string; alt: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group relative block h-24 w-40 overflow-hidden rounded-md border transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Ampliar foto: ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes="160px"
          className="object-cover"
        />
        <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          Ampliar
        </span>
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="w-[min(92vw,900px)] max-w-none bg-card p-3 sm:max-w-none">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="relative max-h-[80vh] w-full">
            <Image
              src={src}
              alt={alt}
              width={1600}
              height={1200}
              unoptimized
              className="h-auto max-h-[80vh] w-full rounded object-contain"
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">{alt}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
