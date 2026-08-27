import { cn } from "@/lib/utils";
import { ETIQUETA_ITEM, type ItemEstado } from "@/lib/tipos";

// §6: conforme -> success, no_conforme -> danger, no_aplica -> neutral.
const CLASES: Record<ItemEstado, string> = {
  conforme: "bg-success-100 text-success-700",
  no_conforme: "bg-danger-100 text-danger-700",
  no_aplica: "bg-neutral-100 text-neutral-700",
};

export function ItemEstadoBadge({ estado }: { estado: ItemEstado }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 text-xs font-medium",
        CLASES[estado],
      )}
    >
      {ETIQUETA_ITEM[estado]}
    </span>
  );
}
