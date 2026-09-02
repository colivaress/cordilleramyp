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
import { RevisionInformeSelector } from "@/components/RevisionInformeSelector";
import { puedeReinspeccionar } from "@/lib/ticket-state-machine";
import { ETIQUETA_ESTADO, ETIQUETA_ITEM } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// §4: "Informe de Inspección" (sin "de Flota") — también en la pestaña.
export const metadata: Metadata = { title: "Informe de Inspección" };

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtCorta = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { id } = await params;
  const { rev: revParam } = await searchParams;
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

  const { data: revisionesData } = await supabase
    .from("ticket_revisiones")
    .select("*")
    .eq("ticket_id", id)
    .order("numero_revision", { ascending: true });
  const revisiones = revisionesData ?? [];
  if (revisiones.length === 0) notFound();

  const ultima =
    revisiones.find((r) => r.numero_revision === ticket.revision_actual) ??
    revisiones[revisiones.length - 1];

  // §4: con 2+ revisiones aparece el selector. "todas" solo aplica ahí.
  const esMulti = revisiones.length >= 2;
  const numsValidos = new Set(revisiones.map((r) => r.numero_revision));
  const revNum = Number(revParam);
  const modoTodas = esMulti && revParam === "todas";
  const revSel =
    !modoTodas && esMulti && numsValidos.has(revNum)
      ? revisiones.find((r) => r.numero_revision === revNum)!
      : ultima;

  // El default (sin ?rev, o valor inválido) es la revisión más reciente — igual
  // que antes de esta funcionalidad.
  const valorSelector = modoTodas ? "todas" : String(revSel.numero_revision);

  const revsAMostrar = modoTodas ? revisiones : [revSel];

  // Firmar en lote las fotos y firmas de todas las revisiones que se muestran.
  const { data: respuestasData } = await supabase
    .from("ticket_checklist_respuestas")
    .select("*, item:checklist_items(nombre, orden)")
    .eq("ticket_id", id)
    .in(
      "revision_numero",
      revsAMostrar.map((r) => r.numero_revision),
    );
  const respuestas = respuestasData ?? [];

  const urlFotos = await firmarRutas(
    supabase,
    "fallas",
    respuestas.map((r) => r.foto_url),
  );
  const urlFirmas = await firmarRutas(
    supabase,
    "firmas",
    revsAMostrar.flatMap((r) => [r.firma_conductor_url, r.firma_fiscalizador_url]),
  );

  const nombreArchivo = modoTodas
    ? `informe-inspeccion-${ticket.numero_inspeccion}-todas-las-revisiones.pdf`
    : `informe-inspeccion-${ticket.numero_inspeccion}-rev-${revSel.numero_revision}.pdf`;

  const supervisorNombre = ticket.supervisor?.nombre ?? "—";

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

      {/* §4: selector de revisión — solo con 2 o más revisiones. */}
      {esMulti && (
        <div className="no-print mx-auto w-full max-w-3xl">
          <RevisionInformeSelector
            valorActual={valorSelector}
            opciones={[
              ...revisiones.map((r) => ({
                valor: String(r.numero_revision),
                etiqueta: `Revisión ${r.numero_revision} — ${fmtCorta(r.created_at)}`,
              })),
              { valor: "todas", etiqueta: "Todas las revisiones" },
            ]}
          />
        </div>
      )}

      <article className="print-full mx-auto w-full max-w-3xl rounded-xl bg-card p-8 text-sm ring-1 ring-foreground/10">
        <header className="mb-6 flex items-center justify-between gap-4 border-b pb-4">
          {/* §8: título + datos a la izquierda; logo a la derecha (no clicable). */}
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              Cordillera M&amp;P — Informe de Inspección
            </p>
            <p className="text-muted-foreground">
            Nro de Inspección{" "}
            <span className="font-mono font-medium text-foreground">
              {ticket.numero_inspeccion}
            </span>{" "}
            ·{" "}
            {modoTodas ? (
              <>
                Todas las revisiones{" "}
                <span className="font-medium text-foreground">
                  ({revisiones.length})
                </span>{" "}
                · {ETIQUETA_ESTADO[ticket.estado]}
              </>
            ) : (
              <>
                Nro de Revisión{" "}
                <span className="font-mono font-medium text-foreground">
                  {revSel.numero_revision}
                </span>{" "}
                · {ETIQUETA_ESTADO[revSel.estado_resultante]}
              </>
            )}
            </p>
          </div>
          <Image
            src="/logo-cordillera-mp.png"
            alt="Cordillera M&P"
            width={2816}
            height={1408}
            priority
            className="h-20 w-auto shrink-0 object-contain sm:h-24"
          />
        </header>

        <section className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Dato k="Transporte" v={ticket.transporte} />
          {!modoTodas && (
            <Dato k="Conductor" v={revSel.conductor ?? ticket.conductor} />
          )}
          <Dato k="Fecha de inspección" v={fmt(ticket.fecha)} />
          <Dato k="Procedencia" v={ticket.procedencia} />
          <Dato k="Tipo de camión" v={ticket.tipo_camion} />
          <Dato k="Patente camión" v={ticket.patente_camion} />
          <Dato k="Patente rampla" v={ticket.patente_rampla} />
          <Dato k="Supervisor" v={supervisorNombre} />
          {!modoTodas && (
            <Dato
              k="Vencimiento de la corrección"
              v={fmt(revSel.fecha_vencimiento ?? ticket.fecha_vencimiento)}
            />
          )}
        </section>

        {revsAMostrar.map((r) => (
          <BloqueRevision
            key={r.id}
            revision={r}
            conductorFallback={ticket.conductor}
            vencimientoFallback={ticket.fecha_vencimiento}
            supervisorNombre={supervisorNombre}
            respuestas={respuestas
              .filter((x) => x.revision_numero === r.numero_revision)
              .sort((a, b) => (a.item?.orden ?? 0) - (b.item?.orden ?? 0))}
            urlFotos={urlFotos}
            urlFirmas={urlFirmas}
            conSubtitulo={modoTodas}
          />
        ))}
      </article>

      <div className="no-print mx-auto w-full max-w-3xl rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Enviar el informe</p>
          <div className="flex flex-wrap items-center gap-3">
            {/* §4 / §4.2: el PDF corresponde a lo seleccionado en pantalla. */}
            <WhatsAppShareButton
              ticketId={ticket.id}
              rev={valorSelector}
              transporte={ticket.transporte}
              patenteCamion={ticket.patente_camion}
              nombreArchivo={nombreArchivo}
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
              href={`/api/informe/${ticket.id}/enviar?rev=${valorSelector}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              Ver / descargar PDF
            </a>
          </div>
        </div>
        <EmailRecipientsSelect ticketId={ticket.id} rev={valorSelector} />
        <p className="mt-2 text-xs text-muted-foreground">
          {modoTodas
            ? "El PDF adjunto trae el historial completo de revisiones, una tras otra."
            : `El PDF adjunto corresponde a la revisión ${revSel.numero_revision}.`}{" "}
          Por correo: se genera en el servidor y va adjunto en un solo envío
          (cuerpo HTML con el resumen de observaciones; las fotos van en el PDF).
          Por WhatsApp: abre el panel de “Compartir” del dispositivo con el PDF
          adjunto — funciona desde el celular.
        </p>
      </div>
    </div>
  );
}

type RespuestaConItem = {
  id: string;
  revision_numero: number;
  item_key: string;
  estado: "conforme" | "no_conforme" | "no_aplica";
  observacion: string | null;
  foto_url: string | null;
  item: { nombre: string; orden: number } | null;
};

type RevisionRow = {
  id: string;
  numero_revision: number;
  created_at: string;
  estado_resultante: "en_revision" | "finalizada_con_observaciones" | "en_reparacion_de_observaciones" | "finalizada_sin_observaciones";
  conductor: string | null;
  fecha_vencimiento: string | null;
  firma_conductor_url: string | null;
  firma_fiscalizador_url: string | null;
};

function BloqueRevision({
  revision,
  conductorFallback,
  vencimientoFallback,
  supervisorNombre,
  respuestas,
  urlFotos,
  urlFirmas,
  conSubtitulo,
}: {
  revision: RevisionRow;
  conductorFallback: string;
  vencimientoFallback: string | null;
  supervisorNombre: string;
  respuestas: RespuestaConItem[];
  urlFotos: Record<string, string>;
  urlFirmas: Record<string, string>;
  conSubtitulo: boolean;
}) {
  const conductor = revision.conductor ?? conductorFallback;
  const vencimiento = revision.fecha_vencimiento ?? vencimientoFallback;

  return (
    <section className="mb-8 last:mb-0">
      {conSubtitulo && (
        <div className="mb-3 border-b border-brand-200 pb-2">
          <h2 className="text-base font-semibold text-brand-700">
            Revisión {revision.numero_revision} — {fmtCorta(revision.created_at)} ·{" "}
            {ETIQUETA_ESTADO[revision.estado_resultante]}
          </h2>
          <p className="text-xs text-muted-foreground">
            Conductor: {conductor || "—"} · Vencimiento de la corrección:{" "}
            {fmt(vencimiento)}
          </p>
        </div>
      )}

      <h3 className="mb-2 font-semibold">Elementos a Fiscalizar</h3>
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
          {respuestas.map((r, i) => (
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

      <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <Firma
          titulo="Firma Conductor"
          nombre={conductor}
          fecha={fmt(revision.created_at)}
          url={
            revision.firma_conductor_url
              ? urlFirmas[revision.firma_conductor_url]
              : undefined
          }
        />
        <Firma
          titulo="Firma Fiscalizador/Supervisor"
          nombre={supervisorNombre}
          fecha={fmt(revision.created_at)}
          url={
            revision.firma_fiscalizador_url
              ? urlFirmas[revision.firma_fiscalizador_url]
              : undefined
          }
        />
      </div>
    </section>
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
