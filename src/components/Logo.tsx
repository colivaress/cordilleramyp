import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo real de Cordillera M&P (§8). PNG con fondo blanco, proporción 2:1.
 * `conTexto` agrega el nombre al lado (se oculta en pantallas angostas para que
 * el header no se apriete en celular — la imagen ya trae el nombre de la marca).
 */
export function Logo({
  className,
  imgClassName = "h-12 w-auto",
  conTexto = true,
}: {
  className?: string;
  imgClassName?: string;
  conTexto?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Image
        src="/logo-cordillera-mp.png"
        alt="Cordillera M&P"
        width={2816}
        height={1408}
        priority
        className={cn("object-contain", imgClassName)}
      />
      {conTexto && (
        <span className="hidden font-semibold tracking-tight sm:inline">
          Cordillera <span className="text-primary">M&amp;P</span>
        </span>
      )}
    </span>
  );
}
