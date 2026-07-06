import { createClient } from "@supabase/supabase-js";

// =========================================================
//  lib/apiAuth.js
//  Verifica que el request a un API route venga de un
//  usuario autenticado con rol auxiliar o supervisor.
//
//  Uso en cada route:
//    const auth = await verificarAuth(request);
//    if (auth.error) return auth.error;
//    // auth.usuario tiene { id, nombre, rol }
//
//  El frontend debe enviar el header:
//    Authorization: Bearer <access_token>
// =========================================================

export async function verificarAuth(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return {
      error: Response.json(
        { ok: false, error: "Faltan variables de entorno del servidor." },
        { status: 500 }
      ),
    };
  }

  // 1. Leer el token del header Authorization.
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return {
      error: Response.json(
        { ok: false, error: "No autorizado. Inicia sesión e intenta de nuevo." },
        { status: 401 }
      ),
    };
  }

  // 2. Verificar el token con Supabase (usando service_role para leer el perfil).
  const sb = createClient(url, serviceKey);
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    return {
      error: Response.json(
        { ok: false, error: "Sesión inválida o expirada. Vuelve a iniciar sesión." },
        { status: 401 }
      ),
    };
  }

  // 3. Traer el perfil y verificar el rol.
  const { data: perfil } = await sb
    .from("profiles")
    .select("nombre, rol")
    .eq("id", user.id)
    .single();

  const rol = perfil?.rol || "consulta";

  if (rol === "consulta") {
    return {
      error: Response.json(
        { ok: false, error: "Tu rol es de consulta (solo lectura). No puedes ejecutar esta acción." },
        { status: 403 }
      ),
    };
  }

  // 4. Todo bien: devolver los datos del usuario.
  return {
    error: null,
    usuario: {
      id: user.id,
      nombre: perfil?.nombre || user.email,
      rol,
    },
    // Cliente Supabase con service_role listo para usar en el route.
    sb,
  };
}
