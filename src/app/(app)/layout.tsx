import Link from "next/link";
import { getSesion } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await getSesion();
  const esAdmin = perfil.rol === "administrador";
  const esSupervisor = perfil.rol === "supervisor";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* §8: el logo lleva al inicio del rol (admin y supervisor: /dashboard,
              que se renderiza distinto según el rol). */}
          <Link
            href="/dashboard"
            aria-label="Ir al inicio"
            className="inline-flex cursor-pointer items-center"
          >
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {/* §2.11: "Dashboard" = analítica; "Inspecciones" = el listado.
                §2.6: el supervisor no ve ninguno de los dos. */}
            {esAdmin && (
              <>
                <Link
                  href="/dashboard/analitica"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Inspecciones
                </Link>
                <Link
                  href="/usuarios"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Usuarios
                </Link>
              </>
            )}
            {/* §2.6: solo el supervisor crea inspecciones; el admin no ve el link. */}
            {esSupervisor && (
              <Link
                href="/tickets/new"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Nueva inspección
              </Link>
            )}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-sm sm:gap-3">
            {/* §2.6: el nombre debe verse en todos los tamaños (antes tenía
                `hidden sm:inline` y desaparecía en celular). */}
            <span className="max-w-[8rem] truncate text-muted-foreground sm:max-w-[14rem]">
              {perfil.nombre}
            </span>
            <Badge variant={esAdmin ? "default" : "secondary"}>
              {esAdmin ? "Administrador" : "Supervisor"}
            </Badge>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
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
