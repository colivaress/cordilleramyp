"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { enlaceMailto } from "@/lib/mensajes";
import type { DestinatarioCorreo } from "@/lib/tipos";

/**
 * Selector MULTI-destinatario (checkboxes, no <select> único) poblado desde
 * destinatarios_correo — §4. "Enviar por correo" abre el cliente de correo del
 * usuario (mailto:) con todos los seleccionados y el cuerpo prellenado.
 */
export function EmailRecipientsSelect({
  ticketId,
  asunto,
  cuerpo,
}: {
  ticketId: string;
  asunto: string;
  cuerpo: string;
}) {
  const [lista, setLista] = useState<DestinatarioCorreo[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [cargando, setCargando] = useState(true);

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
    const correos = [
      ...seleccion,
      ...extra
        .split(/[;,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    if (correos.length === 0) {
      toast.error("Seleccioná al menos un destinatario.");
      return;
    }
    window.location.href = enlaceMailto(correos, asunto, cuerpo);

    const supabase = createClient();
    await supabase.from("notificaciones").insert(
      correos.map((email) => ({
        ticket_id: ticketId,
        tipo: "email" as const,
        destinatario: email,
        contenido: asunto,
      })),
    );
    toast.success(
      `Se abrió el cliente de correo para ${correos.length} destinatario(s). Adjuntá el PDF del informe antes de enviar.`,
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Enviar informe por correo</p>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando destinatarios…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay destinatarios cargados en <code>destinatarios_correo</code>.
          Podés escribir correos manualmente abajo.
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
      <div className="grid gap-1.5">
        <Label htmlFor="extra-correos">Otros correos (separados por coma)</Label>
        <Input
          id="extra-correos"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="jefe.flota@empresa.cl, taller@empresa.cl"
        />
      </div>
      <Button type="button" onClick={enviar} className="w-fit">
        <MailIcon />
        Enviar por correo
      </Button>
    </div>
  );
}
