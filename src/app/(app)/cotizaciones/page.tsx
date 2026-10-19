import Link from "next/link";
import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatearCLP, calcularTotales } from "@/lib/dinero";
import { nombreCompleto } from "@/lib/mensajes";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ETIQUETA_ESTADO_COTIZACION, VARIANTE_ESTADO_COTIZACION } from "./estados";

export const dynamic = "force-dynamic";

const fmt = (v: string) =>
  new Date(v).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default async function CotizacionesPage() {
  // Misma puerta que Usuarios y Configuración: ruta + RLS. La política de
  // `select` de cotizaciones_fletes ya restringe a estos dos roles, así que
  // un supervisor que escriba la URL no solo rebota acá — tampoco vería
  // filas si llegara a pasar.
  await requireRol("administrador", "administrador_contrato");
  const supabase = await createClient();

  const { data: solicitudes } = await supabase
    .from("cotizaciones_fletes")
    .select("*")
    .order("created_at", { ascending: false });

  const filas = solicitudes ?? [];
  const nuevas = filas.filter((f) => f.estado === "nueva").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cotizaciones</CardTitle>
          <CardDescription>
            Solicitudes que llegaron por el formulario de la portada.
            {nuevas > 0
              ? ` ${nuevas} sin responder.`
              : " Todas tienen respuesta."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no llega ninguna solicitud. Cuando alguien complete el
              formulario de la portada, aparecerá acá.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sr-only">Ver</TableHead>
                    <TableHead>Nro</TableHead>
                    <TableHead>Recibida</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Link
                          href={`/cotizaciones/${f.id}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Ver
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {f.numero_solicitud}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmt(f.created_at)}
                      </TableCell>
                      <TableCell>
                        <div>{nombreCompleto(f.nombre, f.apellido)}</div>
                        {f.razon_social && (
                          <div className="text-xs text-muted-foreground">
                            {f.razon_social}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[18rem]">
                        <div className="truncate" title={f.origen}>
                          {f.origen}
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={f.destino}
                        >
                          → {f.destino}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[12rem]">
                        <div className="truncate" title={f.tipo_carga}>
                          {f.tipo_carga}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {f.peso}
                          {f.requiere_encarpe ? " · con encarpe" : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_ESTADO_COTIZACION[f.estado]}>
                          {ETIQUETA_ESTADO_COTIZACION[f.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {f.valor_neto
                          ? formatearCLP(calcularTotales(f.valor_neto).total)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
