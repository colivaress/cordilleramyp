"use client";

import { InfoIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Ícono "i" al lado del nombre del elemento del checklist (§2.4).
 * Abre un popover liviano con el texto de "Exigencias para Cargar".
 * El texto llega por prop desde la tabla checklist_items — no se hardcodea.
 */
export function InfoPopover({
  titulo,
  exigencia,
}: {
  titulo: string;
  exigencia: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-full text-muted-foreground",
        )}
        aria-label={`Exigencias para cargar: ${titulo}`}
      >
        <InfoIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverTitle>{titulo} — Exigencias para Cargar</PopoverTitle>
        <PopoverDescription>{exigencia}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
