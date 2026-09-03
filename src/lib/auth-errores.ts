/**
 * §8.1: la pantalla de login (y el flujo de recuperación de clave) nunca deben
 * mostrarle al usuario el texto crudo de una excepción — sobre todo el
 * "Failed to fetch" que devuelve el navegador cuando la petición no llega a
 * completarse. Todo error se envuelve acá en un mensaje propio en español.
 *
 * El detalle técnico original conviene dejarlo en `console.error` para depurar,
 * pero no en pantalla.
 */
export function mensajeErrorAuth(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string } | null)?.message ?? "";
  const m = raw.toLowerCase();

  // Error de red / conexión: "Failed to fetch", "fetch failed", "network",
  // "load failed" (Safari), timeouts, etc.
  if (
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("network error") ||
    m.includes("load failed") ||
    m.includes("err_") ||
    m.includes("timeout") ||
    m.includes("timed out")
  ) {
    return "No se pudo conectar. Revisa tu conexión a internet e intenta de nuevo.";
  }

  // Credenciales inválidas.
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid_credentials") ||
    m.includes("invalid email or password")
  ) {
    return "Correo o contraseña incorrectos.";
  }

  // Correo aún no confirmado.
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.";
  }

  // Demasiados intentos.
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("429")) {
    return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  }

  // Cuenta no autorizada (trigger handle_new_user, §2.10).
  if (m.includes("no está autorizada") || m.includes("not authorized") || m.includes("database error")) {
    return "Tu cuenta no está autorizada. Contacta a un administrador de Cordillera M&P.";
  }

  return "Ocurrió un error al iniciar sesión. Intenta de nuevo.";
}

/** Mensajes que llegan como `?error=` desde el middleware / `getSesion()`. */
export function mensajeErrorParam(param: string | null): string | null {
  switch (param) {
    case "perfil_no_encontrado":
      return "El usuario no tiene un perfil asociado. Contacta a un administrador de Cordillera M&P.";
    case "error_perfil":
      return "Ocurrió un error al cargar tu perfil. Intenta de nuevo.";
    case "cuenta_desactivada":
      return "Tu cuenta está desactivada. Contacta a un administrador de Cordillera M&P.";
    case "sesion_expirada":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    case "auth_callback":
    case "enlace_invalido":
      return "El enlace no es válido o expiró. Solicita uno nuevo.";
    default:
      return null;
  }
}
