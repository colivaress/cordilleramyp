"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { OverlayBloqueante } from "@/components/ui/overlay-bloqueante";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { enfocarCuandoHabilitado, useAccionLarga } from "@/hooks/use-accion-larga";
import { createClient } from "@/lib/supabase/client";
import type { DestinatarioCorreo } from "@/lib/tipos";

/**
 * Lista de destinatarios configurados — solo informativa, sin selección.
 * Decisión de producto: el supervisor ya no elige a quién llegó el informe
 * — "Enviar por correo" lo manda a TODOS los configurados para este tipo.
 * La lista que se MUESTRA acá y la lista a la que se ENVÍA tienen que ser
 * la misma: esta consulta usa exactamente el mismo filtro que la ruta del
 * servidor (tipo_inspeccion, recibe_informes, activo) — la ruta ya no
 * acepta destinatarios desde el cliente, los deriva ella misma con esta
 * misma condición (ver route.ts). Mostrar acá algo que el servidor no
 * fuera a usar sería mentirle al supervisor sobre a quién le llegó.
 *
 * "Enviar por correo" hace POST (sin body — nada que mandar, el servidor
 * no necesita nada del cliente para decidir a quién) al endpoint que genera
 * el PDF del informe y lo manda adjunto en un solo envío.
 *
 * Retroalimentación visual: nivel 1 en el botón (useEstadoGuardado, deshabilita
 * de inmediato — sin doble envío, dos correos al cliente sería el peor caso) +
 * nivel 2 overlay bloqueante (useAccionLarga) porque generar el PDF y enviarlo
 * puede tardar segundos y el usuario no debe tocar nada más mientras tanto.
 */
export function EmailRecipientsSelect({
  ticketId,
  tipoInspeccion,
  // §4: revisión seleccionada en el informe ("todas" o el número). El PDF que se
  // envía corresponde a eso.
  rev = "",
}: {
  ticketId: string;
  /** Destinatarios por tipo de inspección: la lista se filtra a quienes
   *  están autorizados para ESTE tipo (destinatarios_correo_tipos,
   *  recibe_informes) — es solo para MOSTRAR; el servidor vuelve a
   *  calcularla por su cuenta al enviar, no confía en esto. */
  tipoInspeccion: string;
  rev?: string;
}) {
  const [lista, setLista] = useState<DestinatarioCorreo[]>([]);
  const [cargando, setCargando] = useState(true);
  const guardado = useEstadoGuardado();
  const overlay = useAccionLarga();

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("destinatarios_correo_tipos")
        .select("destinatario:destinatarios_correo!inner(*)")
        .eq("tipo_inspeccion", tipoInspeccion)
        .eq("recibe_informes", true)
        .eq("destinatarios_correo.activo", true);
      const destinatarios = (data ?? [])
        .map((d) => d.destinatario)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      setLista(destinatarios);
      setCargando(false);
    })();
  }, [tipoInspeccion]);

  async function enviar() {
    // Capturado antes de guardado.ejecutar (que deshabilita el botón de
    // forma síncrona) y restaurado en el finally de afuera, DESPUÉS de que
    // guardado.ejecutar también terminó — ver el comentario grande en
    // useAccionLarga sobre por qué tiene que vivir en este borde exterior.
    const elementoDisparador =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (lista.length === 0) {
      toast.error("No hay destinatarios configurados.");
      return;
    }
    try {
      await guardado.ejecutar(() =>
        overlay.ejecutar(async () => {
          const qs = rev ? `?rev=${encodeURIComponent(rev)}` : "";
          // Sin body: el servidor deriva la lista de destinatarios por su
          // cuenta (mismo filtro que esta pantalla usa para mostrarla) — no
          // acepta ninguna desde acá. Ver el comentario grande arriba.
          const res = await fetch(`/api/informe/${ticketId}/enviar${qs}`, {
            method: "POST",
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
    } finally {
      enfocarCuandoHabilitado(elementoDisparador);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Enviar informe por correo</p>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando destinatarios…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay destinatarios configurados. Pídele a un administrador que
          cargue al menos uno para poder enviar el informe por correo.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((d) => (
            <li key={d.id}>
              <span className="font-medium">{d.nombre}</span>
              {d.cargo ? (
                <span className="text-muted-foreground"> · {d.cargo}</span>
              ) : null}
              <br />
              <span className="text-xs text-muted-foreground">{d.email}</span>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        onClick={enviar}
        disabled={guardado.pendiente || lista.length === 0}
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
