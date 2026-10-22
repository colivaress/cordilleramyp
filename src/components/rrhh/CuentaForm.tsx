"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { ContenidoBoton, IndicadorGuardado } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import { ListaErrores } from "@/components/rrhh/ListaErrores";
import { crearPersona, guardarCuenta } from "@/app/(app)/rrhh/cuenta-actions";
import {
  ROLES_ASIGNABLES,
  leerCuenta,
  modoTiposInspeccion,
  puedeCambiarRol,
  puedeCambiarTiposInspeccion,
  rolesQuePuedeCrear,
  type FormularioCuenta,
} from "@/lib/rrhh/cuenta";
import { ETIQUETA_ROL, ETIQUETA_TIPO_INSPECCION, ORDEN_TIPOS_INSPECCION, type RolUsuario } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Respuesta = { ok: true; id?: string; aviso?: string } | { ok: false; mensaje: string; errores?: string[] };

/**
 * Sección "Cuenta y acceso" de la ficha: siempre disponible, exista contrato
 * o no — dar de alta a un supervisor no puede esperar a que RRHH tenga su
 * AFP. Los controles (teléfono condicional, tipos de inspección como
 * casillas y el aviso de "sin ningún tipo") vienen tal cual del formulario
 * de /usuarios. Lo que el actor no puede cambiar se muestra deshabilitado,
 * pero eso es solo para no ofrecer un botón que siempre va a fallar: la
 * acción y la base lo rechazan igual.
 */
export function CuentaForm({
  personalId,
  inicial,
  actor,
}: {
  /** null = crear una persona nueva (y su invitación). */
  personalId: string | null;
  inicial: FormularioCuenta;
  actor: RolUsuario;
}) {
  const router = useRouter();
  const creando = personalId === null;
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const guardado = useEstadoGuardado();
  const set = <K extends keyof FormularioCuenta>(k: K, v: FormularioCuenta[K]) => setF((x) => ({ ...x, [k]: v }));

  const rol = f.rol as RolUsuario;
  const telObligatorio = rol === "supervisor";
  const opcionesRol: readonly RolUsuario[] = creando
    ? rolesQuePuedeCrear(actor)
    : puedeCambiarRol(actor)
      ? ROLES_ASIGNABLES
      : [inicial.rol as RolUsuario];
  const rolBloqueado = opcionesRol.length <= 1;
  const tiposEditables = puedeCambiarTiposInspeccion(actor);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardado.pendiente) return;
    const local = leerCuenta(f, { creando });
    if (!local.ok) {
      setErrores(local.errores);
      return;
    }
    setErrores([]);
    try {
      await guardado.ejecutar(async () => {
        const res: Respuesta = creando ? await crearPersona(f) : await guardarCuenta(personalId, f);
        if (!res.ok) {
          if (res.errores) setErrores(res.errores);
          throw new Error(res.mensaje);
        }
        if (res.aviso) toast.warning(res.aviso, { duration: 8000 });
        if (res.id) router.push(`/rrhh/${res.id}`);
      });
      toast.success(creando ? "Persona creada e invitada." : "Cuenta actualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  const campo = (
    id: "nombre" | "apellido" | "rut" | "email" | "telefono" | "fechaNacimiento" | "contactoNombre" | "contactoTelefono" | "contactoRelacion",
    etiqueta: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={`cuenta-${id}`}>{etiqueta}</Label>
      <Input id={`cuenta-${id}`} value={f[id]} onChange={(e) => set(id, e.target.value)} autoComplete="off" {...props} />
    </div>
  );

  const modo = modoTiposInspeccion(rol);

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campo("nombre", "Nombre")}
        {campo("apellido", "Apellido")}
        {campo("rut", "RUT", { placeholder: "12.345.678-9" })}
        {campo("email", "Correo", { type: "email", disabled: !creando })}
        {campo("telefono", telObligatorio ? "Teléfono (obligatorio para supervisor)" : "Teléfono (opcional)", {
          placeholder: "569XXXXXXXX",
        })}
        {campo("fechaNacimiento", "Fecha de nacimiento", { type: "date" })}
        {/* min-w-0 + w-full/truncate: sin las dos, "Administrador de
            contrato" desborda la celda de la grilla (bug ya visto en
            /usuarios). */}
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="cuenta-rol">Rol</Label>
          <select
            id="cuenta-rol"
            value={f.rol}
            disabled={rolBloqueado}
            onChange={(e) => set("rol", e.target.value)}
            className={cn(nativeSelectClassName, "w-full truncate")}
          >
            {opcionesRol.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
          {rolBloqueado && (
            <span className="text-xs text-muted-foreground">
              {creando
                ? "Como administrador de contrato creas personas con rol Trabajador. El rol lo cambia un administrador."
                : "Solo un administrador puede cambiar el rol."}
            </span>
          )}
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Contacto de emergencia</legend>
        <p className="text-xs text-muted-foreground">
          A quién avisar si la persona tiene un accidente. Es un dato de otra persona: lo ven solo los
          administradores, los administradores de contrato y la propia persona.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campo("contactoNombre", "Nombre")}
          {campo("contactoTelefono", "Teléfono", { placeholder: "+56 9 1234 5678", inputMode: "tel" })}
          {campo("contactoRelacion", "Relación (opcional)", { placeholder: "Esposa, hermano, madre…" })}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label>Tipos de inspección</Label>
        {modo === "todos" && <p className="text-sm text-muted-foreground">Todos (por ser administrador).</p>}
        {modo === "no_aplica" && <p className="text-sm text-muted-foreground">No aplica para este rol.</p>}
        {modo === "checkboxes" && (
          <>
            <div className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2">
              {ORDEN_TIPOS_INSPECCION.map((clave) => (
                <label key={clave} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand-600"
                    disabled={!tiposEditables}
                    checked={f.tiposInspeccion.includes(clave)}
                    onChange={(e) =>
                      set(
                        "tiposInspeccion",
                        e.target.checked ? [...f.tiposInspeccion, clave] : f.tiposInspeccion.filter((t) => t !== clave),
                      )
                    }
                  />
                  {ETIQUETA_TIPO_INSPECCION[clave]}
                </label>
              ))}
            </div>
            {f.tiposInspeccion.length === 0 ? (
              <span className="text-xs font-medium text-warning-700">
                Sin ningún tipo marcado, este supervisor no podrá realizar ni ver ninguna inspección. Es una forma
                válida de suspenderlo sin desactivar su cuenta.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Solo va a poder realizar y ver inspecciones de los tipos marcados.
              </span>
            )}
            {!tiposEditables && (
              <span className="text-xs text-muted-foreground">Solo un administrador puede cambiar los tipos.</span>
            )}
          </>
        )}
      </div>

      <ListaErrores errores={errores} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardado.pendiente}>
          <ContenidoBoton
            pendiente={guardado.pendiente}
            texto={creando ? "Crear e invitar" : "Guardar cuenta"}
            textoPendiente="Guardando…"
          />
        </Button>
        <IndicadorGuardado estado={guardado.estado} />
      </div>
    </form>
  );
}
