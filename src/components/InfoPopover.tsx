"use client";

import { InfoIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

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
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
