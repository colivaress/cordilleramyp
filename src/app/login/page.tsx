"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { mensajeErrorAuth, mensajeErrorParam } from "@/lib/auth-errores";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(mensajeErrorParam(params.get("error")));
  const [aviso, setAviso] = useState<string | null>(
    params.get("mensaje") === "clave_actualizada"
      ? "Contraseña actualizada. Ya puedes iniciar sesión."
      : null,
  );
  const [cargando, setCargando] = useState(false);
  // Cuenta de intentos fallidos consecutivos en ESTA pantalla (se resetea al
  // entrar bien). `mensajeErrorAuth` la usa para distinguir un error de red
  // real de un throttling de Supabase Auth, indistinguibles por el texto del
  // error — ver el comentario en auth-errores.ts.
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  // A partir de 3 fallos seguidos, pausa el botón unos segundos para no
  // seguir golpeando el throttling con reintentos inmediatos. El botón tiene
  // que decir CUÁNTO falta (no solo quedar deshabilitado) — un botón muerto
  // sin explicación es peor que el mensaje que este fix viene a corregir: el
  // supervisor lo lee como "está roto" y llama a soporte igual.
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const intervaloBloqueoRef = useRef<number | null>(null);

  function limpiarBloqueo() {
    if (intervaloBloqueoRef.current !== null) {
      window.clearInterval(intervaloBloqueoRef.current);
      intervaloBloqueoRef.current = null;
    }
    setSegundosRestantes(0);
  }

  useEffect(() => limpiarBloqueo, []);

  // §8.1: recuperación de contraseña — se despliega en el mismo lugar.
  const [modo, setModo] = useState<"login" | "recuperar">("login");
  const [recuperarEmail, setRecuperarEmail] = useState("");
  const [recuperarEnviado, setRecuperarEnviado] = useState(false);

  function registrarFallo(error: unknown) {
    // Usa la cuenta de fallos PREVIA a este (0 en el primer intento) para
    // decidir el mensaje, y recién después suma este fallo para el próximo.
    setError(mensajeErrorAuth(error, { intentosFallidos }));
    const siguiente = intentosFallidos + 1;
    setIntentosFallidos(siguiente);
    if (siguiente >= 3) {
      if (intervaloBloqueoRef.current !== null) {
        window.clearInterval(intervaloBloqueoRef.current);
      }
      setSegundosRestantes(15);
      intervaloBloqueoRef.current = window.setInterval(() => {
        setSegundosRestantes((s) => {
          if (s <= 1) {
            if (intervaloBloqueoRef.current !== null) {
              window.clearInterval(intervaloBloqueoRef.current);
              intervaloBloqueoRef.current = null;
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Login falló:", error);
        registrarFallo(error);
        return;
      }
      setIntentosFallidos(0);
      limpiarBloqueo();
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      console.error("Login falló (excepción):", err);
      registrarFallo(err);
    } finally {
      setCargando(false);
    }
  }

  async function onRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(recuperarEmail, {
        // Pasa por /auth/callback para canjear el code (PKCE) y dejar la sesión
        // de recuperación lista antes de mostrar el formulario de nueva clave.
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback?next=/auth/actualizar-clave`
            : undefined,
      });
      // §8.1: mensaje genérico — no revelamos si el correo existe o no.
      if (error) console.error("resetPasswordForEmail falló:", error);
      setRecuperarEnviado(true);
    } catch (err) {
      console.error("resetPasswordForEmail falló (excepción):", err);
      setRecuperarEnviado(true);
    } finally {
      setCargando(false);
    }
  }

  if (modo === "recuperar") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <Logo imgClassName="h-36 w-auto max-w-full" />
          </div>
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            Te enviaremos un enlace para restablecer tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recuperarEnviado ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground" role="status">
                Si el correo existe, te enviamos un enlace para restablecer tu
                contraseña.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModo("login");
                  setRecuperarEnviado(false);
                }}
              >
                Volver a iniciar sesión
              </Button>
            </div>
          ) : (
            <form onSubmit={onRecuperar} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="recuperar-email">Correo</Label>
                <Input
                  id="recuperar-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={recuperarEmail}
                  onChange={(e) => setRecuperarEmail(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={cargando}>
                {cargando ? "Enviando…" : "Enviar correo de recuperación"}
              </Button>
              <button
                type="button"
                className="text-center text-sm text-muted-foreground underline"
                onClick={() => {
                  setModo("login");
                  setError(null);
                }}
              >
                Volver a iniciar sesión
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-4 flex justify-center">
          <Logo imgClassName="h-36 w-auto max-w-full" />
        </div>
        <CardTitle className="text-xl">Iniciar sesión</CardTitle>
        <CardDescription>
          Cordillera M&amp;P — Revisión de Equipos y Camiones
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {aviso && (
            <p className="text-sm text-success-700" role="status">
              {aviso}
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={cargando || segundosRestantes > 0}>
            {cargando
              ? "Ingresando…"
              : segundosRestantes > 0
                ? `Espera ${segundosRestantes} s…`
                : "Ingresar"}
          </Button>
          <button
            type="button"
            className="text-center text-sm text-primary underline"
            onClick={() => {
              setModo("recuperar");
              setError(null);
              setAviso(null);
              setRecuperarEmail(email);
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Tienes una invitación?{" "}
            <Link href="/registro" className="text-primary underline">
              Activar cuenta
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
