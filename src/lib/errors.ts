/** Map Supabase/Postgres errors to friendly Spanish copy. */
export function friendlyAuthError(message: string | undefined | null): string {
  if (!message) return "Error temporal, inténtalo de nuevo.";
  const m = message.toLowerCase();

  if (m.includes("email_address_invalid") || (m.includes("invalid") && m.includes("email"))) {
    return "Ese email no pasó el filtro de Supabase. Usa un usuario (sin @) o prueba otro.";
  }
  if (m.includes("already") && (m.includes("registered") || m.includes("exists") || m.includes("existe"))) {
    return "Ya existe una cuenta con ese usuario/email. Prueba a iniciar sesión.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirma el email o usa registro por usuario (sin email real).";
  }
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "Usuario/email o contraseña incorrectos.";
  }
  if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak") || m.includes("6") || m.includes("4"))) {
    return "La contraseña debe tener al menos 4 caracteres.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Sin conexión. Revisa internet e inténtalo de nuevo.";
  }

  if (message.length <= 160 && !m.includes("permission denied") && !m.includes("stack")) {
    return message;
  }

  return "Error temporal, inténtalo de nuevo.";
}

export function friendlyLeagueError(message: string | undefined | null): string {
  if (!message) return "No se pudo completar la acción. Inténtalo de nuevo.";
  const m = message.toLowerCase();

  if (m.includes("not authenticated") || m.includes("no autenticado")) {
    return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  }
  if (m.includes("not active") || m.includes("no está activa")) {
    return "Tu cuenta no está activa.";
  }
  if (m.includes("too short") || m.includes("name too short") || m.includes("demasiado corto")) {
    return "El nombre es demasiado corto.";
  }
  if (m.includes("ya tienes una liga") || m.includes("ese nombre")) {
    return "Ya tienes una liga activa con ese nombre.";
  }
  if (m.includes("invalid or expired") || m.includes("no válido") || m.includes("no valida")) {
    return "Código o enlace de invitación no válido.";
  }
  if (m.includes("not a league member") || m.includes("no eres miembro") || m.includes("solo miembros")) {
    return "No perteneces a esta liga.";
  }

  // Surface Spanish / short RPC messages (gamesplay feedback)
  if (
    message.length <= 180 &&
    !m.includes("permission denied") &&
    !m.includes("violates") &&
    !m.includes("stack") &&
    !m.includes("sqlstate")
  ) {
    return message;
  }

  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export function isSuperadminRole(role: string | null | undefined): boolean {
  return role === "superadmin" || role === "global_admin";
}

/** Normalize login for display; auth email comes from resolve_login_email RPC */
export function normalizeLoginToEmail(login: string): string {
  const v = login.trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;
  // Fallback only: prefer resolve_login_email RPC at sign-in
  return v;
}
