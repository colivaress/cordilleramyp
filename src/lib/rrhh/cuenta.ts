import { normalizarRut, rutValido } from "../rut.ts";
import { ORDEN_TIPOS_INSPECCION, type RolUsuario } from "../tipos.ts";
import type { Resultado } from "./parametros.ts";

/**
 * Sección "Cuenta y acceso" de la ficha (una sola ficha por persona). Lógica
 * pura: validación del formulario y, sobre todo, QUÉ CAMPOS puede cambiar
 * cada rol. Una pantalla no es un permiso: el administrador de contrato
 * edita los datos personales, pero el rol y los tipos de inspección son solo
 * del administrador. La base dice lo mismo (personal_insert, trigger
 * personal_rol_solo_admin, políticas pti_*).
 */

/** Roles que se pueden asignar desde la ficha. `conductor` no tiene login. */
export const ROLES_ASIGNABLES = [
  "supervisor",
  "administrador",
  "administrador_contrato",
  "trabajador",
] as const satisfies readonly RolUsuario[];

/**
 * Con qué rol puede CREAR una persona cada actor. El administrador de
 * contrato solo crea trabajadores: crear a alguien con un rol es asignarle
 * ese rol. Igual que el `with check` de personal_insert.
 */
export function rolesQuePuedeCrear(actor: RolUsuario): readonly RolUsuario[] {
  if (actor === "administrador") return ROLES_ASIGNABLES;
  if (actor === "administrador_contrato") return ["trabajador"];
  return [];
}

/**
 * ¿Puede el actor tocar la cuenta de esta persona? El adm. de contrato no
 * toca la fila de un administrador por ningún camino (RLS personal_update).
 */
export function puedeEditarCuentaDe(actor: RolUsuario, rolPersona: RolUsuario): boolean {
  if (actor === "administrador") return true;
  return actor === "administrador_contrato" && rolPersona !== "administrador";
}

/** "hace 12 h" / "hace 3 días" — antigüedad de una invitación pendiente
 *  (movida tal cual desde /usuarios). */
export function antiguedadDesde(fechaIso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(fechaIso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "hace menos de 1 h";
  if (horas < 48) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function puedeCambiarRol(actor: RolUsuario): boolean {
  return actor === "administrador";
}

export function puedeCambiarTiposInspeccion(actor: RolUsuario): boolean {
  return actor === "administrador";
}

/** Qué muestra la ficha en "Tipos de inspección" según el rol elegido. */
export type ModoTipos = "checkboxes" | "todos" | "no_aplica";
export function modoTiposInspeccion(rol: RolUsuario): ModoTipos {
  if (rol === "supervisor") return "checkboxes";
  if (rol === "administrador") return "todos";
  return "no_aplica";
}

export type FormularioCuenta = {
  nombre: string;
  apellido: string;
  rut: string;
  /** Solo al crear: es el vínculo con la cuenta de autenticación. */
  email: string;
  telefono: string;
  fechaNacimiento: string; // "YYYY-MM-DD"
  rol: string;
  /** Solo cuenta si el rol es supervisor. Vacío = suspendido (ver la ficha). */
  tiposInspeccion: string[];
};

export type CuentaValida = {
  nombre: string;
  apellido: string;
  rut: string | null;
  email: string;
  telefono: string | null;
  fecha_nacimiento: string;
  rol: RolUsuario;
  tiposInspeccion: string[];
};

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function leerCuenta(f: FormularioCuenta, opciones: { creando: boolean }): Resultado<CuentaValida> {
  const e: string[] = [];
  const nombre = f.nombre.trim();
  const apellido = f.apellido.trim();
  const email = f.email.trim().toLowerCase();
  const telefono = f.telefono.trim();
  if (!nombre) e.push("Falta el nombre.");
  if (!apellido) e.push("Falta el apellido.");
  if (opciones.creando && !CORREO.test(email)) e.push("Falta el correo o no es válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaNacimiento)) e.push("Falta la fecha de nacimiento.");

  // El RUT no bloquea crear la cuenta (se puede completar después), pero si
  // se escribe tiene que ser válido. Sí se exige antes del contrato.
  const rut = f.rut.trim() ? normalizarRut(f.rut) : null;
  if (rut && !rutValido(rut)) e.push("El RUT no es válido (revisa el dígito verificador).");

  const rol = f.rol as RolUsuario;
  if (!(ROLES_ASIGNABLES as readonly string[]).includes(rol)) e.push("Elige el rol.");
  // §2.10/§3.1: el teléfono es obligatorio para un supervisor (lo usa el
  // WhatsApp automático y el manual).
  if (rol === "supervisor" && !telefono) e.push("El teléfono es obligatorio para un supervisor.");

  const validos = new Set<string>(ORDEN_TIPOS_INSPECCION);
  const tipos = rol === "supervisor" ? [...new Set(f.tiposInspeccion)].filter((t) => validos.has(t)).sort() : [];

  if (e.length) return { ok: false, errores: e };
  return {
    ok: true,
    valor: {
      nombre,
      apellido,
      rut,
      email,
      telefono: telefono || null,
      fecha_nacimiento: f.fechaNacimiento,
      rol,
      tiposInspeccion: tipos,
    },
  };
}

function mismosTipos(a: readonly string[], b: readonly string[]): boolean {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

/**
 * Autorización POR CAMPO. Devuelve el motivo del rechazo, o `null` si el
 * actor puede guardar este cambio. Compara contra lo guardado, no contra lo
 * que el formulario dice que había: el navegador no es fuente de verdad.
 */
export function rechazoPorCampo(input: {
  actor: RolUsuario;
  creando: boolean;
  rolActual: RolUsuario | null;
  rolNuevo: RolUsuario;
  tiposActuales: readonly string[];
  tiposNuevos: readonly string[];
}): string | null {
  const { actor, creando, rolActual, rolNuevo, tiposActuales, tiposNuevos } = input;
  if (creando) {
    if (!rolesQuePuedeCrear(actor).includes(rolNuevo))
      return actor === "administrador_contrato"
        ? "Un administrador de contrato solo puede crear personas con rol Trabajador. El rol lo cambia un administrador."
        : "No tienes permiso para crear personas.";
  } else if (rolNuevo !== rolActual && !puedeCambiarRol(actor)) {
    return "Solo un administrador puede cambiar el rol de una persona.";
  }
  // Los tipos solo existen para un supervisor; con otro rol no se tocan.
  if (rolNuevo === "supervisor" && !mismosTipos(tiposActuales, tiposNuevos) && !puedeCambiarTiposInspeccion(actor))
    return "Solo un administrador puede cambiar los tipos de inspección.";
  return null;
}
