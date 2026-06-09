import { supabase } from "./supabase";

// Devuelve el perfil del usuario actual: { id, nombre, rol }.
export async function getPerfil() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.from("profiles").select("nombre, rol").eq("id", session.user.id).single();
  return {
    id: session.user.id,
    nombre: data?.nombre || session.user.email,
    rol: data?.rol || "consulta",
  };
}

// ¿El usuario solo puede leer? (rol consulta)
export function esSoloLectura(rol) {
  return rol === "consulta";
}
