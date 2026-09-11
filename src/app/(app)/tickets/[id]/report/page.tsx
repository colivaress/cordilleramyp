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
import { RevisionInformeSelector } from "@/components/RevisionInformeSelector";
import { puedeReinspeccionar } from "@/lib/ticket-state-machine";
import { ETIQUETA_ESTADO, ETIQUETA_ITEM } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// §4: "Informe de Inspección" (sin "de Flota") — también en la pestaña. Queda
// genérico a propósito: el título real (según tipo) se muestra en el cuerpo
// de la página, no en la pestaña del navegador.
export const metadata: Metadata = { title: "Informe de Inspección" };

// Fase "tipos de inspección" §2 — SOLO Control de Salida, SOLO cuando la
// revisión no tiene ningún ítem no conforme. Texto literal.
const DECLARACION_CONTROL_SALIDA =
  "Declaro que el aseguramiento de la carga esta realizado conforme al instructivo de encarpe y amarre, por tanto certifico que se puede realizar el traslado seguro de esta carga a destino.";

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

  // Fase "tipos de inspección" §1: el título del informe sale de
  // tipos_inspeccion.titulo, nunca compuesto en código.
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "*, supervisor:personal!tickets_supervisor_id_fkey(nombre), tipo:tipos_inspeccion(titulo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();
  const tipoInspeccion = ticket.tipo_inspeccion ?? "encarpe";
  const tituloInforme = ticket.tipo?.titulo ?? "Informe de Inspección";

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
  // Fase "tipos de inspección" §4: `item` trae modo/fotos_requeridas y
  // `fotos` las filas de ticket_checklist_fotos (ítems modo 'fotos').
  const { data: respuestasData } = await supabase
    .from("ticket_checklist_respuestas")
    .select(
      "*, item:checklist_items(nombre, orden, modo, fotos_requeridas), fotos:ticket_checklist_fotos(url, orden)",
    )
    .eq("ticket_id", id)
    .in(
      "revision_numero",
      revsAMostrar.map((r) => r.numero_revision),
    );
  const respuestas = respuestasData ?? [];

  const urlFotos = await firmarRutas(supabase, "fallas", [
    ...respuestas.map((r) => r.foto_url),
    ...respuestas.flatMap((r) => (r.fotos ?? []).map((f) => f.url)),
  ]);
  const urlFirmas = await firmarRutas(
    supabase,
    "firmas",
    revsAMostrar.flatMap((r) => [r.firma_conductor_url, r.firma_fiscalizador_url]),
  );

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
            {/* Fase "tipos de inspección" §1: título según el tipo del ticket,
                sin "Cordillera M&P —" (la marca ya está en el logo). */}
            <p className="text-lg font-semibold">{tituloInforme}</p>
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
          {/* Fase "tipos de inspección" §3: campos condicionales por tipo. */}
          {tipoInspeccion === "control_salida" && (
            <>
              <Dato k="Nombre Encarpador" v={ticket.nombre_encarpador ?? "—"} />
              <Dato k="Nombre Guardia" v={ticket.nombre_guardia ?? "—"} />
            </>
          )}
          {tipoInspeccion === "exportacion_chimolsa" && (
            <Dato k="Nro de Contenedor" v={ticket.nro_contenedor ?? "—"} />
          )}
        </section>

        {revsAMostrar.map((r) => (
          <BloqueRevision
            key={r.id}
            revision={r}
            tipoInspeccion={tipoInspeccion}
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
        </p>
      </div>
    </div>
  );
}

type ItemInfo = {
  nombre: string;
  orden: number;
  modo: "estado" | "fotos";
  fotos_requeridas: number | null;
} | null;

type RespuestaConItem = {
  id: string;
  revision_numero: number;
  item_key: string;
  estado: "conforme" | "no_conforme" | "no_aplica" | null;
  observacion: string | null;
  foto_url: string | null;
  item: ItemInfo;
  fotos: { url: string; orden: number }[] | null;
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
  observacion_general: string | null;
};

function BloqueRevision({
  revision,
  tipoInspeccion,
  conductorFallback,
  vencimientoFallback,
  supervisorNombre,
  respuestas,
  urlFotos,
  urlFirmas,
  conSubtitulo,
}: {
  revision: RevisionRow;
  tipoInspeccion: string;
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

  // Derivado de los ítems (no de la clave del tipo): un checklist es "todo
  // fotos" cuando ninguno de sus ítems tiene Conforme/No conforme/No aplica.
  const esSoloFotos =
    respuestas.length > 0 && respuestas.every((r) => r.item?.modo === "fotos");
  const itemsEstado = respuestas.filter((r) => r.item?.modo !== "fotos");

  const mostrarDeclaracion =
    tipoInspeccion === "control_salida" &&
    !esSoloFotos &&
    !itemsEstado.some((r) => r.estado === "no_conforme");

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

      {esSoloFotos ? (
        <div className="grid gap-4">
          {respuestas.map((r, i) => {
            const fotosOrdenadas = (r.fotos ?? []).sort(
              (a, b) => a.orden - b.orden,
            );
            return (
              <div key={r.id}>
                <p className="mb-1.5 text-sm font-medium">
                  {i + 1}. {r.item?.nombre}
                </p>
                {fotosOrdenadas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {fotosOrdenadas.map((f, j) => (
                      <Image
                        key={j}
                        src={urlFotos[f.url] ?? ""}
                        alt={`${r.item?.nombre} — foto ${j + 1}`}
                        width={220}
                        height={165}
                        unoptimized
                        className="h-32 w-44 rounded border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin fotos</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
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
            {itemsEstado.map((r, i) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-2">{r.item?.nombre}</td>
                <td className="py-1.5 pr-2">
                  {ETIQUETA_ITEM[r.estado ?? "conforme"]}
                </td>
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
      )}

      {mostrarDeclaracion && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm italic">
          {DECLARACION_CONTROL_SALIDA}
        </div>
      )}

      {/* Observación general — común a los 4 tipos, encabezado propio,
          separada de las observaciones por ítem. Se omite si está vacía. */}
      {revision.observacion_general?.trim() && (
        <div className="mt-4">
          <h4 className="mb-1 font-semibold">Observación general</h4>
          <p className="rounded border bg-muted/30 p-2 text-sm">
            {revision.observacion_general.trim()}
          </p>
        </div>
      )}

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
