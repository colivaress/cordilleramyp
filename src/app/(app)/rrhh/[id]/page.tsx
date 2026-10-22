import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModuloRrhh } from "@/lib/rrhh/guardas";
import { puedeEditarMontos } from "@/lib/rrhh/acceso";
import { cargarFichaCompleta } from "@/lib/rrhh/ficha-servidor";
import {
  escribirDecimal,
} from "@/lib/rrhh/parametros";
import { cargoSugerido, fechaCorta, hoyChile, textoAntiguedad, type FormularioFicha } from "@/lib/rrhh/ficha";
import { nombreCompleto } from "@/lib/mensajes";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { FichaForm } from "@/components/rrhh/FichaForm";
import { CuentaForm } from "@/components/rrhh/CuentaForm";
import { AccesoCuenta } from "@/components/rrhh/AccesoCuenta";
import { antiguedadDesde, puedeEditarCuentaDe } from "@/lib/rrhh/cuenta";
import { formatearRut } from "@/lib/rut";
import { formatearTelefonoCl } from "@/lib/telefono";
import { RemuneracionForm } from "@/components/rrhh/RemuneracionForm";
import { CargarDocumentos } from "@/components/rrhh/CargarDocumentos";
import { Desvinculacion } from "@/components/rrhh/Desvinculacion";
import {
  DocumentosLista,
  HistorialJornadas,
  HistorialSueldo,
  RemuneracionVigente,
} from "@/components/rrhh/BloquesFicha";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ficha del trabajador (fase 3). Guarda en la página (ver guardas.ts): entra
// el módulo RRHH (administrador y adm. de contrato); los montos solo los
// registra el administrador — la sección ni se muestra al otro rol, y la
// acción y la RLS lo rechazan igual.
export default async function FichaTrabajadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { perfil } = await requireModuloRrhh();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const hoy = hoyChile();
  const [datos, { data: tipos }, { data: cargos }, { data: faenas }, { data: tiposInspeccion }, { data: acceso }] =
    await Promise.all([
      cargarFichaCompleta(supabase, id, hoy),
      supabase.from("rrhh_tipos_documento").select("id, nombre").eq("activo", true).order("orden"),
      supabase.from("rrhh_cargos").select("id, nombre, activo").order("nombre"),
      supabase.from("rrhh_faenas").select("id, nombre, activo").order("nombre"),
      supabase.from("personal_tipos_inspeccion").select("tipo_inspeccion").eq("personal_id", id),
      supabase.rpc("estado_acceso_personal"),
    ]);
  const { persona, ficha } = datos;
  if (!persona) notFound();
  const editaMontos = puedeEditarMontos(perfil.rol);
  const editaCuenta = puedeEditarCuentaDe(perfil.rol, persona.rol);
  const desvinculado = !!ficha?.fecha_desvinculacion;
  // "Invitación pendiente" = nunca inició sesión (auth.users), no
  // user_id nulo: user_id se puebla desde el instante en que se invita.
  const algunaVezInicioSesion = acceso?.find((a) => a.personal_id === persona.id)?.alguna_vez_inicio_sesion ?? false;
  const invitacionPendiente = persona.activo && !algunaVezInicioSesion;

  const inicialCuenta = {
    nombre: persona.nombre,
    apellido: persona.apellido ?? "",
    rut: datos.rut ? formatearRut(datos.rut) : "",
    email: persona.email ?? "",
    telefono: persona.telefono ?? "",
    fechaNacimiento: persona.fecha_nacimiento ?? "",
    rol: persona.rol,
    tiposInspeccion: (tiposInspeccion ?? []).map((t) => t.tipo_inspeccion),
    contactoNombre: datos.contactoEmergencia?.nombre ?? "",
    contactoTelefono: datos.contactoEmergencia?.telefono ? formatearTelefonoCl(datos.contactoEmergencia.telefono) : "",
    contactoRelacion: datos.contactoEmergencia?.relacion ?? "",
  };

  const inicialFicha: FormularioFicha = ficha
    ? {
        cargo_id: ficha.cargo_id,
        faena_id: ficha.faena_id ?? "",
        fecha_ingreso: ficha.fecha_ingreso,
        tipo_contrato: ficha.tipo_contrato,
        fecha_termino_contrato: ficha.fecha_termino_contrato ?? "",
        afp: ficha.afp,
        sistema_salud: ficha.sistema_salud,
        isapre: ficha.isapre ?? "",
        plan_isapre_uf: ficha.plan_isapre_uf === null ? "" : escribirDecimal(ficha.plan_isapre_uf),
        afecto_afc: ficha.afecto_afc,
        cargas_familiares: String(ficha.cargas_familiares),
      }
    : {
        // Solo un valor inicial: el cargo es contractual y no sigue al rol
        // (ver cargoSugerido). Al editar una ficha existente no se toca.
        cargo_id: cargoSugerido(persona.rol, cargos ?? []),
        faena_id: "",
        fecha_ingreso: "",
        tipo_contrato: "",
        fecha_termino_contrato: "",
        afp: "",
        sistema_salud: "",
        isapre: "",
        plan_isapre_uf: "",
        afecto_afc: true,
        cargas_familiares: "0",
      };

  const r = datos.remuneracionVigente;
  const inicialRemuneracion = {
    vigente_desde: hoy.slice(0, 7),
    liquido_pactado: r ? String(r.liquido_pactado) : "",
    colacion: r ? String(r.colacion) : "",
    movilizacion: r ? String(r.movilizacion) : "",
    comentario: "",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{nombreCompleto(persona.nombre, persona.apellido)}</h1>
          <p className="text-sm text-muted-foreground">
            {ETIQUETA_ROL[persona.rol]}
            {persona.email && ` · ${persona.email}`}
          </p>
          {ficha && (
            <p className="mt-1 text-sm">
              Ingreso {fechaCorta(ficha.fecha_ingreso)} ·{" "}
              <span className="font-medium">
                {textoAntiguedad(ficha.fecha_ingreso, ficha.fecha_desvinculacion ?? hoy)}
              </span>
            </p>
          )}
          {ficha?.fecha_desvinculacion && (
            <Badge className="mt-2 bg-danger-100 text-danger-700">
              Desvinculado el {fechaCorta(ficha.fecha_desvinculacion)}: {ficha.motivo_desvinculacion}
            </Badge>
          )}
        </div>
        <Link href="/rrhh" className={buttonVariants({ variant: "outline" })}>
          Volver a RRHH
        </Link>
      </div>

      {/* Dos secciones independientes, cada una con su estado y su guarda:
          la cuenta no depende del contrato (dar de alta a un supervisor no
          puede esperar a que RRHH tenga su AFP). */}
      <Card>
        <CardHeader>
          <CardTitle>Cuenta y acceso</CardTitle>
          <CardDescription>
            Datos personales y lo que la persona puede hacer en la app. El cargo es el puesto y no da
            permisos; el rol sí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {editaCuenta ? (
            <>
              <CuentaForm personalId={persona.id} inicial={inicialCuenta} actor={perfil.rol} />
              <AccesoCuenta
                personalId={persona.id}
                esYo={persona.id === perfil.id}
                activo={persona.activo}
                desvinculado={desvinculado}
                invitacionPendiente={invitacionPendiente}
                antiguedadInvitacion={invitacionPendiente ? antiguedadDesde(persona.created_at) : null}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              La cuenta de un administrador solo la modifica otro administrador.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contrato y previsión</CardTitle>
          <CardDescription>
            {ficha
              ? "Datos contractuales y previsionales."
              : "Este trabajador todavía no tiene ficha: complétala para poder liquidarle sueldo."}
            {!datos.rut && " Antes hay que registrar su RUT en \"Cuenta y acceso\"."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FichaForm
            personalId={persona.id}
            inicial={inicialFicha}
            existe={!!ficha}
            cargos={cargos ?? []}
            faenas={faenas ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remuneración</CardTitle>
          <CardDescription>
            El sueldo se pacta en líquido.
            {!editaMontos && " Puedes ver los montos, pero solo un administrador puede modificarlos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RemuneracionVigente r={r} />
          {editaMontos && <RemuneracionForm personalId={persona.id} inicial={inicialRemuneracion} />}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Historial de sueldo</h3>
            <p className="text-xs text-muted-foreground">
              Cada cambio queda registrado con el mes en que rige: así se sabe
              qué sueldo correspondía a cada liquidación.
            </p>
            <HistorialSueldo filas={datos.remuneraciones} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jornada</CardTitle>
          <CardDescription>
            Las horas se miden contra la jornada asignada a cada día. Aquí se ve el historial; los turnos
            se asignan y corrigen en{" "}
            <Link href="/rrhh/turnos" className="text-brand-700 underline underline-offset-4">
              Turnos
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <HistorialJornadas filas={datos.jornadas} vigenteId={datos.jornadaVigente?.id ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentosLista documentos={datos.documentos} />
          <CargarDocumentos personalId={persona.id} tipos={tipos ?? []} />
        </CardContent>
      </Card>

      {ficha && (
        <Card>
          <CardHeader>
            <CardTitle>{ficha.fecha_desvinculacion ? "Reincorporar" : "Desvinculación"}</CardTitle>
            <CardDescription>
              {ficha.fecha_desvinculacion
                ? "Reincorporar deshace la desvinculación y le devuelve el acceso a la app."
                : "Para cuando la persona deja la empresa. Es una baja lógica: la ficha, el historial y los documentos se conservan y pasa a la pestaña Desvinculados. Además le corta el acceso a la app."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Desvinculacion personalId={persona.id} desvinculado={!!ficha.fecha_desvinculacion} hoy={hoy} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
