/**
 * §8.1: la pantalla de login (y el flujo de recuperación de clave) nunca deben
 * mostrarle al usuario el texto crudo de una excepción — sobre todo el
 * "Failed to fetch" que devuelve el navegador cuando la petición no llega a
 * completarse. Todo error se envuelve acá en un mensaje propio en español.
 *
 * El detalle técnico original conviene dejarlo en `console.error` para depurar,
 * pero no en pantalla.
 *
 * `intentosFallidos` (opcional, default 0): cantidad de intentos de login
 * fallidos ya ocurridos en esta pantalla, ANTES del error que se está
 * mensajeando ahora. Existe porque un error de red y un throttling de
 * Supabase Auth son indistinguibles por el texto del error: cuando Supabase
 * empieza a rechazar por rate limit, la respuesta vuelve sin cabecera
 * Access-Control-Allow-Origin, el navegador la bloquea por CORS antes de que
 * el código la vea, y supabase-js termina lanzando el mismo
 * `AuthRetryableFetchError: Failed to fetch` que un corte de conexión real.
 * La única señal disponible para distinguirlos es el contexto: si ya hubo un
 * fallo previo en esta misma pantalla (típicamente una contraseña mal
 * tecleada), lo más probable es throttling, no que internet se haya cortado
 * justo entre dos clics. Quien llama a esta función y no pasa el segundo
 * parámetro (el flujo de recuperación de clave) se comporta exactamente
 * igual que antes.
 */
export function mensajeErrorAuth(
  error: unknown,
  opts?: { intentosFallidos?: number },
): string {
  const intentosFallidos = opts?.intentosFallidos ?? 0;
  const name =
    error instanceof Error
      ? error.name
      : ((error as { name?: string } | null)?.name ?? "");
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string } | null)?.message ?? "";
  const m = raw.toLowerCase();

  // Error de red / conexión: "Failed to fetch", "fetch failed", "network",
  // "load failed" (Safari), timeouts, etc. `AuthRetryableFetchError` (el name
  // que usa supabase-js para esta familia de errores) es más confiable que el
  // string matching de abajo, que se mantiene como respaldo.
  if (
    name === "AuthRetryableFetchError" ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("network error") ||
    m.includes("load failed") ||
    m.includes("err_") ||
    m.includes("timeout") ||
    m.includes("timed out")
  ) {
    if (intentosFallidos >= 1) {
      return "No se pudo completar el ingreso. Si escribiste mal la contraseña, espera un minuto antes de volver a intentar; si el problema sigue, revisa tu conexión a internet.";
    }
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
