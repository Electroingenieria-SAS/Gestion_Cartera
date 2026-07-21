import reglas from "../business_rules/forecast_rules.json";

// =========================================================
//  lib/pronostico.js
//  PRONÓSTICO DE RECAUDO SEMANAL
//
//  El recaudo esperado se arma con TRES BOLSAS, cada una con
//  su propia tasa. Ninguna es una caja negra: cada peso del
//  pronóstico se puede rastrear hasta su origen.
//
//    Bolsa A — Compromisos pactados que vencen en la ventana
//              (la promesa explícita: mayor confianza)
//    Bolsa B — Facturas vigentes que vencen en la ventana
//              (el cliente al día que paga cerca de la fecha)
//    Bolsa C — Cartera ya vencida, por rango de mora
//              (lo que se recupera con gestión)
//
//  Las tasas salen de la realidad medida (v_tasas_recaudo)
//  cuando hay suficiente historia; mientras tanto, de los
//  supuestos en business_rules/forecast_rules.json.
// =========================================================

const MS_DIA = 86400000;

// ---------------------------------------------------------
// Siesa entrega las fechas como texto en varios formatos.
// Esta función los normaliza todos a un Date real.
//   "20260703"    -> 3 de julio de 2026
//   "2026-07-03"  -> 3 de julio de 2026
//   "03/07/2026"  -> 3 de julio de 2026
//   45841 (serial de Excel) -> su fecha equivalente
// ---------------------------------------------------------
export function parseFechaSiesa(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // AAAAMMDD
  if (/^\d{8}$/.test(s)) {
    const a = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(a, m - 1, d);
  }
  // AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [a, m, d] = s.slice(0, 10).split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  // DD/MM/AAAA
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, a] = s.split("/").map(Number);
    return new Date(a, m - 1, d);
  }
  // Serial de Excel (días desde 1899-12-30)
  if (/^\d{5}$/.test(s)) {
    return new Date(Date.UTC(1899, 11, 30) + Number(s) * MS_DIA);
  }

  const f = new Date(s);
  return isNaN(f) ? null : f;
}

// ---------------------------------------------------------
// Decide qué tasas usar: las MEDIDAS o los SUPUESTOS.
// Devuelve también el nivel de madurez, que la pantalla
// muestra al usuario para que sepa cuánto confiar.
// ---------------------------------------------------------
export function resolverTasas(tasasEmpiricas, cumplimiento) {
  const iniciales = reglas.tasas_iniciales;
  const minimo = reglas.periodos_minimos_para_empirico || 20;

  // ¿Cuántos periodos medidos hay en total?
  let periodosMedidos = 0;
  for (const k in tasasEmpiricas || {}) {
    periodosMedidos = Math.max(periodosMedidos, Number(tasasEmpiricas[k]?.periodos) || 0);
  }

  const usarEmpiricas = periodosMedidos >= minimo;
  const tasas = { ...iniciales };
  const origen = {};

  for (const cat in iniciales) {
    origen[cat] = "supuesto";
  }

  if (usarEmpiricas) {
    for (const cat in tasasEmpiricas) {
      const t = Number(tasasEmpiricas[cat]?.tasa_semanal);
      if (Number.isFinite(t) && t > 0) {
        tasas[cat] = t;
        origen[cat] = "medido";
      }
    }
  }

  // Bolsa A: la tasa de cumplimiento de acuerdos sí se puede medir
  // desde el primer acuerdo cerrado, no necesita 20 periodos.
  const cerrados = Number(cumplimiento?.cerrados) || 0;
  if (cerrados >= 5 && Number(cumplimiento?.tasa_cumplimiento) > 0) {
    tasas.acuerdos_pactados = Number(cumplimiento.tasa_cumplimiento);
    origen.acuerdos_pactados = "medido";
  }

  return {
    tasas,
    origen,
    periodosMedidos,
    acuerdosCerrados: cerrados,
    usarEmpiricas,
    madurez: usarEmpiricas ? "medido" : periodosMedidos >= minimo / 2 ? "parcial" : "inicial",
    banda: usarEmpiricas
      ? (reglas.banda_incertidumbre_con_historia ?? 0.15)
      : (reglas.banda_incertidumbre ?? 0.30),
  };
}

// ---------------------------------------------------------
// EL PRONÓSTICO
//
//   docs      -> documentos de la carga actual
//   acuerdos  -> acuerdos con estado "Pendiente"
//   config    -> resultado de resolverTasas()
//   dias      -> tamaño de la ventana (por defecto 7)
// ---------------------------------------------------------
export function calcularPronostico({ docs = [], acuerdos = [], config, dias = null }) {
  const ventana = dias || reglas.dias_ventana || 7;
  const { tasas, origen, banda } = config;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hasta = new Date(hoy);
  hasta.setDate(hasta.getDate() + ventana);

  // ── BOLSA A: compromisos pactados que caen en la ventana ──
  // Se incluyen también los ya vencidos que siguen pendientes:
  // son plata prometida que todavía no ha entrado.
  const acuerdosVentana = (acuerdos || []).filter((a) => {
    const f = a.fecha_compromiso ? new Date(a.fecha_compromiso + "T00:00:00") : null;
    return f && f <= hasta;
  });
  const baseAcuerdos = acuerdosVentana.reduce((s, a) => s + (Number(a.valor_comprometido) || 0), 0);
  const espAcuerdos = baseAcuerdos * (tasas.acuerdos_pactados || 0);

  // NITs con compromiso vigente: su cartera no se cuenta dos veces
  // en las bolsas B y C (si no, se infla el pronóstico).
  const nitsConAcuerdo = new Set(acuerdosVentana.map((a) => String(a.cliente_nit)));

  // ── BOLSA B: facturas VIGENTES que vencen dentro de la ventana ──
  let basePorVencer = 0;
  let docsPorVencer = 0;

  // ── BOLSA C: cartera ya VENCIDA, agrupada por rango ──
  const rangos = {};
  let baseVencida = 0;

  // Lo que queda fuera del alcance de esta semana
  let baseVigenteLejana = 0;
  let baseExcluidaPorAcuerdo = 0;

  for (const d of docs) {
    const saldo = Number(d.saldo) || 0;
    if (saldo <= 0) continue;

    if (nitsConAcuerdo.has(String(d.nit))) {
      baseExcluidaPorAcuerdo += saldo;
      continue; // ya está representado en la Bolsa A
    }

    const cat = d.categoria || "Sin categoría";

    if (cat === "Vigente") {
      const fv = parseFechaSiesa(d.fecha_vencimiento);
      if (fv && fv >= hoy && fv <= hasta) {
        basePorVencer += saldo;
        docsPorVencer += 1;
      } else {
        baseVigenteLejana += saldo;
      }
    } else {
      if (!rangos[cat]) rangos[cat] = { categoria: cat, base: 0, docs: 0, tasa: tasas[cat] || 0, esperado: 0 };
      rangos[cat].base += saldo;
      rangos[cat].docs += 1;
      baseVencida += saldo;
    }
  }

  const espPorVencer = basePorVencer * (tasas.por_vencer || 0);

  let espVencida = 0;
  for (const k in rangos) {
    rangos[k].esperado = rangos[k].base * (rangos[k].tasa || 0);
    espVencida += rangos[k].esperado;
  }

  const esperado = espAcuerdos + espPorVencer + espVencida;

  const bolsas = [
    {
      id: "acuerdos",
      titulo: "Compromisos pactados",
      descripcion: `${acuerdosVentana.length} acuerdo${acuerdosVentana.length === 1 ? "" : "s"} de pago con fecha dentro de la ventana`,
      base: baseAcuerdos,
      tasa: tasas.acuerdos_pactados || 0,
      esperado: espAcuerdos,
      origen: origen.acuerdos_pactados,
      color: "#15a36b",
    },
    {
      id: "porvencer",
      titulo: "Facturas por vencer",
      descripcion: `${docsPorVencer} factura${docsPorVencer === 1 ? "" : "s"} vigente${docsPorVencer === 1 ? "" : "s"} que vencen en los próximos ${ventana} días`,
      base: basePorVencer,
      tasa: tasas.por_vencer || 0,
      esperado: espPorVencer,
      origen: origen.por_vencer,
      color: "#00378a",
    },
    {
      id: "vencida",
      titulo: "Cartera vencida en gestión",
      descripcion: "Recuperación esperada por rango de mora",
      base: baseVencida,
      tasa: baseVencida > 0 ? espVencida / baseVencida : 0,
      esperado: espVencida,
      origen: "mixto",
      color: "#d9a400",
      detalle: Object.values(rangos).sort((a, b) => b.base - a.base),
    },
  ];

  return {
    ventana,
    desde: hoy,
    hasta,
    bolsas,
    esperado,
    minimo: esperado * (1 - banda),
    maximo: esperado * (1 + banda),
    banda,
    contexto: {
      baseVigenteLejana,
      baseExcluidaPorAcuerdo,
      acuerdosVentana,
    },
  };
}

export const reglasPronostico = reglas;
