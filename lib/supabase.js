import { createClient } from "@supabase/supabase-js";

// Conexión con Supabase (tu base de datos y tus usuarios).
// Las dos claves se configuran en Vercel como variables de entorno.
// Así nunca quedan expuestas en GitHub.
//
// IMPORTANTE: si alguna variable falta, la app falla ruidosamente.
// Es preferible un error claro a una app que "funciona a medias"
// con credenciales fantasma y deja al usuario confundido.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
    "Configúralas en Vercel → Settings → Environment Variables."
  );
}

export const supabase = createClient(url, key);
