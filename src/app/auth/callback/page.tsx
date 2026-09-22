"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Solo rutas internas relativas — nunca un destino externo ni "//host"
 * (una URL "protocol-relative": el navegador la resuelve como
 * "https://host", no como una ruta). Evita que `?next=` se use como
 * redirección abierta.
 */
function rutaSegura(valor: string | null): string {
  if (valor && valor.startsWith("/") && !valor.startsWith("//")) return valor;
  return "/dashboard";
}

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
//
// `/auth/callback` está en RUTAS_PUBLICAS de proxy.ts (por el prefijo
// "/auth") — el proxy sirve el HTML/JS de esta página sin exigir sesión
// (la petición inicial ni siquiera lleva el fragmento: el navegador nunca
// lo envía al servidor). Recién una vez que el JS de este componente
// corre en el navegador se puede leer `window.location.hash` y llamar a
// setSession() — no hay ninguna carrera con el proxy porque el proxy ya
// terminó de actuar antes de que este código se ejecute.
function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // El history.replaceState() de más abajo modifica la URL por fuera de
  // Next.js, y eso puede hacer que este componente se vuelva a renderizar
  // con una nueva instancia de `router`/`searchParams` (cambian de
  // identidad aunque el contenido sea el mismo). Un useEffect con
  // [router, searchParams] como deps se re-dispara en ese momento, y su
  // cleanup marca `cancelado = true` en el efecto ORIGINAL — así que
  // cuando el `await setSession()` en curso finalmente resuelve, ve
  // `cancelado = true` y aborta sin llamar a `router.replace()`, dejando
  // la página colgada en "Verificando el enlace…" para siempre (la
  // sesión ya quedó establecida — la cookie se ve en el navegador — pero
  // nadie redirige). Confirmado empíricamente contra Supabase local.
  //
  // Por eso el efecto de abajo corre EXACTAMENTE una vez al montar ([]
  // como deps, intencional) y lee `router`/`searchParams` desde refs en
  // vez de las variables reactivas — no queremos que ningún cambio
  // posterior de identidad lo re-dispare ni lo cancele a medias.
  const routerRef = useRef(router);
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    routerRef.current = router;
    searchParamsRef.current = searchParams;
  }, [router, searchParams]);

  useEffect(() => {
    let cancelado = false;

    async function procesar() {
      const supabase = createClient();
      const router = routerRef.current;
      const next = rutaSegura(searchParamsRef.current.get("next"));

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const tipo = hash.get("type");
      const errorHash = hash.get("error");

      // Saca el fragmento de la barra de direcciones de inmediato, antes de
      // cualquier `await` — los tokens no deben quedar expuestos en la URL
      // (capturas de pantalla, "copiar enlace") ni un instante más de lo
      // necesario. `replaceState` también reemplaza la entrada actual del
      // historial de la pestaña, así que un "atrás" posterior no la trae de
      // vuelta (aunque el navegador ya haya registrado la URL completa con
      // el token en su historial permanente al cargar la página — eso
      // ningún código de cliente puede borrarlo retroactivamente).
      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }

      if (errorHash) {
        console.error(
          "Enlace de auth con error:",
          hash.get("error_description") || errorHash,
        );
        router.replace("/login?error=auth_callback");
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelado) return;
        if (error) {
          console.error("setSession falló:", error);
          router.replace("/login?error=auth_callback");
          return;
        }
        // Invitación o recuperación: la persona todavía no tiene contraseña
        // propia (invitación) o quiere cambiarla (recuperación) — en los dos
        // casos el siguiente paso es definir una contraseña nueva. Para
        // cualquier otro `type` conocido (magiclink, signup, ...) o si no
        // viene ninguno, sigue a `next`.
        const destino =
          tipo === "invite" || tipo === "recovery"
            ? "/auth/actualizar-clave"
            : next;
        router.replace(destino);
        return;
      }

      const code = searchParamsRef.current.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelado) return;
        if (!error) {
          router.replace(next);
          return;
        }
        console.error("exchangeCodeForSession falló:", error);
      }

      // Sin fragmento con sesión, sin error explícito y sin `?code=`: enlace
      // vencido, reutilizado, o alguien llegó a esta ruta directamente.
      // Nunca se queda a medias en esta pantalla — siempre termina en
      // /login con un mensaje (mensajeErrorParam ya sabe traducir
      // "auth_callback").
      router.replace("/login?error=auth_callback");
    }

    procesar();
    return () => {
      cancelado = true;
    };
    // Deps vacío a propósito: debe correr una sola vez al montar — ver el
    // comentario de más arriba sobre por qué reaccionar a `router`/
    // `searchParams` rompe el flujo. `routerRef`/`searchParamsRef` son
    // estables (useRef), no hace falta declararlos como dependencia.
  }, []);

  return (
    <p className="text-sm text-muted-foreground" role="status">
      Verificando el enlace…
    </p>
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
