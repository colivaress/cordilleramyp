"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  agregarUsuario,
  cambiarActivo,
  editarUsuario,
  reenviarInvitacion,
} from "@/app/(app)/usuarios/actions";
import type { Personal, RolUsuario } from "@/lib/tipos";

const fmtFecha = (v: string | null) =>
  v ? new Date(v + "T00:00:00").toLocaleDateString("es-CL") : "—";

type Form = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  rol: RolUsuario;
};

const formVacio: Form = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  fechaNacimiento: "",
  rol: "supervisor",
};

export function UsuariosTabla({
  usuarios,
  perfilId,
}: {
  usuarios: Personal[];
  perfilId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formVacio);
  const [pendiente, startTransition] = useTransition();

  const telObligatorio = form.rol === "supervisor";
  const formValido =
    form.nombre.trim() &&
    form.apellido.trim() &&
    form.email.trim() &&
    form.fechaNacimiento &&
    (!telObligatorio || form.telefono.trim());

  function abrirAgregar() {
    setEditandoId(null);
    setForm(formVacio);
    setAbierto(true);
  }

  function abrirEditar(u: Personal) {
    setEditandoId(u.id);
    setForm({
      nombre: u.nombre,
      apellido: u.apellido ?? "",
      email: u.email ?? "",
      telefono: u.telefono ?? "",
      fechaNacimiento: u.fecha_nacimiento ?? "",
      rol: u.rol,
    });
    setAbierto(true);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!formValido || pendiente) return;
    startTransition(async () => {
      try {
        const base = {
          nombre: form.nombre,
          apellido: form.apellido,
          email: form.email,
          telefono: form.telefono,
          fechaNacimiento: form.fechaNacimiento,
          rol: form.rol,
        };
        const res = editandoId
          ? await editarUsuario({ ...base, id: editandoId })
          : await agregarUsuario(base);
        setAbierto(false);
        toast.success(
          editandoId ? "Usuario actualizado." : "Usuario creado e invitado.",
        );
        if (res.aviso) toast.warning(res.aviso, { duration: 8000 });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo guardar el usuario.",
        );
      }
    });
  }

  function accion(fn: () => Promise<unknown>, exito: string) {
    startTransition(async () => {
      try {
        const r = (await fn()) as { aviso?: string } | undefined;
        toast.success(exito);
        if (r?.aviso) toast.warning(r.aviso, { duration: 8000 });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo completar.");
      }
    });
  }

  const filas = useMemo(
    () =>
      [...usuarios].sort((a, b) =>
        `${a.nombre} ${a.apellido ?? ""}`.localeCompare(
          `${b.nombre} ${b.apellido ?? ""}`,
          "es",
        ),
      ),
    [usuarios],
  );

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={abrirAgregar}>
          <UserPlusIcon />
          Agregar usuario
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha de nacimiento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((u) => {
              const pendienteInvitacion = !u.user_id;
              const esYo = u.id === perfilId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.nombre} {u.apellido ?? ""}
                  </TableCell>
                  <TableCell>{u.email ?? "—"}</TableCell>
                  <TableCell>{u.telefono ?? "—"}</TableCell>
                  <TableCell>{fmtFecha(u.fecha_nacimiento)}</TableCell>
                  <TableCell>
                    <Badge variant={u.rol === "administrador" ? "default" : "secondary"}>
                      {u.rol === "administrador" ? "Administrador" : "Supervisor"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!u.activo ? (
                      <Badge className="bg-danger-100 text-danger-700">
                        Inactivo
                      </Badge>
                    ) : pendienteInvitacion ? (
                      <Badge className="bg-warning-100 text-warning-700">
                        Invitación pendiente
                      </Badge>
                    ) : (
                      <Badge className="bg-success-100 text-success-700">
                        Activo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={pendiente}
                        onClick={() => abrirEditar(u)}
                      >
                        <PencilIcon />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={pendiente || (esYo && u.activo)}
                        title={
                          esYo && u.activo
                            ? "No puedes desactivar tu propia cuenta"
                            : undefined
                        }
                        onClick={() =>
                          accion(
                            () =>
                              cambiarActivo({ id: u.id, activo: !u.activo }),
                            u.activo ? "Usuario desactivado." : "Usuario activado.",
                          )
                        }
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                      {pendienteInvitacion && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={pendiente}
                          onClick={() =>
                            accion(
                              () => reenviarInvitacion({ id: u.id }),
                              "Invitación reenviada.",
                            )
                          }
                        >
                          Reenviar invitación
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editandoId ? "Editar usuario" : "Agregar usuario"}
            </DialogTitle>
            <DialogDescription>
              {editandoId
                ? "Corrige cualquier dato del usuario. El correo no se puede cambiar."
                : "Se crea la cuenta y se le envía una invitación por correo para que defina su contraseña."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={guardar} className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo
                id="u-nombre"
                label="Nombre"
                value={form.nombre}
                onChange={(v) => setForm((f) => ({ ...f, nombre: v }))}
              />
              <Campo
                id="u-apellido"
                label="Apellido"
                value={form.apellido}
                onChange={(v) => setForm((f) => ({ ...f, apellido: v }))}
              />
            </div>
            <Campo
              id="u-email"
              label="Correo"
              type="email"
              value={form.email}
              disabled={!!editandoId}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="u-rol">Rol</Label>
                <select
                  id="u-rol"
                  value={form.rol}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      rol: e.target.value as RolUsuario,
                    }))
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              <Campo
                id="u-fnac"
                label="Fecha de nacimiento"
                type="date"
                value={form.fechaNacimiento}
                onChange={(v) =>
                  setForm((f) => ({ ...f, fechaNacimiento: v }))
                }
              />
            </div>
            <Campo
              id="u-tel"
              label={
                telObligatorio
                  ? "Teléfono (obligatorio para supervisor)"
                  : "Teléfono (opcional)"
              }
              value={form.telefono}
              placeholder="569XXXXXXXX"
              onChange={(v) => setForm((f) => ({ ...f, telefono: v }))}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAbierto(false)}
                disabled={pendiente}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!formValido || pendiente}>
                {pendiente ? "Guardando…" : editandoId ? "Guardar" : "Crear e invitar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
