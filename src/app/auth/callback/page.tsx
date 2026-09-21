"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Canjea la sesión que llega desde un enlace de correo (invitación,
// recuperación de clave, confirmación) o desde OAuth (Google).
//
// GoTrue entrega la sesión de dos formas distintas según el flujo, y las
// dos pueden llegar acá:
//   - Flujo implícito (el que usa hoy la invitación y la recuperación de
//     clave en este proyecto): la sesión viaja en el FRAGMENTO de la URL
//     (`#access_token=...&refresh_token=...&type=...`). El fragmento nunca
//     se envía al servidor — ningún Route Handler puede leerlo, por eso
//     esta pantalla tiene que ser un Client Component. Se confirmó
//     empíricamente contra Supabase local que ambos enlaces (invite y
//     recovery) llegan así, no con `?code=`.
//   - Flujo PKCE (OAuth, ej. "Iniciar sesión con Google" cuando se agregue,
//     §8 del blueprint): la sesión se canjea con `?code=`.
function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function procesar() {
      const supabase = createClient();
      const next = searchParams.get("next") ?? "/dashboard";

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tipo = hash.get("type");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelado) return;
        if (error) {
          console.error("setSession falló:", error);
          setError(true);
          return;
        }
        // Invitación o recuperación: la persona todavía no tiene contraseña
        // propia (invitación) o quiere cambiarla (recuperación) — en los dos
        // casos el siguiente paso es definir una contraseña nueva.
        const destino =
          tipo === "invite" || tipo === "recovery"
            ? "/auth/actualizar-clave"
            : next;
        router.replace(destino);
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelado) return;
        if (!error) {
          router.replace(next);
          return;
        }
        console.error("exchangeCodeForSession falló:", error);
      }

      setError(true);
    }

    procesar();
    return () => {
      cancelado = true;
    };
  }, [router, searchParams]);

  if (!error) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Verificando el enlace…
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-destructive" role="alert">
        El enlace no es válido o expiró.
      </p>
      <Link
        href="/login"
        className="text-center text-sm text-primary underline"
      >
        Volver a iniciar sesión
      </Link>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Cordillera M&amp;P</CardTitle>
          <CardDescription>Procesando el enlace de acceso.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground" role="status">
                Verificando el enlace…
              </p>
            }
          >
            <CallbackInner />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
