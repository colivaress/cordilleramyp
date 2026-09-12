"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { useAccionLarga } from "@/hooks/use-accion-larga";
import { createClient } from "@/lib/supabase/client";
import type { DestinatarioCorreo } from "@/lib/tipos";

/**
 * Selector MULTI-destinatario (checkboxes) poblado desde destinatarios_correo — §4.1.
 * "Enviar por correo" hace POST al endpoint que genera el PDF del informe en el
 * servidor y lo manda adjunto en un solo envío.
 *
 * Retroalimentación visual: nivel 1 en el botón (useEstadoGuardado, deshabilita
 * de inmediato — sin doble envío, dos correos al cliente sería el peor caso) +
 * nivel 2 overlay bloqueante (useAccionLarga) porque generar el PDF y enviarlo
 * puede tardar segundos y el usuario no debe tocar nada más mientras tanto.
 */
export function EmailRecipientsSelect({
  ticketId,
  // §4: revisión seleccionada en el informe ("todas" o el número). El PDF que se
  // envía corresponde a eso.
  rev = "",
}: {
  ticketId: string;
  rev?: string;
}) {
  const [lista, setLista] = useState<DestinatarioCorreo[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const guardado = useEstadoGuardado();
  const overlay = useAccionLarga();

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("destinatarios_correo")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      setLista(data ?? []);
      setCargando(false);
    })();
  }, []);

  function toggle(email: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function enviar() {
    const destinatarios = [...seleccion];
    if (destinatarios.length === 0) {
      toast.error("Seleccionar al menos un destinatario.");
      return;
    }
    try {
      await guardado.ejecutar(() =>
        overlay.ejecutar(async () => {
          const qs = rev ? `?rev=${encodeURIComponent(rev)}` : "";
          const res = await fetch(`/api/informe/${ticketId}/enviar${qs}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinatarios }),
          });
          const data = await res.json().catch(() => ({}));
          // §4.1: sin modo prueba. Solo "éxito" si el correo salió de verdad.
          if (!res.ok || !data.ok) {
            throw new Error(
              data.error ?? "No se pudo enviar el informe por correo.",
            );
          }
          const kb = Math.round((data.pdfBytes ?? 0) / 1024);
          toast.success(
            `Informe enviado a ${data.enviados} destinatario(s) con el PDF adjunto (${kb} KB).`,
          );
        }, "Enviando informe…"),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error de red al enviar el informe.",
      );
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Enviar informe por correo</p>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando destinatarios…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay destinatarios configurados. Pedile a un administrador que
          cargue al menos uno para poder enviar el informe por correo.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((d) => (
            <li key={d.id}>
              <Label className="items-start gap-2 font-normal">
                <Checkbox
                  checked={seleccion.has(d.email)}
                  onCheckedChange={() => toggle(d.email)}
                />
                <span>
                  <span className="font-medium">{d.nombre}</span>
                  {d.cargo ? (
                    <span className="text-muted-foreground"> · {d.cargo}</span>
                  ) : null}
                  <br />
                  <span className="text-xs text-muted-foreground">{d.email}</span>
                </span>
              </Label>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        onClick={enviar}
        disabled={guardado.pendiente || seleccion.size === 0}
        aria-busy={guardado.pendiente}
        className="w-fit"
      >
        <ContenidoBoton
          pendiente={guardado.pendiente}
          texto="Enviar por correo"
          textoPendiente="Generando informe y enviando…"
          icono={MailIcon}
        />
      </Button>
      <OverlayBloqueante visible={overlay.visible} mensaje={overlay.mensaje} />
    </div>
  );
}
