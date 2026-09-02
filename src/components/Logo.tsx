import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo real de Cordillera M&P (§8). PNG con fondo blanco, proporción 2:1.
 * Va solo, sin texto al lado. `imgClassName` fija el alto (por defecto el del
 * header de la app).
 */
export function Logo({
  imgClassName = "h-24 w-auto",
}: {
  imgClassName?: string;
}) {
  return (
    <Image
      src="/logo-cordillera-mp.png"
      alt="Cordillera M&P"
      width={2816}
      height={1408}
      priority
      className={cn("object-contain", imgClassName)}
    />
  );
}
