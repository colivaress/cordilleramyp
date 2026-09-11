"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilIcon, UserPlusIcon, XIcon } from "lucide-react";
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
  actualizarTiposInspeccion,
  cambiarActivo,
  editarUsuario,
  reenviarInvitacion,
} from "@/app/(app)/usuarios/actions";
import {
  ETIQUETA_TIPO_INSPECCION,
  ORDEN_TIPOS_INSPECCION,
  type Personal,
  type RolUsuario,
} from "@/lib/tipos";

type Form = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  rol: RolUsuario;
  /**
   * Fase "tipos de inspección" §1/§4 — vacío = SIN acceso (ni realizar ni
   * ver ninguna inspección), no "los 4 tipos". Es un estado válido a
   * propósito: sirve para suspender a un supervisor sin desactivar su cuenta.
   */
  tiposInspeccion: string[];
};

const formVacio: Form = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  fechaNacimiento: "",
  rol: "supervisor",
  tiposInspeccion: [],
};

// Rango Unicode "Combining Diacritical Marks" (lo que separa NFD de un
// carácter acentuado, p. ej. "e" + U+0301 para "é"). Se arma con
// String.fromCharCode en vez de escribir el escape ̀-ͯ directo en
// el regex literal, para no depender de cómo cada editor/terminal represente
// esos dos puntos de código al guardar el archivo.
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g",
);

/** Quita tildes/diacríticos y normaliza mayúsculas — para comparar sin que
 *  "jose" deje de encontrar a "José". */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

/** Solo los dígitos — para que el formato guardado del teléfono no importe. */
function soloDigitos(s: string): string {
  return s.replace(/\D+/g, "");
}

/** ¿Este término (ya normalizado) es substring del nombre de alguno de los
 *  4 tipos? Se usa para decidir si expandir una celda "Los 4 tipos" colapsada. */
function terminoApuntaATipo(termino: string): boolean {
  return ORDEN_TIPOS_INSPECCION.some((c) =>
    normalizar(ETIQUETA_TIPO_INSPECCION[c]).includes(termino),
  );
}

/**
 * Envuelve en <mark> las partes de `texto` que calzan con algún término de
 * `terminos` (ya normalizados) — comparando sobre la versión normalizada de
 * `texto` pero recortando y mostrando el texto ORIGINAL (con sus tildes),
 * para que buscar "jose" resalte «José» tal cual está escrito. Funciona
 * porque quitar diacríticos preserva la posición de cada carácter base
 * (una tilde española se saca como una marca combinante aparte, nunca cambia
 * cuántos caracteres hay antes/después).
 */
function resaltar(texto: string, terminos: string[]): React.ReactNode {
  if (!texto || terminos.length === 0) return texto;
  const normalizado = normalizar(texto);
  const rangos: [number, number][] = [];
  for (const t of terminos) {
    if (!t) continue;
    let desde = 0;
    for (;;) {
      const pos = normalizado.indexOf(t, desde);
      if (pos === -1) break;
      rangos.push([pos, pos + t.length]);
      desde = pos + 1;
    }
  }
  if (rangos.length === 0) return texto;
  rangos.sort((a, b) => a[0] - b[0]);
  const fusionados: [number, number][] = [];
  for (const r of rangos) {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && r[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], r[1]);
    else fusionados.push([r[0], r[1]]);
  }
  const partes: React.ReactNode[] = [];
  let cursor = 0;
  fusionados.forEach(([ini, fin], i) => {
    if (ini > cursor) partes.push(texto.slice(cursor, ini));
    partes.push(
      <mark key={i} className="rounded-sm bg-warning-200 text-inherit">
        {texto.slice(ini, fin)}
      </mark>,
    );
    cursor = fin;
  });
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return partes;
}

type FilaBusqueda = {
  usuario: Personal;
  tiposClaves: string[];
  rolTexto: string;
  estadoTexto: string;
  textoGeneral: string;
  telefonoDigitos: string;
};

export function UsuariosTabla({
  usuarios,
  perfilId,
  tiposPorSupervisor,
}: {
  usuarios: Personal[];
  perfilId: string;
  /** personal.id -> claves de tipos_inspeccion permitidos (vacío/ausente = SIN acceso a ninguno). */
  tiposPorSupervisor: Record<string, string[]>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formVacio);
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");

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
      tiposInspeccion: tiposPorSupervisor[u.id] ?? [],
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
        // Fase "tipos de inspección" §1: los permisos se editan solo desde
        // "Editar" — un supervisor recién creado parte SIN ningún tipo
        // asignado, o sea sin poder realizar ni ver ninguna inspección,
        // hasta que un administrador entre a "Editar" y le asigne alguno.
        if (editandoId && form.rol === "supervisor") {
          await actualizarTiposInspeccion({
            personalId: editandoId,
            tipos: form.tiposInspeccion,
          });
        }
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

  // Tipos de inspección: se arma el texto de búsqueda/estado una sola vez
  // por usuario (no por render de fila) — tiposPorSupervisor ya viene
  // calculado con UNA sola consulta para todos los usuarios (usuarios/page.tsx).
  const filasBusqueda = useMemo<FilaBusqueda[]>(() => {
    const ordenados = [...usuarios].sort((a, b) =>
      `${a.nombre} ${a.apellido ?? ""}`.localeCompare(
        `${b.nombre} ${b.apellido ?? ""}`,
        "es",
      ),
    );
    return ordenados.map((u) => {
      const tiposClaves = u.rol === "supervisor" ? (tiposPorSupervisor[u.id] ?? []) : [];
      const rolTexto = u.rol === "administrador" ? "Administrador" : "Supervisor";
      const estadoTexto = !u.activo
        ? "Inactivo"
        : !u.user_id
          ? "Invitación pendiente"
          : "Activo";
      const tiposTexto =
        u.rol === "administrador"
          ? "Todos por ser administrador"
          : tiposClaves.length === 0
            ? "Sin tipos"
            : tiposClaves.length === 4
              ? `Los 4 tipos ${ORDEN_TIPOS_INSPECCION.map((c) => ETIQUETA_TIPO_INSPECCION[c]).join(" ")}`
              : tiposClaves.map((c) => ETIQUETA_TIPO_INSPECCION[c]).join(" ");
      const textoGeneral = normalizar(
        [u.nombre, u.apellido ?? "", u.email ?? "", u.telefono ?? "", rolTexto, estadoTexto, tiposTexto].join(" "),
      );
      return {
        usuario: u,
        tiposClaves,
        rolTexto,
        estadoTexto,
        textoGeneral,
        telefonoDigitos: soloDigitos(u.telefono ?? ""),
      };
    });
  }, [usuarios, tiposPorSupervisor]);

  // Búsqueda en cliente: varios términos, deben calzar TODOS (en cualquiera
  // de los 6 campos), sin tildes/mayúsculas, sin ir a la base — con una
  // docena de usuarios no hay razón para eso.
  const terminos = useMemo(
    () => normalizar(busqueda).split(/\s+/).map((t) => t.trim()).filter(Boolean),
    [busqueda],
  );

  const filtradas = useMemo(() => {
    if (terminos.length === 0) return filasBusqueda;
    return filasBusqueda.filter((f) =>
      terminos.every((t) => {
        if (f.textoGeneral.includes(t)) return true;
        const digitos = soloDigitos(t);
        return digitos.length > 0 && f.telefonoDigitos.includes(digitos);
      }),
    );
  }, [filasBusqueda, terminos]);

  // Si algún término apunta a un tipo puntual, una celda "Los 4 tipos"
  // colapsada se expande a sus 4 etiquetas — si no, no se ve por qué esa
  // fila calzó la búsqueda.
  const hayTerminoDeTipo = useMemo(
    () => terminos.some(terminoApuntaATipo),
    [terminos],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="relative w-full sm:w-[300px]">
            <Input
              id="buscador-usuarios"
              type="text"
              inputMode="search"
              placeholder="Buscar por nombre, correo, teléfono, rol, tipos o estado…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setBusqueda("");
              }}
              className="pr-8"
            />
            {busqueda && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setBusqueda("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {busqueda
              ? `Mostrando ${filtradas.length} de ${filasBusqueda.length} usuarios`
              : `${filasBusqueda.length} usuarios`}
          </span>
        </div>
        <Button type="button" onClick={abrirAgregar}>
          <UserPlusIcon />
          Agregar usuario
        </Button>
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No se encontraron usuarios para «{busqueda}».
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tipos de inspección</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((f) => {
                const u = f.usuario;
                const pendienteInvitacion = !u.user_id;
                const esYo = u.id === perfilId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {resaltar(`${u.nombre} ${u.apellido ?? ""}`.trim(), terminos)}
                    </TableCell>
                    <TableCell>{resaltar(u.email ?? "—", terminos)}</TableCell>
                    <TableCell>{resaltar(u.telefono ?? "—", terminos)}</TableCell>
                    <TableCell>
                      <Badge variant={u.rol === "administrador" ? "default" : "secondary"}>
                        {resaltar(f.rolTexto, terminos)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CeldaTipos
                        rol={u.rol}
                        tiposClaves={f.tiposClaves}
                        terminos={terminos}
                        expandirLos4={hayTerminoDeTipo}
                      />
                    </TableCell>
                    <TableCell>
                      {!u.activo ? (
                        <Badge className="bg-danger-100 text-danger-700">
                          {resaltar(f.estadoTexto, terminos)}
                        </Badge>
                      ) : pendienteInvitacion ? (
                        <Badge className="bg-warning-100 text-warning-700">
                          {resaltar(f.estadoTexto, terminos)}
                        </Badge>
                      ) : (
                        <Badge className="bg-success-100 text-success-700">
                          {resaltar(f.estadoTexto, terminos)}
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
      )}

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

            {/* Fase "tipos de inspección" §1: solo administrador, solo al
                editar un supervisor ya existente. */}
            {editandoId && form.rol === "supervisor" && (
              <div className="grid gap-1.5">
                <Label>Tipos de inspección permitidos</Label>
                <div className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2">
                  {ORDEN_TIPOS_INSPECCION.map((clave) => {
                    const marcado = form.tiposInspeccion.includes(clave);
                    return (
                      <label
                        key={clave}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              tiposInspeccion: e.target.checked
                                ? [...f.tiposInspeccion, clave]
                                : f.tiposInspeccion.filter((t) => t !== clave),
                            }))
                          }
                        />
                        {ETIQUETA_TIPO_INSPECCION[clave]}
                      </label>
                    );
                  })}
                </div>
                {form.tiposInspeccion.length === 0 ? (
                  <span className="text-xs font-medium text-warning-700">
                    Sin ningún tipo marcado, este supervisor no podrá
                    realizar ni ver ninguna inspección. Es una forma válida
                    de suspenderlo sin desactivar su cuenta.
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Solo va a poder realizar y ver inspecciones de los tipos
                    marcados.
                  </span>
                )}
              </div>
            )}

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

/**
 * Celda "Tipos de inspección" — 4 formas visuales, a propósito distintas:
 *  - Administrador: texto gris apagado, sin etiquetas — no es una asignación
 *    suya, es consecuencia del rol. Si se viera igual que una asignación
 *    real, alguien intentaría "editarla".
 *  - Supervisor con los 4: UNA etiqueta gris colapsada — tras el backfill de
 *    la parte 4/4 este es el caso más común; repetir las 4 en cada fila
 *    ensancha la tabla sin decir nada. Se expande solo si la búsqueda apunta
 *    a un tipo puntual (si no, no se ve por qué calzó la fila).
 *  - Supervisor con 1 a 3: una etiqueta azul por tipo, nombre completo.
 *  - Supervisor con ninguno: etiqueta ROJA "Sin tipos" — este supervisor está
 *    BLOQUEADO (no puede realizar ni ver ninguna inspección). Es el error de
 *    configuración que más duele y hasta ahora era invisible desde la lista.
 */
function CeldaTipos({
  rol,
  tiposClaves,
  terminos,
  expandirLos4,
}: {
  rol: RolUsuario;
  tiposClaves: string[];
  terminos: string[];
  expandirLos4: boolean;
}) {
  if (rol === "administrador") {
    return (
      <span className="text-xs text-muted-foreground">
        {resaltar("Todos (por ser administrador)", terminos)}
      </span>
    );
  }
  if (tiposClaves.length === 0) {
    return (
      <Badge className="bg-danger-100 text-danger-700">
        {resaltar("Sin tipos", terminos)}
      </Badge>
    );
  }
  if (tiposClaves.length === 4 && !expandirLos4) {
    return (
      <Badge className="bg-neutral-100 text-neutral-700">
        {resaltar("Los 4 tipos", terminos)}
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ORDEN_TIPOS_INSPECCION.filter((c) => tiposClaves.includes(c)).map((c) => (
        <Badge key={c} className="bg-brand-100 text-brand-700">
          {resaltar(ETIQUETA_TIPO_INSPECCION[c], terminos)}
        </Badge>
      ))}
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
