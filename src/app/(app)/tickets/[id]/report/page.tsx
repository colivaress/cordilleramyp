import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firmarRutas } from "@/lib/storage";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/PrintButton";
import { EmailRecipientsSelect } from "@/components/EmailRecipientsSelect";
import { WhatsAppShareButton } from "@/components/WhatsAppShareButton";
import { puedeReinspeccionar } from "@/lib/ticket-state-machine";
import { ETIQUETA_ESTADO, ETIQUETA_ITEM } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// §4: "Informe de Inspección" (sin "de Flota") — también en la pestaña.
export const metadata: Metadata = { title: "Informe de Inspección" };

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function InformePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // La vista del informe es la misma para supervisor y administrador — §2.6.
  const { perfil } = await getSesion();
  const esSupervisor = perfil.rol === "supervisor";
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*, supervisor:personal!tickets_supervisor_id_fkey(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  const { data: revision } = await supabase
    .from("ticket_revisiones")
    .select("*")
    .eq("ticket_id", id)
    .eq("numero_revision", ticket.revision_actual)
    .maybeSingle();

  const { data: respuestas } = await supabase
    .from("ticket_checklist_respuestas")
    .select("*, item:checklist_items(nombre, orden)")
    .eq("ticket_id", id)
    .eq("revision_numero", ticket.revision_actual);

  const items = (respuestas ?? []).sort(
    (a, b) => (a.item?.orden ?? 0) - (b.item?.orden ?? 0),
  );

  const urlFotos = await firmarRutas(
    supabase,
    "fallas",
    items.map((r) => r.foto_url),
  );
  const urlFirmas = await firmarRutas(supabase, "firmas", [
    revision?.firma_conductor_url,
    revision?.firma_fiscalizador_url,
  ]);


  return (
    <div className="grid gap-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Informe de Inspección</h1>
        {/* §2.6: "Ver" de la tabla entra acá; se traen las acciones que antes
            solo estaban en el detalle del ticket. */}
        <div className="flex flex-wrap items-center gap-2">
          {esSupervisor && puedeReinspeccionar(ticket.estado) && (
            <Link
              href={`/tickets/${id}/reinspeccion`}
              className={buttonVariants({ size: "sm" })}
            >
              Registrar re-inspección
            </Link>
          )}
          <Link
            href={`/tickets/${id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Ver historial completo
          </Link>
          <PrintButton />
        </div>
      </div>

      <article className="print-full mx-auto w-full max-w-3xl rounded-xl bg-card p-8 text-sm ring-1 ring-foreground/10">
        <header className="mb-6 border-b pb-4">
          <p className="text-lg font-semibold">
            Cordillera M&amp;P — Informe de Inspección
          </p>
          <p className="text-muted-foreground">
            Nro de Inspección{" "}
            <span className="font-mono font-medium text-foreground">
              {ticket.numero_inspeccion}
            </span>{" "}
            · Nro de Revisión{" "}
            <span className="font-mono font-medium text-foreground">
              {ticket.revision_actual}
            </span>{" "}
            · {ETIQUETA_ESTADO[ticket.estado]}
          </p>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Dato k="Transporte" v={ticket.transporte} />
          <Dato k="Conductor" v={ticket.conductor} />
          <Dato k="Fecha de inspección" v={fmt(ticket.fecha)} />
          <Dato k="Procedencia" v={ticket.procedencia} />
          <Dato k="Tipo de camión" v={ticket.tipo_camion} />
          <Dato k="Patente camión" v={ticket.patente_camion} />
          <Dato k="Patente rampla" v={ticket.patente_rampla} />
          <Dato k="Supervisor" v={ticket.supervisor?.nombre ?? "—"} />
          <Dato
            k="Vencimiento de la corrección"
            v={fmt(revision?.fecha_vencimiento ?? ticket.fecha_vencimiento)}
          />
        </section>

        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Elementos a Fiscalizar</h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Elemento</th>
                <th className="py-1 pr-2">Resultado</th>
                <th className="py-1">Observación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                  <td className="py-1.5 pr-2">{r.item?.nombre}</td>
                  <td className="py-1.5 pr-2">{ETIQUETA_ITEM[r.estado]}</td>
                  <td className="py-1.5">
                    {r.estado === "no_conforme" ? (
                      <div className="grid gap-1">
                        <span>{r.observacion}</span>
                        {r.foto_url && urlFotos[r.foto_url] && (
                          <Image
                            src={urlFotos[r.foto_url]}
                            alt={`Falla ${r.item?.nombre}`}
                            width={200}
                            height={150}
                            unoptimized
                            className="mt-1 h-32 w-44 rounded border object-cover"
                          />
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <Firma
            titulo="Firma Conductor"
            nombre={ticket.conductor}
            fecha={fmt(revision?.created_at ?? null)}
            url={
              revision?.firma_conductor_url
                ? urlFirmas[revision.firma_conductor_url]
                : undefined
            }
          />
          <Firma
            titulo="Firma Fiscalizador/Supervisor"
            nombre={ticket.supervisor?.nombre ?? "—"}
            fecha={fmt(revision?.created_at ?? null)}
            url={
              revision?.firma_fiscalizador_url
                ? urlFirmas[revision.firma_fiscalizador_url]
                : undefined
            }
          />
        </section>
      </article>

      <div className="no-print mx-auto w-full max-w-3xl rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Enviar el informe</p>
          <div className="flex flex-wrap items-center gap-3">
            {/* §4.2: compartir el PDF por WhatsApp con el "Compartir" nativo. */}
            <WhatsAppShareButton
              ticketId={ticket.id}
              transporte={ticket.transporte}
              patenteCamion={ticket.patente_camion}
              nombreArchivo={`informe-inspeccion-${ticket.numero_inspeccion}-rev-${ticket.revision_actual}.pdf`}
            />
            {/* §4.3: volver al listado — admin y supervisor van a /dashboard,
                que se renderiza según el rol. */}
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Volver a las inspecciones
            </Link>
            <a
              href={`/api/informe/${ticket.id}/enviar`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              Ver / descargar PDF
            </a>
          </div>
        </div>
        <EmailRecipientsSelect ticketId={ticket.id} />
        <p className="mt-2 text-xs text-muted-foreground">
          Por correo: el PDF se genera en el servidor y va adjunto en un solo
          envío (cuerpo HTML con el resumen de observaciones; las fotos van en el
          PDF). Por WhatsApp: abre el panel de “Compartir” del dispositivo con el
          PDF adjunto — funciona desde el celular.
        </p>
      </div>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Firma({
  titulo,
  nombre,
  fecha,
  url,
}: {
  titulo: string;
  nombre: string;
  fecha: string;
  url?: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      {url ? (
        <Image
          src={url}
          alt={titulo}
          width={280}
          height={110}
          unoptimized
          className="h-24 w-full rounded border bg-white object-contain"
        />
      ) : (
        <div className="h-24 rounded border border-dashed" />
      )}
      <span className="font-medium">{nombre}</span>
      <span className="text-xs text-muted-foreground">{fecha}</span>
    </div>
  );
}
