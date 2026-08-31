"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { mensajeErrorAuth } from "@/lib/auth-errores";

export default function ActualizarClavePage() {
  const router = useRouter();
  const [estado, setEstado] = useState<"verificando" | "listo" | "sin_sesion">(
    "verificando",
  );
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // §8.1: se llega acá desde el enlace del correo, que pasa por /auth/callback y
  // deja una sesión de recuperación activa. Si no hay sesión, el enlace venció.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        console.error("actualizar-clave sin sesión:", error);
        setEstado("sin_sesion");
      } else {
        setEstado("listo");
      }
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("updateUser falló:", error);
        setError(mensajeErrorAuth(error));
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login?mensaje=clave_actualizada");
    } catch (err) {
      console.error("updateUser falló (excepción):", err);
      setError(mensajeErrorAuth(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Nueva contraseña</CardTitle>
          <CardDescription>
            Elige una contraseña nueva para tu cuenta de Cordillera M&amp;P.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estado === "verificando" && (
            <p className="text-sm text-muted-foreground" role="status">
              Verificando el enlace…
            </p>
          )}

          {estado === "sin_sesion" && (
            <div className="grid gap-4">
              <p className="text-sm text-destructive" role="alert">
                El enlace no es válido o expiró. Solicita uno nuevo desde
                “¿Olvidaste tu contraseña?”.
              </p>
              <Link
                href="/login"
                className="text-center text-sm text-primary underline"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          )}

          {estado === "listo" && (
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmar">Repetir contraseña</Label>
                <Input
                  id="confirmar"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={cargando}>
                {cargando ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
