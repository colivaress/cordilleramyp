import { cn } from "@/lib/utils";
import { ETIQUETA_ITEM, type ItemEstado } from "@/lib/tipos";

// §6: conforme -> success, no_conforme -> danger, no_aplica -> neutral.
const CLASES: Record<ItemEstado, string> = {
  conforme: "bg-success-100 text-success-700",
  no_conforme: "bg-danger-100 text-danger-700",
  no_aplica: "bg-neutral-100 text-neutral-700",
};

export function ItemEstadoBadge({ estado }: { estado: ItemEstado | null }) {
  // §2.7 de la fase: un ítem sin responder tiene estado null. cerrarRevision
  // ya no permite cerrar una revisión con ítems modo 'estado' sin responder,
  // así que esto no debería aparecer para una revisión cerrada — pero si
  // aparece (dato viejo, o esta vista mostrando una revisión aún abierta),
  // hay que decir la verdad, nunca asumir "Conforme".
  if (estado == null) {
    return (
      <span className="inline-flex h-5 w-fit items-center rounded-4xl bg-warning-100 px-2 text-xs font-medium text-warning-700">
        Sin responder
      </span>
    );
  }
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
