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

// Resumen financiero de UN cliente en la carga actual.
export async function getResumenCliente(nit) {
  const { data: cargas } = await supabase
    .from("cargas").select("id").order("fecha_carga", { ascending: false }).limit(1);
  if (!cargas || cargas.length === 0) return null;

  const { data: docs } = await supabase
    .from("cartera_documentos")
    .select("saldo, categoria, dias_vencidos, nombre_cliente, ciudad, vendedor, tipo_docto, numero_docto, fecha_docto, fecha_vencimiento")
    .eq("carga_id", cargas[0].id)
    .eq("nit", nit);

  const lista = docs || [];
  let saldo = 0, vencida = 0, dias = 0;
  for (const d of lista) {
    const s = Number(d.saldo) || 0;
    saldo += s;
    if (d.categoria && d.categoria !== "Vigente") vencida += s;
    dias = Math.max(dias, parseInt(d.dias_vencidos) || 0);
  }
  const base = lista[0] || {};

  // Detalle de cada factura, ordenado de mayor a menor saldo.
  const facturas = lista
    .map((d) => ({
      tipo: d.tipo_docto || "",
      numero: d.numero_docto || "",
      fecha_docto: d.fecha_docto || null,
      fecha_vencimiento: d.fecha_vencimiento || null,
      dias: parseInt(d.dias_vencidos) || 0,
      categoria: d.categoria || "Sin categoría",
      saldo: Number(d.saldo) || 0,
    }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    nombre: base.nombre_cliente || null,
    ciudad: base.ciudad || null,
    vendedor: base.vendedor || null,
    saldo, vencida, vigente: saldo - vencida, dias,
    documentos: lista.length,
    facturas,
  };
}
