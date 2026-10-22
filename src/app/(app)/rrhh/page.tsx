import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { formatearCLP } from "@/lib/dinero";
import { nombreCompleto } from "@/lib/mensajes";
import { formatearRut, normalizarRut } from "@/lib/rut";
import { puedeEditarMontos } from "@/lib/rrhh/acceso";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import {
  ETIQUETA_TIPO_CONTRATO,
  TIPOS_CONTRATO,
  fechaCorta,
  hoyChile,
  iniciales,
  vigenteEn,
} from "@/lib/rrhh/ficha";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { ETIQUETA_ROL } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// Listado de colaboradores (spec RRHH §16.8). Pestañas Activos /
// Desvinculados en vez de un filtro escondido: la desvinculación es baja
// lógica y el histórico de un desvinculado no se borra nunca. Es la ÚNICA
// lista de personas (antes había otra en /usuarios): todas aparecen, con o
// sin contrato, y su cuenta se administra desde la ficha.
export default async function RrhhPage({
  searchParams,
}: {
  searchParams: Promise<{ pestana?: string; q?: string; faena?: string; contrato?: string }>;
}) {
  // Guarda en la página, no en un layout (ver guardas.ts). La RLS dice lo
  // mismo: un supervisor que llegara acá igual no vería montos ajenos.
  const { perfil } = await requireModuloRrhh();
  const { pestana, q = "", faena = "", contrato = "" } = await searchParams;
  const desvinculados = pestana === "desvinculados";
  const hoy = hoyChile();
  const supabase = await createClient();

  const [{ data: personal }, { data: fichas }, { data: remuneraciones }, { data: ruts }, { data: faenasCatalogo }] =
    await Promise.all([
      supabase.from("personal").select("id, nombre, apellido, email, rol, activo").order("nombre"),
      supabase
        .from("rrhh_fichas")
        .select("personal_id, faena_id, fecha_ingreso, tipo_contrato, fecha_desvinculacion, cargo:rrhh_cargos(nombre), faena:rrhh_faenas(nombre)"),
      supabase
        .from("rrhh_remuneracion_base")
        .select("personal_id, liquido_pactado, vigente_desde, created_at")
        .lte("vigente_desde", hoy),
      // El RUT no se lee de personal con un select (grants por columna).
      supabase.rpc("rrhh_ruts"),
      supabase.from("rrhh_faenas").select("id, nombre").order("nombre"),
    ]);

  const fichaDe = new Map((fichas ?? []).map((f) => [f.personal_id, f]));
  const rutDe = new Map((ruts ?? []).map((r) => [r.personal_id, r.rut]));
  const remDe = new Map<string, NonNullable<typeof remuneraciones>>();
  for (const r of remuneraciones ?? []) remDe.set(r.personal_id, [...(remDe.get(r.personal_id) ?? []), r]);

  const buscado = q.trim().toLowerCase();
  const rutBuscado = normalizarRut(q);
  const todos = personal ?? [];
  const filas = todos.filter((p) => {
    const f = fichaDe.get(p.id);
    if (!!f?.fecha_desvinculacion !== desvinculados) return false;
    if (faena && f?.faena_id !== faena) return false;
    if (contrato && f?.tipo_contrato !== contrato) return false;
    if (!buscado) return true;
    return (
      nombreCompleto(p.nombre, p.apellido).toLowerCase().includes(buscado) ||
      (p.email ?? "").toLowerCase().includes(buscado) ||
      (rutBuscado.length >= 3 && (rutDe.get(p.id) ?? "").includes(rutBuscado))
    );
  });
  const cuantosDesvinculados = todos.filter((p) => fichaDe.get(p.id)?.fecha_desvinculacion).length;
  const pestanaUrl = (d: boolean) => (d ? "/rrhh?pestana=desvinculados" : "/rrhh");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/rrhh/nuevo" className={buttonVariants()}>
          Agregar persona
        </Link>
        <Link href="/rrhh/turnos" className={buttonVariants({ variant: "outline" })}>
          Turnos
        </Link>
        <Link href="/rrhh/jornadas" className={buttonVariants({ variant: "outline" })}>
          Jornadas
        </Link>
        <Link href="/rrhh/cargos" className={buttonVariants({ variant: "outline" })}>
          Cargos
        </Link>
        <Link href="/rrhh/faenas" className={buttonVariants({ variant: "outline" })}>
          Faenas
        </Link>
        <Link href="/rrhh/tipos-documento" className={buttonVariants({ variant: "outline" })}>
          Tipos de documento
        </Link>
        {/* Parámetros previsionales: solo administrador (spec RRHH §3). La
            página tiene su propia guarda; esto solo evita mostrar una puerta
            cerrada al administrador de contrato. */}
        {puedeEditarMontos(perfil.rol) && (
          <Link href="/rrhh/parametros" className={buttonVariants({ variant: "outline" })}>
            Parámetros previsionales
          </Link>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>RRHH</CardTitle>
          <CardDescription>
            Todas las personas de Cordillera M&amp;P: su cuenta en la app, su
            contrato y su sueldo líquido pactado vigente.
            {!puedeEditarMontos(perfil.rol) &&
              " Puedes ver los montos, pero solo un administrador puede modificarlos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav className="flex gap-1 border-b" aria-label="Estado del trabajador">
            {[false, true].map((d) => (
              <Link
                key={String(d)}
                href={pestanaUrl(d)}
                aria-current={d === desvinculados ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium",
                  d === desvinculados
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {d ? `Desvinculados (${cuantosDesvinculados})` : `Activos (${todos.length - cuantosDesvinculados})`}
              </Link>
            ))}
          </nav>

          <form className="flex flex-wrap items-end gap-2" action="/rrhh">
            {desvinculados && <input type="hidden" name="pestana" value="desvinculados" />}
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre, RUT o correo" className="w-full sm:w-72" />
            <select name="faena" defaultValue={faena} className={nativeSelectClassName} aria-label="Faena">
              <option value="">Todas las faenas</option>
              {(faenasCatalogo ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <select name="contrato" defaultValue={contrato} className={nativeSelectClassName} aria-label="Tipo de contrato">
              <option value="">Todos los contratos</option>
              {TIPOS_CONTRATO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_CONTRATO[t]}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Filtrar
            </button>
          </form>

          {filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {desvinculados ? "No hay trabajadores desvinculados." : "No hay trabajadores que coincidan."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>RUT</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Faena</TableHead>
                    <TableHead>Ingreso</TableHead>
                    <TableHead className="text-right">Líquido pactado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((t) => {
                    const f = fichaDe.get(t.id);
                    const rem = vigenteEn(remDe.get(t.id) ?? [], hoy);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Link href={`/rrhh/${t.id}`} className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
                            >
                              {iniciales(t.nombre, t.apellido)}
                            </span>
                            <span>
                              <span className="block font-medium text-brand-700 underline-offset-4 hover:underline">
                                {nombreCompleto(t.nombre, t.apellido)}
                              </span>
                              {t.email && <span className="block text-xs text-muted-foreground">{t.email}</span>}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {rutDe.has(t.id) ? formatearRut(rutDe.get(t.id)!) : "—"}
                          {!f && (
                            <Badge className="mt-1 block w-fit bg-warning-100 text-warning-700">Sin contrato</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {ETIQUETA_ROL[t.rol]}
                          {!t.activo && !f?.fecha_desvinculacion && (
                            <Badge className="mt-1 block w-fit bg-danger-100 text-danger-700">Acceso suspendido</Badge>
                          )}
                        </TableCell>
                        <TableCell>{f?.cargo?.nombre ?? "—"}</TableCell>
                        <TableCell>{f?.faena?.nombre ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {f ? fechaCorta(f.fecha_ingreso) : "—"}
                          {f?.fecha_desvinculacion && (
                            <span className="block text-xs text-muted-foreground">
                              hasta {fechaCorta(f.fecha_desvinculacion)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {rem ? formatearCLP(rem.liquido_pactado) : <span className="text-muted-foreground">Sin cargar</span>}
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
