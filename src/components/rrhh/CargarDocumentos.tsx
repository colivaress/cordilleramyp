"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { createClient } from "@/lib/supabase/client";
import { registrarDocumentos } from "@/app/(app)/rrhh/actions";
import {
  ACCEPT_DOCUMENTOS,
  BUCKET_DOCUMENTOS,
  mimeDocumento,
  problemaDocumento,
  rutaDocumento,
} from "@/lib/rrhh/documentos";

/**
 * Carga de varios documentos a la vez, todos del mismo tipo (§16.2). El
 * navegador sube directo al bucket privado (la RLS de storage solo deja a
 * administrador y adm. de contrato) y después la Server Action registra las
 * filas, verificando que cada archivo exista y sea de este trabajador.
 */
export function CargarDocumentos({
  personalId,
  tipos,
}: {
  personalId: string;
  tipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [tipoId, setTipo] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const guardado = useEstadoGuardado();
  const problemas = archivos.map((a) => problemaDocumento({ nombre: a.name, tamano: a.size })).filter(Boolean) as string[];

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente || !tipoId || archivos.length === 0 || problemas.length) return;
    try {
      await guardado.ejecutar(async () => {
        const supabase = createClient();
        const subidos: { ruta: string; nombre: string; tamano: number }[] = [];
        for (const a of archivos) {
          const ruta = rutaDocumento(personalId, crypto.randomUUID(), a.name);
          const { error } = await supabase.storage
            .from(BUCKET_DOCUMENTOS)
            .upload(ruta, a, { contentType: mimeDocumento(a.name)!, upsert: false });
          if (error) throw new Error(`No se pudo subir "${a.name}".`);
          subidos.push({ ruta, nombre: a.name, tamano: a.size });
        }
        const res = await registrarDocumentos({ personalId, tipoId, archivos: subidos });
        if (!res.ok) throw new Error(res.mensaje);
      });
      toast.success(archivos.length === 1 ? "Documento cargado." : `${archivos.length} documentos cargados.`);
      setArchivos([]);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los documentos.");
    }
  }

  return (
    <form onSubmit={subir} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="doc-tipo">Tipo de documento</Label>
          <select id="doc-tipo" className={nativeSelectClassName} value={tipoId} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Elegir…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-archivos">Archivos</Label>
          <input
            ref={input}
            id="doc-archivos"
            type="file"
            multiple
            accept={ACCEPT_DOCUMENTOS}
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:text-sm"
            onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
          />
        </div>
        <Button type="submit" disabled={guardado.pendiente || !tipoId || archivos.length === 0 || problemas.length > 0}>
          <ContenidoBoton pendiente={guardado.pendiente} texto="Cargar" textoPendiente="Cargando…" />
        </Button>
      </div>
      {problemas.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-danger-700">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Máximo 15 MB por archivo: PDF, Word, Excel, PowerPoint, imágenes, TXT,
        CSV o ZIP. ¿Faltan tipos?{" "}
        <Link href="/rrhh/tipos-documento" className="text-brand-700 underline underline-offset-4">
          Defínelos aquí
        </Link>
        .
      </p>
    </form>
  );
}
