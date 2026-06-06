import { supabase } from "./supabase";

// Trae la carga más reciente (la cartera "actual") con TODOS sus documentos.
// Pagina de 1000 en 1000 para soportar archivos grandes.
export async function getCargaActual() {
  const { data: cargas } = await supabase
    .from("cargas")
    .select("*")
    .order("fecha_carga", { ascending: false })
    .limit(1);

  if (!cargas || cargas.length === 0) return { carga: null, docs: [] };
  const carga = cargas[0];

  const docs = [];
  const SIZE = 1000;
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("cartera_documentos")
      .select("*")
      .eq("carga_id", carga.id)
      .range(from, from + SIZE - 1);
    if (!data || data.length === 0) break;
    docs.push(...data);
    if (data.length < SIZE) break;
    from += SIZE;
  }
  return { carga, docs };
}

// Trae el histórico de todas las cargas (para la tendencia).
export async function getTendencia() {
  const { data } = await supabase
    .from("cargas")
    .select("fecha_carga, cartera_total, cartera_vencida")
    .order("fecha_carga", { ascending: true });
  return data || [];
}
