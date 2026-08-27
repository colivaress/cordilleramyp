"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniciarReparacion } from "@/app/(app)/tickets/actions";

export function BotonIniciarReparacion({ ticketId }: { ticketId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await iniciarReparacion(ticketId);
            toast.success("Ticket en reparación de observaciones.");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
          }
        })
      }
    >
      <WrenchIcon />
      Iniciar reparación
    </Button>
  );
}
