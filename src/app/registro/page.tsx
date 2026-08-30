"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function RegistroPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setCargando(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // §2.10: el rol NO se elige acá — lo definió el administrador al invitar.
        data: { nombre, apellido, telefono, fecha_nacimiento: fechaNacimiento },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    setCargando(false);
    if (error) {
      // §2.10: si el correo no tiene una invitación pendiente, el trigger
      // handle_new_user rechaza el alta (Supabase lo devuelve como error
      // genérico de base de datos).
      const noAutorizada = /database error saving new user|not authorized|no está autorizada/i.test(
        error.message,
      );
      setError(
        noAutorizada
          ? "Este correo no está autorizado. Pídele a un administrador de Cordillera M&P que cree tu cuenta."
          : error.message,
      );
      return;
    }
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setOk("Cuenta activada. Ya puedes iniciar sesión.");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Activar cuenta</CardTitle>
          <CardDescription>
            Cordillera M&amp;P — solo para correos que un administrador ya
            autorizó. El rol lo define el administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input
                id="apellido"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fecha-nacimiento">Fecha de nacimiento</Label>
              <Input
                id="fecha-nacimiento"
                type="date"
                required
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telefono">
                Teléfono (formato internacional, solo dígitos)
              </Label>
              <Input
                id="telefono"
                inputMode="numeric"
                placeholder="569XXXXXXXX"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {ok && <p className="text-sm text-success-700">{ok}</p>}
            <Button type="submit" disabled={cargando}>
              {cargando ? "Creando…" : "Crear cuenta"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tiene cuenta?{" "}
              <Link href="/login" className="text-primary underline">
                Iniciar sesión
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
