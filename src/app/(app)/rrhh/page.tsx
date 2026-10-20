import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { formatearCLP } from "@/lib/dinero";
import { nombreCompleto } from "@/lib/mensajes";
import { puedeEditarMontos } from "@/lib/rrhh/acceso";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { ETIQUETA_ROL } from "@/lib/tipos";
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

export const dynamic = "force-dynamic";

export default async function RrhhPage() {
  // Guarda en la página, no en un layout (ver guardas.ts). La RLS de
  // rrhh_remuneracion_base dice lo mismo: un supervisor que llegara acá
  // igual no vería montos ajenos.
  const { perfil } = await requireModuloRrhh();
  const supabase = await createClient();

  const [{ data: personal }, { data: remuneraciones }] = await Promise.all([
    supabase
      .from("personal")
      .select("id, nombre, apellido, email, rol")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("rrhh_remuneracion_base")
      .select("personal_id, liquido_pactado, vigente_desde")
      .lte("vigente_desde", new Date().toISOString().slice(0, 10))
      .order("vigente_desde", { ascending: false }),
  ]);

  // Vienen de la más nueva a la más vieja: la primera de cada trabajador es
  // la vigente hoy.
  const vigente = new Map<string, number>();
  for (const r of remuneraciones ?? []) {
    if (!vigente.has(r.personal_id)) vigente.set(r.personal_id, r.liquido_pactado);
  }
  const trabajadores = personal ?? [];

  return (
    <div className="space-y-6">
      {/* Parámetros previsionales: solo administrador (spec RRHH §3). La
          página tiene su propia guarda; esto solo evita mostrar una puerta
          cerrada al administrador de contrato. */}
      {puedeEditarMontos(perfil.rol) && (
        <div className="flex justify-end">
          <Link
            href="/rrhh/parametros"
            className={buttonVariants({ variant: "outline" })}
          >
            Parámetros previsionales
          </Link>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>RRHH</CardTitle>
          <CardDescription>
            Trabajadores activos de Cordillera M&amp;P y su sueldo líquido
            pactado vigente.
            {!puedeEditarMontos(perfil.rol) &&
              " Puedes ver los montos, pero solo un administrador puede modificarlos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trabajadores.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay trabajadores activos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajador</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="text-right">Líquido pactado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trabajadores.map((t) => {
                    const liquido = vigente.get(t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div>{nombreCompleto(t.nombre, t.apellido)}</div>
                          {t.email && (
                            <div className="text-xs text-muted-foreground">
                              {t.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{ETIQUETA_ROL[t.rol]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {liquido === undefined ? (
                            <span className="text-muted-foreground">
                              Sin cargar
                            </span>
                          ) : (
                            formatearCLP(liquido)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
