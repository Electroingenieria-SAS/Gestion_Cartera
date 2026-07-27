import { supabase } from "./supabase";
import { getCargaActual } from "./cartera";
import { pesos } from "./format";

const MS_DIA = 86400000;

// ¿La fecha cae dentro del día de HOY? (misma fecha calendario)
function esHoy(fecha) {
  if (!fecha) return false;
  const f = new Date(fecha);
  const h = new Date();
  return f.getFullYear() === h.getFullYear() &&
         f.getMonth() === h.getMonth() &&
         f.getDate() === h.getDate();
}

// Devuelve el set de NITs que YA fueron gestionados hoy (de forma individual).
// Las gestiones MASIVAS (circular en lote) NO cuentan: un envío masivo no es
// gestión efectiva, el cliente sigue necesitando gestión individual y debe
// permanecer en el Plan diario y en Alertas.
export async function getNitsGestionadosHoy() {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const { data: gest } = await supabase
    .from("gestiones")
    .select("cliente_nit, fecha, es_masiva")
    .gte("fecha", inicioHoy.toISOString());
  const set = new Set();
  for (const g of gest || []) {
    if (g.es_masiva) continue;            // la circular masiva no oculta
    if (esHoy(g.fecha)) set.add(String(g.cliente_nit));
  }
  return set;
}

// Devuelve el set de NITs con un compromiso a FUTURO todavía vigente.
// (acuerdo Pendiente cuya fecha aún no llega). Estos NO deben perseguirse:
// el cliente ya prometió y todavía está en plazo.
// OJO: un acuerdo que vence hoy o ya venció NO entra aquí -> sí debe aparecer.
export async function getNitsConCompromisoVigente() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const { data: acu } = await supabase
    .from("acuerdos_pago")
    .select("cliente_nit, fecha_compromiso")
    .eq("estado", "Pendiente");
  const set = new Set();
  for (const a of acu || []) {
    if (!a.fecha_compromiso) continue;
    const f = new Date(a.fecha_compromiso + "T00:00:00");
    if (f > hoy) set.add(String(a.cliente_nit)); // estrictamente futuro
  }
  return set;
}

// Calcula todas las alertas activas según las reglas del negocio,
// ocultando lo que ya se atendió hoy y los compromisos a futuro.
export async function getAlertas() {
  const alertas = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const { carga, docs } = await getCargaActual();
  if (!carga) return [];

  // Clientes que salen de la lista por hoy.
  const gestionadosHoy = await getNitsGestionadosHoy();
  const compromisoVigente = await getNitsConCompromisoVigente();
  // Un cliente se oculta si ya lo gestionó hoy O tiene compromiso a futuro.
  const ocultar = (nit) => gestionadosHoy.has(String(nit)) || compromisoVigente.has(String(nit));

  // Resumen por cliente (mora y vencido).
  const cli = {};
  for (const d of docs) {
    const k = d.nit;
    if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, dias: 0, vencido: 0 };
    cli[k].dias = Math.max(cli[k].dias, parseInt(d.dias_vencidos) || 0);
    if (d.categoria && d.categoria !== "Vigente") cli[k].vencido += Number(d.saldo) || 0;
  }

  // Última gestión por cliente.
  const { data: gest } = await supabase.from("gestiones").select("cliente_nit, fecha");
  const ultima = {};
  for (const g of gest || []) {
    if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) ultima[g.cliente_nit] = g.fecha;
  }

  // Promesas de pago. SOLO las que vencen hoy o ya vencieron:
  // un compromiso a futuro no genera alerta (el cliente ya prometió, dale plazo).
  const { data: acu } = await supabase.from("acuerdos_pago").select("*").eq("estado", "Pendiente");
  for (const a of acu || []) {
    // Si ya lo gestionó hoy, no lo molestamos aunque el compromiso venza.
    if (gestionadosHoy.has(String(a.cliente_nit))) continue;

    const f = new Date(a.fecha_compromiso + "T00:00:00");
    const diff = Math.floor((hoy - f) / MS_DIA); // >0 ya venció · 0 vence hoy · <0 falta
    const nombre = cli[a.cliente_nit]?.nombre || a.cliente_nit;
    const monto = pesos(a.valor_comprometido);

    if (diff === 0) {
      alertas.push({ tipo: "Promesa vence hoy", nivel: "critica", nit: a.cliente_nit, nombre, detalle: `Compromiso de ${monto} vence hoy` });
    } else if (diff >= 1 && diff <= 3) {
      alertas.push({ tipo: "Promesa vencida", nivel: "alta", nit: a.cliente_nit, nombre, detalle: `${monto} · venció hace ${diff} día${diff > 1 ? "s" : ""}` });
    } else if (diff > 3) {
      alertas.push({ tipo: "Promesa muy vencida", nivel: "critica", nit: a.cliente_nit, nombre, detalle: `${monto} · venció hace ${diff} días` });
    }
    // diff < 0 (compromiso a futuro): a propósito NO se genera alerta.
  }

  // Regla 3: cliente supera 90 días de mora.
  for (const c of Object.values(cli)) {
    if (c.dias > 90 && !ocultar(c.nit)) {
      alertas.push({ tipo: "Mora +90 días", nivel: "critica", nit: c.nit, nombre: c.nombre, detalle: `${c.dias} días de mora · ${pesos(c.vencido)} vencido` });
    }
  }

  // Regla 4: cliente con cartera vencida y 15+ días sin gestión.
  for (const c of Object.values(cli)) {
    if (c.vencido > 0 && !ocultar(c.nit)) {
      const dsg = ultima[c.nit] ? Math.floor((Date.now() - new Date(ultima[c.nit])) / MS_DIA) : 9999;
      if (dsg >= 15) {
        alertas.push({ tipo: "Sin gestión 15+ días", nivel: "media", nit: c.nit, nombre: c.nombre, detalle: ultima[c.nit] ? `Última gestión hace ${dsg} días` : "Nunca gestionado" });
      }
    }
  }

  const orden = { critica: 0, alta: 1, media: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return alertas;
}
