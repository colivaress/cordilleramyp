import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales, formatearCLP } from "@/lib/dinero";
import { nombreCompleto } from "@/lib/mensajes";
import { formatearRut } from "@/lib/rut";
import {
  enlaceTel,
  enlaceWhatsApp,
  formatearTelefonoCl,
} from "@/lib/telefono";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ETIQUETA_ESTADO_COTIZACION,
  VARIANTE_ESTADO_COTIZACION,
} from "../estados";
import { EmitirCotizacion } from "./EmitirCotizacion";

export const dynamic = "force-dynamic";

const fmtFechaHora = (v: string) =>
  new Date(v).toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const fmtFecha = (v: string) =>
  new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { perfil } = await requireRol(
    "administrador",
    "administrador_contrato",
  );
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("cotizaciones_fletes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!s) notFound();

  const esEmpresa = s.tipo_solicitante === "empresa";
  const tel = enlaceTel(s.telefono);
  const wa = s.tiene_whatsapp
    ? enlaceWhatsApp(
        s.telefono,
        `Hola ${s.nombre}, le escribimos de Cordillera M&P por su solicitud de cotización N° ${s.numero_solicitud}.`,
      )
    : null;
  const totales = s.valor_neto ? calcularTotales(s.valor_neto) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/cotizaciones"
          className={buttonVariants({ variant: "outline" })}
        >
          Volver a cotizaciones
        </Link>
        <h1 className="text-xl font-semibold">
          Solicitud N° {s.numero_solicitud}
        </h1>
        <Badge variant={VARIANTE_ESTADO_COTIZACION[s.estado]}>
          {ETIQUETA_ESTADO_COTIZACION[s.estado]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Recibida el {fmtFechaHora(s.created_at)}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quién solicita</CardTitle>
          <CardDescription>
            {esEmpresa ? "Empresa" : "Particular"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Dato etiqueta="Nombre">
              {nombreCompleto(s.nombre, s.apellido)}
            </Dato>
            <Dato etiqueta="RUT">{formatearRut(s.rut)}</Dato>
            <Dato etiqueta="Correo">
              <a className="underline" href={`mailto:${s.correo}`}>
                {s.correo}
              </a>
            </Dato>
            <Dato etiqueta="Teléfono">
              {tel ? (
                <a className="underline" href={tel}>
                  {formatearTelefonoCl(s.telefono)}
                </a>
              ) : (
                formatearTelefonoCl(s.telefono)
              )}
            </Dato>
            {esEmpresa && (
              <>
                <Dato etiqueta="Razón social">{s.razon_social ?? "—"}</Dato>
                <Dato etiqueta="RUT empresa">
                  {s.rut_empresa ? formatearRut(s.rut_empresa) : "—"}
                </Dato>
                <Dato etiqueta="Giro">{s.giro ?? "—"}</Dato>
                <Dato etiqueta="Dirección comercial">
                  {s.direccion_comercial ?? "—"}
                </Dato>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {tel && (
              <a href={tel} className={buttonVariants({ variant: "outline" })}>
                Llamar
              </a>
            )}
            <a
              href={`mailto:${s.correo}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Escribir correo
            </a>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                WhatsApp
              </a>
            )}
            {s.tiene_whatsapp && !wa && (
              <span className="self-center text-sm text-muted-foreground">
                Marcó que tiene WhatsApp, pero el número no es un móvil chileno
                válido.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué necesita</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Dato etiqueta="Origen">{s.origen}</Dato>
            <Dato etiqueta="Destino">{s.destino}</Dato>
            <Dato etiqueta="Tipo de carga">{s.tipo_carga}</Dato>
            <Dato etiqueta="Peso / tonelaje">{s.peso}</Dato>
            <Dato etiqueta="Fecha estimada">{fmtFecha(s.fecha_estimada)}</Dato>
            <Dato etiqueta="Requiere encarpe">
              {s.requiere_encarpe ? "Sí" : "No"}
            </Dato>
          </div>
          {s.comentarios && (
            <div>
              <div className="text-xs tracking-wide text-muted-foreground uppercase">
                Comentarios
              </div>
              <p className="text-sm whitespace-pre-wrap">{s.comentarios}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {totales && (
        <Card>
          <CardHeader>
            <CardTitle>Cotización enviada</CardTitle>
            <CardDescription>
              {s.cotizacion_enviada_at
                ? `Enviada el ${fmtFechaHora(s.cotizacion_enviada_at)} a ${s.correo}.`
                : "Registrada sin fecha de envío."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dato etiqueta="Neto">{formatearCLP(totales.neto)}</Dato>
              <Dato etiqueta="IVA">{formatearCLP(totales.iva)}</Dato>
              <Dato etiqueta="Total">{formatearCLP(totales.total)}</Dato>
              <Dato etiqueta="Validez">
                {s.validez_dias ? `${s.validez_dias} días` : "—"}
              </Dato>
            </div>
            {s.observaciones_cotizacion && (
              <p className="mt-4 text-sm whitespace-pre-wrap">
                {s.observaciones_cotizacion}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <EmitirCotizacion
        id={s.id}
        estado={s.estado}
        valorNetoActual={s.valor_neto}
        validezDiasActual={s.validez_dias}
        observacionesActuales={s.observaciones_cotizacion}
        correoDestino={s.correo}
        emitidaPor={nombreCompleto(perfil.nombre, perfil.apellido)}
      />
    </div>
  );
}
