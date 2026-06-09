import { supabase } from "./supabase";
import { getCargaActual } from "./cartera";
import { pesos } from "./format";

const MS_DIA = 86400000;

// Calcula todas las alertas activas según las 4 reglas del negocio.
export async function getAlertas() {
  const alertas = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const { carga, docs } = await getCargaActual();
  if (!carga) return [];

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

  // Regla 1 y 2: promesas de pago (acuerdos pendientes).
  const { data: acu } = await supabase.from("acuerdos_pago").select("*").eq("estado", "Pendiente");
  for (const a of acu || []) {
    const f = new Date(a.fecha_compromiso + "T00:00:00");
    const diff = Math.floor((hoy - f) / MS_DIA);
    const nombre = cli[a.cliente_nit]?.nombre || a.cliente_nit;
    if (diff === 0) {
      alertas.push({ tipo: "Promesa vence hoy", nivel: "alta", nit: a.cliente_nit, nombre, detalle: `Compromiso de ${pesos(a.valor_comprometido)} vence hoy` });
    } else if (diff > 3) {
      alertas.push({ tipo: "Promesa vencida", nivel: "critica", nit: a.cliente_nit, nombre, detalle: `Compromiso de ${pesos(a.valor_comprometido)} venció hace ${diff} días` });
    }
  }

  // Regla 3: cliente supera 90 días de mora.
  for (const c of Object.values(cli)) {
    if (c.dias > 90) {
      alertas.push({ tipo: "Mora +90 días", nivel: "critica", nit: c.nit, nombre: c.nombre, detalle: `${c.dias} días de mora · ${pesos(c.vencido)} vencido` });
    }
  }

  // Regla 4: cliente con cartera vencida y 15+ días sin gestión.
  for (const c of Object.values(cli)) {
    if (c.vencido > 0) {
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
