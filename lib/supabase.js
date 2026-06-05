import { createClient } from "@supabase/supabase-js";

// Conexión con Supabase (tu base de datos y tus usuarios).
// Las dos claves NO van escritas aquí: se configuran en Vercel como
// variables de entorno. Así nunca quedan expuestas en GitHub.
//
// Usamos valores de respaldo para que la app SIEMPRE compile, aunque las
// llaves todavía no estén configuradas. El login solo funcionará de verdad
// cuando las llaves reales estén puestas en Vercel.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, key);
