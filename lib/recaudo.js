import { supabase } from "./supabase";

// =========================================================
//  lib/recaudo.js
//  Acceso al histórico de RECAUDO REAL MEDIDO.
//
//  Los números de aquí no son estimaciones: salen de comparar
//  la carga de un día contra la del día anterior, documento
//  por documento. Si un saldo bajó, esa plata entró.
//
//  Toda la matemática vive en Postgres (07_recaudo_medicion.sql).
//  Este archivo solo lee los resultados.
// =========================================================

// Trae todos los periodos medidos, del más reciente al más viejo.
export async function getPeriodos(limite = 60) {
  const { data } = await supabase
    .from("recaudo_periodos")
    .select("*")
    .order("fecha_hasta", { ascending: false })
    .limit(limite);
  return data || [];
}

// Tasas de recuperación MEDIDAS por rango de mora, normalizadas a 7 días.
// Devuelve un objeto: { "Vencido 1 a 30": { tasa_semanal, periodos, ... }, ... }
export async function getTasasEmpiricas() {
  const { data } = await supabase.from("v_tasas_recaudo").select("*");
  const mapa = {};
  for (const t of data || []) mapa[t.categoria] = t;
  return mapa;
}

// Tasa de cumplimiento REAL de los acuerdos de pago (Bolsa A).
export async function getCumplimientoAcuerdos() {
  const { data } = await supabase.from("v_cumplimiento_acuerdos").select("*").single();
  return data || null;
}

// Manda recalcular el periodo más reciente. Se llama después de cada carga.
export async function calcularRecaudoUltimo() {
  const { data, error } = await supabase.rpc("fn_calcular_recaudo_ultimo");
  if (error) throw error;
  return data;
}

// Recalcula TODO el histórico. Botón manual, por si se borró una carga.
export async function recalcularHistorico() {
  const { data, error } = await supabase.rpc("fn_recalcular_recaudo_historico");
  if (error) throw error;
  return data;
}

// =========================================================
//  Agrupación de periodos en SEMANAS calendario
//  (los periodos son día a día; los directivos piensan en semanas)
// =========================================================

// Lunes de la semana a la que pertenece una fecha.
export function inicioSemana(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay();              // 0 = domingo
  const resta = dia === 0 ? 6 : dia - 1; // queremos que la semana arranque el lunes
  d.setDate(d.getDate() - resta);
  return d;
}

export function etiquetaSemana(inicio) {
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  const f = (x) => x.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${f(inicio)} – ${f(fin)}`;
}

// Suma el recaudo medido por semana calendario.
export function agruparPorSemana(periodos) {
  const mapa = {};
  for (const p of periodos) {
    if (!p.fecha_hasta) continue;
    const ini = inicioSemana(p.fecha_hasta);
    const k = ini.toISOString().slice(0, 10);
    if (!mapa[k]) {
      mapa[k] = {
        clave: k,
        inicio: ini,
        etiqueta: etiquetaSemana(ini),
        recaudo: 0,
        facturacion: 0,
        periodos: 0,
        dias: 0,
      };
    }
    mapa[k].recaudo += Number(p.recaudo_total) || 0;
    mapa[k].facturacion += Number(p.facturacion_nueva) || 0;
    mapa[k].dias += Number(p.dias) || 0;
    mapa[k].periodos += 1;
  }
  return Object.values(mapa).sort((a, b) => a.inicio - b.inicio);
}
