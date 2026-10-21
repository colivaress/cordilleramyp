import Link from "next/link";
import { getSesion, inicioDeRol } from "@/lib/auth";
import { ETIQUETA_ROL } from "@/lib/tipos";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { puedeEntrarModuloRrhh } from "@/lib/rrhh/acceso";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await getSesion();
  // "Mis datos" (RRHH §16.7) solo para quien tiene ficha. Lectura por clave
  // primaria de la propia fila (la RLS lo permite al dueño).
  const supabase = await createClient();
  const { data: miFicha } = await supabase
    .from("rrhh_fichas")
    .select("personal_id")
    .eq("personal_id", perfil.id)
    .maybeSingle();
  const esAdmin = perfil.rol === "administrador";
  const esAdminContrato = perfil.rol === "administrador_contrato";
  // El trabajador tiene "Mis datos" aunque RRHH no le haya cargado la ficha
  // todavía: es su única pantalla (spec RRHH §16.7).
  const esTrabajador = perfil.rol === "trabajador";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        id="app-header"
        className="no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          {/* §8: el logo (sin texto al lado) lleva al inicio del rol (admin y
              supervisor: /dashboard, que se renderiza distinto según el rol;
              trabajador: /mis-datos). */}
          <Link
            href={inicioDeRol(perfil.rol)}
            aria-label="Ir al inicio"
            className="inline-flex cursor-pointer items-center"
          >
            <Logo />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {/* §2.11: "Dashboard" = analítica, exclusivo administrador —
                administrador_contrato NO entra ahí (explícito en su
                alcance), aunque sí ve "Inspecciones" (la tabla completa,
                de solo lectura) y administra Configuración igual que
                un administrador. El supervisor no ve
                ninguno de los cuatro. "Usuarios" ya no existe: la cuenta
                de cada persona se administra desde su ficha en RRHH. */}
            {esAdmin && (
              <Link
                href="/dashboard/analitica"
                className={buttonVariants({ variant: "ghost" })}
              >
                Dashboard
              </Link>
            )}
            {(esAdmin || esAdminContrato) && (
              <>
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Inspecciones
                </Link>
                {/* Solicitudes que llegan por el formulario público de la
                    portada (§ "Cotización de fletes"). Mismo alcance que
                    Configuración y RRHH: administrador y administrador
                    de contrato; el supervisor no las ve, ni acá ni por RLS. */}
                <Link
                  href="/cotizaciones"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Cotizaciones
                </Link>
                <Link
                  href="/configuracion"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Configuración
                </Link>
              </>
            )}
            {/* Módulo RRHH: mismo alcance que su ruta (requireModuloRrhh) y
                que la RLS de las tablas rrhh_*. Ocultar el link no es la
                protección; es solo para no mostrar una puerta cerrada. */}
            {puedeEntrarModuloRrhh(perfil.rol) && (
              <Link
                href="/rrhh"
                className={buttonVariants({ variant: "ghost" })}
              >
                RRHH
              </Link>
            )}
            {(miFicha || esTrabajador) && (
              <Link
                href="/mis-datos"
                className={buttonVariants({ variant: "ghost" })}
              >
                Mis datos
              </Link>
            )}
            {/* §2.6 pedía este link "Nueva inspección" en la barra, solo para
                supervisor. Se saca por pedido del cliente (2026-10-02): el
                único acceso a crear una inspección pasa a ser el botón azul
                del listado (/dashboard), para no tener dos puertas al mismo
                formulario. El supervisor llega al listado por el logo, que
                apunta a /dashboard — ese es ahora su único elemento de
                navegación, porque el link "Inspecciones" de más arriba sigue
                restringido a admin y admin de contrato. */}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-sm sm:gap-3">
            {/* §2.6: el nombre debe verse en todos los tamaños (antes tenía
                `hidden sm:inline` y desaparecía en celular). */}
            <span className="max-w-[8rem] truncate text-muted-foreground sm:max-w-[14rem]">
              {perfil.nombre}
            </span>
            <Badge variant={esAdmin || esAdminContrato ? "default" : "secondary"}>
              {ETIQUETA_ROL[perfil.rol]}
            </Badge>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
