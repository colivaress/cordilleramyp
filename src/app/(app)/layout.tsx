import Link from "next/link";
import { getSesion } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await getSesion();
  const esAdmin = perfil.rol === "administrador";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Cordillera <span className="text-primary">M&amp;P</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {/* §2.6: el supervisor no ve el link "Dashboard" en el nav. */}
            {esAdmin && (
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/tickets/new"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Nueva inspección
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
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
