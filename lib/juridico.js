import { supabase } from "./supabase";
import { getCargaActual } from "./cartera";

// =========================================================
//  lib/juridico.js
//  COBRO JURÍDICO — traslado manual de clientes a cobranza jurídica.
//
//  Regla de negocio: un cliente en cobro jurídico SALE del plan diario
//  y de las alertas de la auxiliar, y pasa a la bandeja del rol 'juridico'.
//  Todo movimiento (envío / devolución) queda en juridico_historial.
// =========================================================

// Set con los NITs que están AHORA MISMO en cobro jurídico.
// Se usa para sacarlos del plan diario y de las alertas de cartera.
export async function getNitsEnJuridico() {
  const { data } = await supabase
    .from("clientes")
    .select("nit")
    .eq("cobro_juridico", true);
  const set = new Set();
  for (const c of data || []) set.add(String(c.nit));
  return set;
}

// ¿Un cliente puntual está en cobro jurídico?
export async function getEstadoJuridico(nit) {
  const { data } = await supabase
    .from("clientes")
    .select("cobro_juridico")
    .eq("nit", nit)
    .single();
  return data?.cobro_juridico || false;
}

// Historial jurídico de un cliente (del más reciente al más viejo).
export async function getHistorialJuridico(nit) {
  const { data } = await supabase
    .from("juridico_historial")
    .select("*")
    .eq("cliente_nit", nit)
    .order("creado_en", { ascending: false });
  return data || [];
}

// Enviar un cliente a cobro jurídico. Deja registro en el historial.
export async function enviarAJuridico({ nit, motivo, usuario }) {
  const { error: e1 } = await supabase
    .from("clientes")
    .update({ cobro_juridico: true })
    .eq("nit", nit);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("juridico_historial").insert({
    cliente_nit: nit,
    accion: "Enviado",
    motivo: motivo?.trim() || null,
    usuario_id: usuario?.id || null,
    usuario_nombre: usuario?.nombre || null,
  });
  if (e2) throw e2;
}

// Devolver un cliente de jurídico a gestión normal. También deja registro.
export async function devolverDeJuridico({ nit, motivo, usuario }) {
  const { error: e1 } = await supabase
    .from("clientes")
    .update({ cobro_juridico: false })
    .eq("nit", nit);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("juridico_historial").insert({
    cliente_nit: nit,
    accion: "Devuelto",
    motivo: motivo?.trim() || null,
    usuario_id: usuario?.id || null,
    usuario_nombre: usuario?.nombre || null,
  });
  if (e2) throw e2;
}

// Bandeja del rol jurídico: los clientes en cobro jurídico, con su cartera
// de la carga actual, la última gestión y la fecha en que entraron a jurídico.
export async function getBandejaJuridica() {
  const enJuridico = await getNitsEnJuridico();
  if (enJuridico.size === 0) return [];

  const { carga, docs } = await getCargaActual();
  if (!carga) return [];

  const cli = {};
  for (const d of docs) {
    if (!enJuridico.has(String(d.nit))) continue;
    const k = d.nit;
    if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0, dias: 0 };
    const c = cli[k];
    const s = Number(d.saldo) || 0;
    c.total += s;
    if (d.categoria && d.categoria !== "Vigente") c.vencido += s;
    c.dias = Math.max(c.dias, parseInt(d.dias_vencidos) || 0);
  }

  const nits = Object.keys(cli);
  if (nits.length === 0) return [];

  // Última gestión por cliente.
  const { data: gest } = await supabase
    .from("gestiones")
    .select("cliente_nit, fecha")
    .in("cliente_nit", nits);
  const ultima = {};
  for (const g of gest || []) {
    if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) ultima[g.cliente_nit] = g.fecha;
  }

  // Fecha del último envío a jurídico.
  const { data: hist } = await supabase
    .from("juridico_historial")
    .select("cliente_nit, creado_en")
    .eq("accion", "Enviado")
    .in("cliente_nit", nits)
    .order("creado_en", { ascending: false });
  const envio = {};
  for (const h of hist || []) if (!envio[h.cliente_nit]) envio[h.cliente_nit] = h.creado_en;

  return Object.values(cli)
    .map((c) => ({ ...c, ultima: ultima[c.nit] || null, fechaEnvio: envio[c.nit] || null }))
    .sort((a, b) => b.vencido - a.vencido);
}
