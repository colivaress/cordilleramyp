"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EllipsisIcon, PencilIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContenidoBoton } from "@/components/ui/estado-accion";
import { useEstadoGuardado } from "@/hooks/use-estado-guardado";
import {
  agregarUsuario,
  actualizarTiposInspeccion,
  cambiarActivo,
  editarUsuario,
  reenviarInvitacion,
  type ResultadoUsuario,
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

/** "hace 12 h" / "hace 3 días" — antigüedad de una invitación pendiente,
 *  contada desde personal.created_at (el momento en que agregarUsuario crea
 *  la fila, en la misma request donde se dispara la invitación real — no
 *  hace falta ningún dato de auth.users para esto). */
function antiguedadDesde(fechaIso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(fechaIso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "hace menos de 1 h";
  if (horas < 48) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

type FilaBusqueda = {
  usuario: Personal;
  tiposClaves: string[];
  rolTexto: string;
  estadoTexto: string;
  /** true solo cuando activo=true Y alguna_vez_inicio_sesion=false — fuente
   *  única para el color del badge y el botón "Reenviar invitación" (antes
   *  cada uno recalculaba esto por su cuenta a partir de !user_id, que
   *  queda poblado desde el instante de la invitación, no desde el primer
   *  login — ver migración 20260918020000). */
  pendienteInvitacion: boolean;
  /** Solo con contenido cuando pendienteInvitacion=true. */
  antiguedadInvitacion: string | null;
  textoGeneral: string;
  telefonoDigitos: string;
};

export function UsuariosTabla({
  usuarios,
  perfilId,
  perfilRol,
  tiposPorSupervisor,
  accesoPorPersonal,
}: {
  usuarios: Personal[];
  perfilId: string;
  /** Rol de quien está usando este panel — decide qué rol puede ofrecer el
   *  <select> del formulario (ver más abajo). */
  perfilRol: RolUsuario;
  /** personal.id -> claves de tipos_inspeccion permitidos (vacío/ausente = SIN acceso a ninguno). */
  tiposPorSupervisor: Record<string, string[]>;
  /** personal.id -> alguna_vez_inicio_sesion (private.estado_acceso_personal(),
   *  migración 20260918020000). Ausente = todavía sin user_id vinculado, se
   *  trata igual que "nunca inició sesión". */
  accesoPorPersonal: Record<string, boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formVacio);
  // Retroalimentación visual — nivel 1, pieza única (useEstadoGuardado). Solo
  // para el formulario del diálogo — las filas de la tabla tienen cada una
  // su propia instancia en FilaUsuario, más abajo: antes compartían un único
  // `pendiente` de useTransition para TODA la tabla (bug real, no solo
  // prolijidad — apretar "Desactivar" en una fila apagaba las nueve).
  const guardadoDialogo = useEstadoGuardado();
  const pendiente = guardadoDialogo.pendiente;
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

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!formValido || pendiente) return;
    try {
      await guardadoDialogo.ejecutar(async () => {
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
        if (!res.ok) throw new Error(res.mensaje);
        // Fase "tipos de inspección" §1: los permisos se editan solo desde
        // "Editar" — un supervisor recién creado parte SIN ningún tipo
        // asignado, o sea sin poder realizar ni ver ninguna inspección,
        // hasta que un administrador entre a "Editar" y le asigne alguno.
        if (editandoId && form.rol === "supervisor") {
          const resTipos = await actualizarTiposInspeccion({
            personalId: editandoId,
            tipos: form.tiposInspeccion,
          });
          if (!resTipos.ok) throw new Error(resTipos.mensaje);
        }
        setAbierto(false);
        toast.success(
          editandoId ? "Usuario actualizado." : "Usuario creado e invitado.",
        );
        if (res.aviso) toast.warning(res.aviso, { duration: 8000 });
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar el usuario.",
      );
    }
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
      const rolTexto =
        u.rol === "administrador"
          ? "Administrador"
          : u.rol === "administrador_contrato"
            ? "Administrador de contrato"
            : "Supervisor";
      // El dato real es auth.users.last_sign_in_at (via
      // accesoPorPersonal/private.estado_acceso_personal()), no
      // personal.user_id — user_id se puebla desde el instante en que se
      // invita (inviteUserByEmail crea la cuenta de auth y el trigger
      // handle_new_user la vincula ahí mismo), no desde el primer login.
      // "Desactivado" gana sobre todo lo demás.
      const algunaVezInicioSesion = accesoPorPersonal[u.id] ?? false;
      const pendienteInvitacion = u.activo && !algunaVezInicioSesion;
      const antiguedadInvitacion = pendienteInvitacion
        ? antiguedadDesde(u.created_at)
        : null;
      const estadoTexto = !u.activo
        ? "Desactivado"
        : pendienteInvitacion
          ? "Invitación pendiente"
          : "Activo";
      // administrador_contrato: el concepto "tipos permitidos" no aplica —
      // no ejecuta inspecciones, asigna tipos a otros. Ni "Todos" (no es
      // realmente un administrador de inspecciones) ni el badge rojo "Sin
      // tipos" (esa alarma es real para un supervisor bloqueado, no acá).
      const tiposTexto =
        u.rol === "administrador"
          ? "Todos por ser administrador"
          : u.rol === "administrador_contrato"
            ? "No aplica"
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
        pendienteInvitacion,
        antiguedadInvitacion,
        textoGeneral,
        telefonoDigitos: soloDigitos(u.telefono ?? ""),
      };
    });
  }, [usuarios, tiposPorSupervisor, accesoPorPersonal]);

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
          {/* table-fixed + un ancho por columna (en el <th>, es el que manda
              con table-layout:fixed): sin esto el navegador reparte el ancho
              según el contenido más largo de cada columna — un correo largo
              o "Todos (por ser administrador)" descuadraban toda la tabla.
              Con anchos fijos el comportamiento es predecible, y es lo que
              permite truncar el correo (§ celda Correo) y fijar la columna
              Acciones (§ celda Acciones, sticky).

              Anchos en PX, no en %: el ancho real disponible para esta tabla
              es constante (~1088px) en todo el rango de escritorio — lo pone
              el max-w-6xl + el padding de la página/card en
              src/app/(app)/layout.tsx, no el viewport — así que un ancho fijo
              en px es tan predecible como un % acá, y deja fijar Rol a un
              número exacto en vez de un porcentaje que hay que recalcular a
              mano cada vez que cambia otra columna.

              Rol = 190px: medido en vivo (Playwright) — el badge
              "Administrador de contrato" (el rol con el texto más largo)
              mide 165px de ancho natural (w-fit + shrink-0 en Badge, nunca
              se achica ni envuelve, ver src/components/ui/badge.tsx) más
              8px+8px de padding de la celda = 181px mínimo. 190px deja
              margen. Antes esta columna tenía 12% (~130px) y el badge se
              desbordaba sobre "Tipos de inspección" — bug real, reportado.
              Los 60px que gana Rol salen de Correo (250px -> 191px), que es
              la que absorbe contenido largo truncando con "…" (ver su
              celda, más abajo) — nunca se pierde el dato, solo se ve más
              corto. El resto de las columnas quedan en su ancho actual,
              convertido de % a px sobre el mismo total (~1088px). */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[218px]">Nombre</TableHead>
                {/* 225px: recibe los 34px que Acciones deja de necesitar
                    (174px -> 140px, ver esa celda) — Correo es la columna
                    que absorbe ancho extra truncando, nunca se pierde el
                    dato. */}
                <TableHead className="w-[225px]">Correo</TableHead>
                <TableHead className="w-[190px]">Rol</TableHead>
                <TableHead className="w-[218px]">Tipos de inspección</TableHead>
                <TableHead className="w-[98px]">Estado</TableHead>
                {/* sticky + bg-card propio: sin el fondo opaco, el contenido
                    de las otras columnas se ve pasando por debajo al
                    desplazar horizontalmente. La sombra a la izquierda marca
                    el borde para que se lea como columna fija, no como un
                    corte. */}
                {/* Ancho fijo, ya no depende de cuántas acciones aplican a
                    la fila (antes: hasta 3 botones de texto en una fila con
                    invitación pendiente — Editar/Desactivar/Reenviar
                    invitación — desbordaban los 174px que alcanzaban para 2,
                    tapando la columna Estado). Ahora la celda siempre
                    renderiza como máximo dos controles — "Editar" + el
                    disparador "⋯" del menú — sin importar cuántos ítems haya
                    adentro del menú. Medido en vivo tras el cambio, ver el
                    comentario en la celda de abajo. */}
                <TableHead className="sticky right-0 z-20 w-[140px] bg-card text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((f) => (
                <FilaUsuario
                  key={f.usuario.id}
                  fila={f}
                  perfilId={perfilId}
                  perfilRol={perfilRol}
                  terminos={terminos}
                  hayTerminoDeTipo={hayTerminoDeTipo}
                  onEditar={abrirEditar}
                />
              ))}
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
              {/* min-w-0 (acá) + w-full/truncate (en el <select>, abajo):
                  dos causas juntas producían el desborde. (1) Los hijos de
                  grid tienen min-width:auto por defecto — esta celda no se
                  encogía por debajo del ancho intrínseco de su contenido.
                  (2) nativeSelectClassName no trae ancho a propósito (cada
                  uso decide w-full/w-fit según el caso) — sin uno, un
                  <select> nativo se dimensiona por su opción más ancha, no
                  por su contenedor, así que aunque (1) se arregle solo, el
                  <select> igual se sale de la celda ya encogida. Con las
                  dos, "Administrador de contrato" se recorta con "…" en vez
                  de tapar "Fecha de nacimiento" (bug real, visto en
                  producción — las etiquetas cortas anteriores lo dejaban
                  latente). */}
              <div className="grid min-w-0 gap-1.5">
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
                  className={cn(nativeSelectClassName, "w-full truncate")}
                >
                  <option value="supervisor">Supervisor</option>
                  {/* Un administrador_contrato nunca puede dejar a nadie como
                      administrador (RLS de personal_update, migración
                      20260917030000) — no se le ofrece la opción, así el
                      intento ni siquiera llega al servidor. Excepción: si la
                      fila que se está editando YA es administrador, se
                      mantiene la opción visible (aunque este rol tampoco
                      pueda guardar ningún cambio ahí, bloqueado aparte por
                      la RLS) para que el <select> no quede sin ninguna
                      opción seleccionada. */}
                  {(perfilRol !== "administrador_contrato" ||
                    form.rol === "administrador") && (
                    <option value="administrador">Administrador</option>
                  )}
                  <option value="administrador_contrato">
                    Administrador de contrato
                  </option>
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
                <ContenidoBoton
                  pendiente={pendiente}
                  texto={editandoId ? "Guardar" : "Crear e invitar"}
                  textoPendiente="Guardando…"
                />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Una fila de la tabla, con su PROPIA instancia de useEstadoGuardado — antes
 * las tres acciones de fila (Editar/Activar-Desactivar/Reenviar invitación)
 * compartían un único `pendiente` de useTransition para toda la tabla:
 * apretar "Desactivar" en una fila apagaba los botones de las otras nueve,
 * sin decir cuál estaba trabajando. Acá cada fila es su propio componente,
 * así que cada una tiene su propio hook — solo ESTA fila se deshabilita.
 */
function FilaUsuario({
  fila: f,
  perfilId,
  perfilRol,
  terminos,
  hayTerminoDeTipo,
  onEditar,
}: {
  fila: FilaBusqueda;
  perfilId: string;
  perfilRol: RolUsuario;
  terminos: string[];
  hayTerminoDeTipo: boolean;
  onEditar: (u: Personal) => void;
}) {
  const u = f.usuario;
  const pendienteInvitacion = f.pendienteInvitacion;
  const esYo = u.id === perfilId;
  // Refleja la RLS de personal_update (migración 20260917030000): un
  // administrador_contrato no puede tocar una fila administrador por
  // ningún camino, ni siquiera activo. "Editar"/"Desactivar" no deben
  // ofrecerse sobre esa fila — mismo patrón que el <select> de rol y el
  // botón de reenviar invitación, más arriba: no dejar un botón que
  // siempre va a fallar.
  const puedeModificar = !(perfilRol === "administrador_contrato" && u.rol === "administrador");
  const guardado = useEstadoGuardado();
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  // El diálogo de confirmación de "Desactivar" vive FUERA del árbol del
  // DropdownMenu (más abajo, como hermano de <TableRow>) a propósito: si
  // viviera adentro, cerrar el menú (closeOnClick del ítem, o Escape)
  // desmontaría el diálogo junto con él — bug conocido de anidar un Dialog
  // dentro de un Menu. Por eso hace falta esta ref: el foco tiene que volver
  // a mano al botón "⋯" después de confirmar o cancelar, porque el menú que
  // lo abrió ya se cerró (y probablemente perdió el elemento que tenía el
  // foco) antes de que el diálogo termine de cerrarse.
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function accion(fn: () => Promise<ResultadoUsuario>, exito: string) {
    try {
      const r = await guardado.ejecutar(async () => {
        const res = await fn();
        if (!res.ok) throw new Error(res.mensaje);
        return res;
      });
      toast.success(exito);
      if (r.aviso) toast.warning(r.aviso, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar.");
    }
  }

  function cerrarConfirmacion() {
    setConfirmandoDesactivar(false);
    triggerRef.current?.focus();
  }

  async function confirmarDesactivar() {
    await accion(() => cambiarActivo({ id: u.id, activo: false }), "Usuario desactivado.");
    cerrarConfirmacion();
  }

  return (
    <>
    <TableRow className="group">
      <TableCell className="font-medium">
        <div>{resaltar(`${u.nombre} ${u.apellido ?? ""}`.trim(), terminos)}</div>
        {/* Antes columna propia — si no hay teléfono, hoy dejaba un "—"
            suelto en su propia celda; acá simplemente no se muestra nada. */}
        {u.telefono && (
          <div className="text-xs font-normal text-muted-foreground">
            {resaltar(u.telefono, terminos)}
          </div>
        )}
      </TableCell>
      {/* truncate = overflow-hidden + text-ellipsis + whitespace-nowrap. El
          dato completo nunca se pierde: sigue ahí para copiar/seleccionar,
          y queda disponible en el `title` para leerlo al pasar el mouse. */}
      <TableCell className="truncate" title={u.email ?? undefined}>
        {resaltar(u.email ?? "—", terminos)}
      </TableCell>
      <TableCell>
        <Badge
          variant={
            u.rol === "administrador" || u.rol === "administrador_contrato"
              ? "default"
              : "secondary"
          }
        >
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
          <>
            {/* Override puntual del nowrap de Badge, SOLO acá — no se toca
                el componente global: la pastilla de Rol depende de ese
                nowrap junto con su ancho fijo de 190px (PR #60). Sin esto,
                "Invitación pendiente" (dos palabras, más larga que "Activo"/
                "Desactivado") se desbordaba fuera de la celda de 98px — el
                texto seguía completo en el DOM, pero la columna Acciones
                (sticky, con fondo opaco) lo tapaba por encima, dando la
                apariencia de corte ("Invitación penc"). max-w-full +
                whitespace-normal fuerza el quiebre dentro del ancho de la
                celda; h-auto + py-1 porque Badge trae h-5 fijo (se saldría
                por arriba/abajo al partirse en dos líneas); rounded-md en
                vez del rounded-4xl heredado, que con dos líneas se ve como
                una cápsula deformada. */}
            <Badge className="h-auto max-w-full whitespace-normal rounded-md bg-warning-100 py-1 text-center leading-tight text-warning-700">
              {resaltar(f.estadoTexto, terminos)}
            </Badge>
            {/* Antigüedad como línea secundaria, no dentro de la pastilla —
                mismo motivo que el teléfono bajo el nombre: la columna
                Estado es angosta a propósito, y "Invitación pendiente · hace
                12 h" en una sola pastilla se desbordaría igual que el bug ya
                arreglado en la columna Rol. Sin esto, un administrador no
                puede distinguir una invitación recién enviada de una cuyo
                enlace ya expiró. */}
            {f.antiguedadInvitacion && (
              <div className="mt-1 text-xs text-muted-foreground">
                {f.antiguedadInvitacion}
              </div>
            )}
          </>
        ) : (
          <Badge className="bg-success-100 text-success-700">
            {resaltar(f.estadoTexto, terminos)}
          </Badge>
        )}
      </TableCell>
      {/* sticky + bg-card + group-hover: mismo fondo opaco del <th> (arriba),
          pero además necesita seguir el hover de la fila a mano — el hover
          de TableRow pinta el <tr>, que un fondo opaco en el <td> tapa por
          diseño (es lo que la mantiene legible mientras se desplaza el
          resto de la fila por debajo). `group` en el <tr> + `group-hover`
          acá sincroniza los dos. */}
      <TableCell className="sticky right-0 z-10 bg-card shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)] group-hover:bg-muted/50">
        {/* Siempre como máximo DOS controles visibles — "Editar" + el
            disparador "⋯" — sin importar cuántas acciones apliquen a esta
            fila (antes: hasta 3 botones de texto en la misma fila con
            invitación pendiente, que desbordaban la celda y tapaban la
            columna Estado — bug real, reportado). El resto de las acciones
            (Desactivar/Activar, Reenviar invitación) vive adentro del menú,
            así que el ancho de esta celda deja de depender del estado de la
            fila. */}
        <div className="flex flex-nowrap items-center justify-end gap-1.5">
          {/* Sin IndicadorGuardado acá a propósito (bug real, reportado): esta
              celda es de ancho fijo y ya está justo con Editar + el
              disparador "⋯" — agregarle el indicador ("Guardando…"/"Error al
              guardar") la desbordaba, y como es sticky con fondo opaco pero
              el contenido desbordado no lo hereda, el texto quedaba flotando
              sobre la columna Estado, montado encima de la pastilla. El éxito
              y el error de una acción de fila ya se avisan por toast (más
              abajo, en `accion()`) — eso es el aviso de arriba; no hace falta
              duplicarlo acá. `guardado.pendiente` sigue deshabilitando los
              controles mientras hay algo en curso. */}
          {/* size="sm"/"icon-sm" explícito a propósito: hasta dos acciones
              por fila en un panel de administración de escritorio — el
              default de 44px infla cada fila sin necesidad (no es lo que usa
              el supervisor parado en el patio, ver button.tsx). */}
          {puedeModificar && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={guardado.pendiente}
                onClick={() => onEditar(u)}
              >
                <PencilIcon />
                Editar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      ref={triggerRef}
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={guardado.pendiente}
                    />
                  }
                >
                  <EllipsisIcon />
                  <span className="sr-only">
                    Más acciones para {u.nombre} {u.apellido}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    disabled={esYo && u.activo}
                    onClick={() => {
                      if (u.activo) {
                        // Confirmación primero — ver el comentario en
                        // triggerRef, más arriba, sobre por qué el diálogo
                        // vive fuera de este menú.
                        setConfirmandoDesactivar(true);
                      } else {
                        accion(
                          () => cambiarActivo({ id: u.id, activo: true }),
                          "Usuario activado.",
                        );
                      }
                    }}
                  >
                    <div className="grid gap-0.5">
                      <span>{u.activo ? "Desactivar" : "Activar"}</span>
                      {/* La razón visible como texto secundario, no en un
                          `title` — un ítem deshabilitado dentro de un menú
                          no dispara el tooltip nativo de forma confiable
                          (no recibe foco/hover como un botón normal), así
                          que un `title` ahí quedaría escondido sin
                          explicación. */}
                      {esYo && u.activo && (
                        <span className="text-xs font-normal text-muted-foreground">
                          No puedes desactivar tu propia cuenta
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                  {/* pendienteInvitacion ya implica activo=true (ver su
                      definición, más arriba) — con la fila desactivada,
                      handle_new_user() (migración 20260918010000) rechaza
                      el alta igual, así que reenviar el correo sería
                      ofrecer una acción que ya no puede terminar bien
                      (mismo patrón que el <select> de rol, más arriba en
                      este mismo archivo). La Server Action también lo
                      rechaza, por si acaso (defensa en profundidad). */}
                  {pendienteInvitacion && (
                    <DropdownMenuItem
                      onClick={() =>
                        accion(
                          () => reenviarInvitacion({ id: u.id }),
                          "Invitación reenviada.",
                        )
                      }
                    >
                      Reenviar invitación
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
    {/* Hermano de <TableRow>, no anidado dentro del DropdownMenu de arriba
        — ver el comentario en triggerRef sobre por qué. Controlado por
        estado propio de esta fila, no por el menú. */}
    <Dialog
      open={confirmandoDesactivar}
      onOpenChange={(open) => {
        if (!open) cerrarConfirmacion();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿Desactivar a {u.nombre} {u.apellido}?
          </DialogTitle>
          <DialogDescription>
            No va a poder usar la app hasta que alguien reactive su cuenta.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={cerrarConfirmacion}
            disabled={guardado.pendiente}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmarDesactivar}
            disabled={guardado.pendiente}
          >
            <ContenidoBoton
              pendiente={guardado.pendiente}
              texto="Desactivar"
              textoPendiente="Desactivando…"
            />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/**
 * Celda "Tipos de inspección" — 5 formas visuales, a propósito distintas:
 *  - Administrador: texto gris apagado, sin etiquetas — no es una asignación
 *    suya, es consecuencia del rol. Si se viera igual que una asignación
 *    real, alguien intentaría "editarla".
 *  - Administrador de contrato: "No aplica" — no ejecuta inspecciones,
 *    asigna tipos a otros. NUNCA el badge rojo "Sin tipos" (esa es una
 *    alarma real de supervisor bloqueado, no corresponde acá).
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
    // Sin el paréntesis "(por ser administrador)": la columna Rol ya dice
    // "Administrador" en la misma fila — repetirlo acá solo ensanchaba la
    // celda más ancha de la tabla sin agregar información.
    return (
      <span className="text-xs text-muted-foreground">
        {resaltar("Todos", terminos)}
      </span>
    );
  }
  // administrador_contrato: el concepto "tipos permitidos" no aplica — no
  // ejecuta inspecciones, asigna tipos a otros. El badge rojo "Sin tipos"
  // de más abajo es una alarma real (supervisor bloqueado) que acá no
  // corresponde — mostrarla donde no aplica la desgasta.
  if (rol === "administrador_contrato") {
    return (
      <span className="text-xs text-muted-foreground">
        {resaltar("No aplica", terminos)}
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
