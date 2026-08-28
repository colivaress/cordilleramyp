"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { DestinatarioCorreo } from "@/lib/tipos";

/**
 * Selector MULTI-destinatario (checkboxes) poblado desde destinatarios_correo — §4.1.
 * "Enviar por correo" hace POST al endpoint que genera el PDF del informe en el
 * servidor y lo manda adjunto en un solo envío.
 */
export function EmailRecipientsSelect({ ticketId }: { ticketId: string }) {
  const [lista, setLista] = useState<DestinatarioCorreo[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

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
    const destinatarios = [
      ...seleccion,
      ...extra
        .split(/[;,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    if (destinatarios.length === 0) {
      toast.error("Seleccionar al menos un destinatario.");
      return;
    }
    setEnviando(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/informe/${ticketId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatarios }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "No se pudo enviar el informe.");
        return;
      }
      const kb = Math.round((data.pdfBytes ?? 0) / 1024);
      if (data.modo === "ethereal") {
        setPreview(data.previewUrl ?? null);
        toast.success(
          `Informe enviado a ${data.enviados} destinatario(s) — PDF adjunto (${kb} KB). Modo prueba: ver abajo.`,
        );
      } else {
        toast.success(
          `Informe enviado a ${data.enviados} destinatario(s) con el PDF adjunto (${kb} KB).`,
        );
      }
    } catch {
      toast.error("Error de red al enviar el informe.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Enviar informe por correo</p>
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando destinatarios…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay destinatarios cargados en <code>destinatarios_correo</code>. Se
          pueden escribir correos manualmente abajo.
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
      <Button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="w-fit"
      >
        <MailIcon />
        {enviando ? "Enviando…" : "Enviar por correo"}
      </Button>
      {preview && (
        <p className="text-xs text-muted-foreground">
          Vista previa del correo enviado (modo prueba):{" "}
          <a
            href={preview}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            abrir
          </a>
        </p>
      )}
    </div>
  );
}
