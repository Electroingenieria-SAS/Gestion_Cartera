import { createClient } from "@supabase/supabase-js";

// Conexión con Supabase (tu base de datos y tus usuarios).
// Las dos claves NO van escritas aquí: se configuran en Vercel como
// variables de entorno. Así nunca quedan expuestas en GitHub.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
