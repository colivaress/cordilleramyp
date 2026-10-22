import { formatearCLP } from "@/lib/dinero";
import { formatearRut } from "@/lib/rut";
import { formatearTelefonoCl } from "@/lib/telefono";
import type { FichaCompleta } from "@/lib/rrhh/ficha-servidor";
import {
  ETIQUETA_SALUD,
  ETIQUETA_TIPO_CONTRATO,
  fechaCorta,
} from "@/lib/rrhh/ficha";
import { describirDias } from "@/lib/rrhh/jornadas";
import { formatearTamano } from "@/lib/rrhh/documentos";
import { NOMBRE_AFP, escribirDecimal } from "@/lib/rrhh/parametros";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Bloques de solo lectura de la ficha; los comparten /rrhh/[id] y /mis-datos. */

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });

export function DatosFicha({ ficha, rut }: { ficha: NonNullable<FichaCompleta["ficha"]>; rut: string | null }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Dato etiqueta="RUT">{rut ? formatearRut(rut) : "—"}</Dato>
      <Dato etiqueta="Cargo">{ficha.cargo?.nombre ?? "—"}</Dato>
      <Dato etiqueta="Faena">{ficha.faena?.nombre ?? "—"}</Dato>
      <Dato etiqueta="Ingreso">{fechaCorta(ficha.fecha_ingreso)}</Dato>
      <Dato etiqueta="Contrato">
        {ETIQUETA_TIPO_CONTRATO[ficha.tipo_contrato]}
        {ficha.fecha_termino_contrato && ` hasta ${fechaCorta(ficha.fecha_termino_contrato)}`}
      </Dato>
      <Dato etiqueta="AFP">{NOMBRE_AFP[ficha.afp]}</Dato>
      <Dato etiqueta="Salud">
        {ETIQUETA_SALUD[ficha.sistema_salud]}
        {ficha.isapre && ` (${ficha.isapre}, ${escribirDecimal(ficha.plan_isapre_uf ?? 0)} UF)`}
      </Dato>
      <Dato etiqueta="Seguro de cesantía">{ficha.afecto_afc ? "Afecto" : "No afecto"}</Dato>
      <Dato etiqueta="Cargas familiares">{ficha.cargas_familiares}</Dato>
    </dl>
  );
}

export function RemuneracionVigente({ r }: { r: FichaCompleta["remuneracionVigente"] }) {
  if (!r) return <p className="text-sm text-muted-foreground">Sin sueldo cargado.</p>;
  return (
    <dl className="grid gap-4 sm:grid-cols-4">
      <Dato etiqueta="Líquido pactado">{formatearCLP(r.liquido_pactado)}</Dato>
      <Dato etiqueta="Colación">{formatearCLP(r.colacion)}</Dato>
      <Dato etiqueta="Movilización">{formatearCLP(r.movilizacion)}</Dato>
      <Dato etiqueta="Rige desde">{fechaCorta(r.vigente_desde).slice(3)}</Dato>
    </dl>
  );
}

/** §16.3: cada cambio con el mes en que rige, quién lo registró y por qué. */
export function HistorialSueldo({ filas }: { filas: FichaCompleta["remuneraciones"] }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay cambios de sueldo registrados.</p>;
  const cambio = (actual: number, anterior: number | null) =>
    anterior === null || anterior === actual ? formatearCLP(actual) : `${formatearCLP(anterior)} → ${formatearCLP(actual)}`;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rige desde</TableHead>
            <TableHead>Líquido pactado</TableHead>
            <TableHead>Colación</TableHead>
            <TableHead>Movilización</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Registrado por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((h) => (
            <TableRow key={h.id}>
              <TableCell className="whitespace-nowrap">{fechaCorta(h.vigente_desde).slice(3)}</TableCell>
              <TableCell className="tabular-nums">{cambio(h.liquido_pactado, h.liquido_pactado_anterior)}</TableCell>
              <TableCell className="tabular-nums">{cambio(h.colacion, h.colacion_anterior)}</TableCell>
              <TableCell className="tabular-nums">{cambio(h.movilizacion, h.movilizacion_anterior)}</TableCell>
              <TableCell>{h.comentario ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {h.autor ?? "—"}
                <span className="block text-xs">{fechaHora(h.created_at)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function textoRango(desde: string, hasta: string | null): string {
  return hasta ? `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : `desde el ${fechaCorta(desde)}, hasta nuevo aviso`;
}

const ACCION_CAMBIO: Record<string, string> = {
  asignada: "Asignada",
  corregida: "Corregida",
  anulada: "Anulada",
};

/** Historial de asignaciones de jornada, solo lectura. Las anuladas se
 *  muestran tachadas (no se borran) y cada cambio dice quién y cuándo:
 *  es lo que hace falta para revisar un cálculo de horas después. */
export function HistorialJornadas({ filas, vigenteId }: { filas: FichaCompleta["jornadas"]; vigenteId: string | null }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Sin jornada asignada.</p>;
  return (
    <ul className="grid gap-2">
      {filas.map((j) => (
        <li key={j.id} className="rounded-md border px-3 py-2 text-sm">
          <span className={j.anulada_en ? "text-muted-foreground line-through" : undefined}>
            <span className="font-medium">{j.nombre}</span> · {String(j.horas).replace(".", ",")} h semanales ·{" "}
            {textoRango(j.vigente_desde, j.vigente_hasta)}
          </span>
          {j.id === vigenteId && <span className="ml-2 text-xs font-medium text-success-700">vigente</span>}
          {j.anulada_en && <span className="ml-2 text-xs font-medium text-danger-700">anulada</span>}
          <span className="block text-xs text-muted-foreground">{describirDias(j.dias)}</span>
          {j.cambios.length > 0 && (
            <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
              {j.cambios.map((c) => (
                <li key={c.id}>
                  {ACCION_CAMBIO[c.accion] ?? c.accion} el {fechaHora(c.hecho_en)}
                  {c.autor && ` por ${c.autor}`}
                  {c.accion === "corregida" && ` (${textoRango(c.vigente_desde, c.vigente_hasta)})`}
                  {c.motivo && `: ${c.motivo}`}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ContactoEmergencia({ contacto }: { contacto: FichaCompleta["contactoEmergencia"] }) {
  if (!contacto?.telefono) return <p className="text-sm text-muted-foreground">Sin contacto de emergencia registrado.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <Dato etiqueta="Nombre">{contacto.nombre}</Dato>
      <Dato etiqueta="Teléfono">{formatearTelefonoCl(contacto.telefono)}</Dato>
      <Dato etiqueta="Relación">{contacto.relacion ?? "—"}</Dato>
    </dl>
  );
}

export function DocumentosLista({ documentos }: { documentos: FichaCompleta["documentos"] }) {
  if (documentos.length === 0)
    return <p className="text-sm text-muted-foreground">Este colaborador aún no tiene documentos cargados.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Tamaño</TableHead>
            <TableHead>Cargado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentos.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline underline-offset-4">
                    {d.nombre}
                  </a>
                ) : (
                  d.nombre
                )}
              </TableCell>
              <TableCell>{d.tipo}</TableCell>
              <TableCell className="whitespace-nowrap">{formatearTamano(d.tamano)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fechaHora(d.fecha)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
