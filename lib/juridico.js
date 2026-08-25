import { supabase } from "./supabase";
import { getCargaActual } from "./cartera";

// =========================================================
//  lib/juridico.js
//  COBRO JURÍDICO — traslado de clientes a cobranza jurídica.
//
//  Regla de negocio: un cliente en cobro jurídico SALE del plan diario
//  y de las alertas de la auxiliar, y pasa a la bandeja del rol 'juridico'.
//
//  Enviar y devolver son operaciones TRANSACCIONALES en la base de datos
//  (funciones RPC enviar_a_juridico / devolver_de_juridico). El navegador
//  solo sube los soportes a Storage y llama a la función; la función marca
//  el cliente, registra el evento e inserta los soportes en una sola
//  transacción, validando el rol del usuario.
// =========================================================

const BUCKET = "gestiones-adjuntos";

// --- Reglas para los soportes del envío a jurídico ---
export const JURIDICO_MAX_ARCHIVOS = 15;
export const JURIDICO_MAX_MB = 10;
export const JURIDICO_EXT_OK = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx"];

// Valida un conjunto de archivos contra las reglas. Devuelve { ok, error }.
// El mínimo de 1 archivo también se exige en la base de datos.
export function validarSoportesJuridicos(archivos) {
  const lista = Array.from(archivos || []);
  if (lista.length < 1) return { ok: false, error: "Debes adjuntar al menos un soporte." };
  if (lista.length > JURIDICO_MAX_ARCHIVOS) {
    return { ok: false, error: `Máximo ${JURIDICO_MAX_ARCHIVOS} archivos por envío.` };
  }
  for (const f of lista) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!JURIDICO_EXT_OK.includes(ext)) {
      return { ok: false, error: `Tipo no permitido: "${f.name}". Solo ${JURIDICO_EXT_OK.join(", ")}.` };
    }
    if (f.size > JURIDICO_MAX_MB * 1024 * 1024) {
      return { ok: false, error: `"${f.name}" supera ${JURIDICO_MAX_MB} MB.` };
    }
  }
  return { ok: true, error: null };
}

// Set con los NITs que están AHORA MISMO en cobro jurídico.
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

// Soportes del cliente, agrupados por evento (historial_id -> [adjuntos]).
export async function getAdjuntosJuridico(nit) {
  const { data } = await supabase
    .from("juridico_adjuntos")
    .select("*")
    .eq("cliente_nit", nit)
    .order("creado_en", { ascending: true });
  const mapa = {};
  for (const a of data || []) {
    (mapa[a.historial_id] ||= []).push(a);
  }
  return mapa;
}

// Enlace firmado (1 h) para descargar un soporte del bucket privado.
export async function urlFirmadaSoporte(ruta) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600);
  return data?.signedUrl || null;
}

// Enviar un cliente a cobro jurídico con sus soportes obligatorios.
//   archivos: FileList o array de File (mínimo 1).
// Sube TODOS los archivos primero; si alguno falla, no marca el cliente
// (la RPC no llega a ejecutarse). Devuelve el id del evento registrado.
export async function enviarAJuridico({ nit, motivo, archivos }) {
  const val = validarSoportesJuridicos(archivos);
  if (!val.ok) throw new Error(val.error);
  const lista = Array.from(archivos);

  // 1. Subir cada soporte al bucket, dentro de la carpeta del cliente.
  const adjuntos = [];
  for (const f of lista) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ruta = `${nit}/juridico_${Date.now()}_${safe}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, f, { contentType: f.type || "application/octet-stream" });
    if (error) throw new Error(`No se pudo subir "${f.name}": ${error.message}`);
    adjuntos.push({ ruta, nombre: f.name, tipo: f.type || null, tamano: f.size });
  }

  // 2. Registrar el traslado de forma transaccional (marca + evento + soportes).
  const { data, error } = await supabase.rpc("enviar_a_juridico", {
    p_nit: nit,
    p_motivo: motivo || null,
    p_adjuntos: adjuntos,
  });
  if (error) throw error;
  return data;
}

// Devolver un cliente de jurídico a gestión normal (transaccional).
export async function devolverDeJuridico({ nit, motivo }) {
  const { error } = await supabase.rpc("devolver_de_juridico", {
    p_nit: nit,
    p_motivo: motivo || null,
  });
  if (error) throw error;
}

// Bandeja del rol jurídico: los clientes en cobro jurídico, con su cartera
// de la carga actual, la última gestión, la fecha en que entraron a jurídico
// y el motivo con que se enviaron.
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

  // Fecha y motivo del último envío a jurídico.
  const { data: hist } = await supabase
    .from("juridico_historial")
    .select("cliente_nit, motivo, creado_en")
    .eq("accion", "Enviado")
    .in("cliente_nit", nits)
    .order("creado_en", { ascending: false });
  const envio = {};
  const motivoEnvio = {};
  for (const h of hist || []) {
    if (!envio[h.cliente_nit]) {
      envio[h.cliente_nit] = h.creado_en;
      motivoEnvio[h.cliente_nit] = h.motivo || null;
    }
  }

  return Object.values(cli)
    .map((c) => ({
      ...c,
      ultima: ultima[c.nit] || null,
      fechaEnvio: envio[c.nit] || null,
      motivoEnvio: motivoEnvio[c.nit] || null,
    }))
    .sort((a, b) => b.vencido - a.vencido);
}
