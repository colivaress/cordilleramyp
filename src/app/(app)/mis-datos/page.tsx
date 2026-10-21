import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarFichaCompleta } from "@/lib/rrhh/ficha-servidor";
import { fechaCorta, hoyChile, textoAntiguedad } from "@/lib/rrhh/ficha";
import { nombreCompleto } from "@/lib/mensajes";
import {
  DatosFicha,
  DocumentosLista,
  HistorialJornadas,
  RemuneracionVigente,
} from "@/components/rrhh/BloquesFicha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// "Mis datos" (spec RRHH §16.7): cada persona ve SU ficha, solo lectura.
// Siempre se pide con el id de la sesión, nunca con uno de la URL; y la RLS
// (puede_ver_rrhh) igual le negaría la ficha de otro.
export default async function MisDatosPage() {
  const { perfil } = await getSesion();
  const supabase = await createClient();
  const hoy = hoyChile();
  const datos = await cargarFichaCompleta(supabase, perfil.id, hoy);
  const { ficha } = datos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis datos</h1>
        <p className="text-sm text-muted-foreground">
          {nombreCompleto(perfil.nombre, perfil.apellido)}
          {ficha && ` · ingreso ${fechaCorta(ficha.fecha_ingreso)} · ${textoAntiguedad(ficha.fecha_ingreso, hoy)}`}
        </p>
      </div>

      {!ficha ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Todavía no tienes una ficha de RRHH. Si crees que es un error,
            consulta con administración.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Contrato y previsión</CardTitle>
            </CardHeader>
            <CardContent>
              <DatosFicha ficha={ficha} rut={datos.rut} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Remuneración</CardTitle>
              <CardDescription>
                Sueldo líquido pactado vigente: corresponde a un mes completo,
                sin horas extra ni bonos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RemuneracionVigente r={datos.remuneracionVigente} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Jornada</CardTitle>
            </CardHeader>
            <CardContent>
              <HistorialJornadas filas={datos.jornadas} vigenteId={datos.jornadaVigente?.id ?? null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mis documentos</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentosLista documentos={datos.documentos} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
