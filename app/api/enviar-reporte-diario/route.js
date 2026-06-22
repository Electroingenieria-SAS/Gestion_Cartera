import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// =========================================================
//  /api/enviar-reporte-diario
//  Envía un correo EJECUTIVO con el resumen del día a:
//    - Gerente de Suministros + Director Financiero (TO)
//    - Auxiliar de cartera (CC)
//
//  El correo incluye:
//    - KPIs principales
//    - Distribución por rangos de mora
//    - Top 10 clientes con más vencido
//    - Alertas críticas activas
//    - Comparativo con la carga anterior (si existe)
// =========================================================
export const dynamic = "force-dynamic";

const MS_DIA = 86400000;
const fmt = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");
const fmtM = (v) => "$" + Math.round((Number(v) || 0) / 1e6).toLocaleString("es-CO") + " M";
const pctTxt = (v) => (Number(v) || 0).toFixed(1).replace(".", ",") + "%";

const COL_CAT = {
  "Vigente": "#15a36b",
  "Vencido 1 a 30": "#ddbc00",
  "Vencido 31 a 60": "#e8930c",
  "Vencido 61 a 90": "#e2632b",
  "Vencido 91 >": "#d23b3b",
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const destinatariosStr = process.env.CORREO_DIRECTIVOS;
  const auxiliar = process.env.CORREO_AUXILIAR;

  if (!url || !serviceKey || !smtpUser || !smtpPass || !destinatariosStr) {
    return Response.json(
      { ok: false, error: "Faltan variables de entorno. Revisa en Vercel: SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASS y CORREO_DIRECTIVOS." },
      { status: 500 }
    );
  }

  // CORREO_DIRECTIVOS puede tener varios separados por coma
  const destinatarios = destinatariosStr.split(",").map((s) => s.trim()).filter(Boolean);

  const sb = createClient(url, serviceKey);

  // --- 1. Cargas: última y anterior (para comparativo) ---
  const { data: cargas } = await sb
    .from("cargas")
    .select("id, fecha_carga, nombre_archivo, cartera_total, cartera_vigente, cartera_vencida, pct_vencida, clientes_totales, clientes_mora, clientes_riesgo, total_documentos")
    .order("fecha_carga", { ascending: false })
    .limit(2);

  if (!cargas || cargas.length === 0) {
    return Response.json({ ok: false, error: "No hay cartera cargada todavía." }, { status: 400 });
  }
  const carga = cargas[0];
  const cargaPrev = cargas[1] || null;

  // --- 2. Documentos de la carga actual ---
  const docs = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from("cartera_documentos")
      .select("nit, nombre_cliente, ciudad, vendedor, saldo, categoria, dias_vencidos")
      .eq("carga_id", carga.id)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    docs.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // --- 3. Distribución por categoría ---
  const ordenCat = ["Vigente", "Vencido 1 a 30", "Vencido 31 a 60", "Vencido 61 a 90", "Vencido 91 >"];
  const dist = {};
  for (const k of ordenCat) dist[k] = { valor: 0, facturas: 0 };
  for (const d of docs) {
    const k = d.categoria || "Vigente";
    if (!dist[k]) dist[k] = { valor: 0, facturas: 0 };
    dist[k].valor += Number(d.saldo) || 0;
    dist[k].facturas += 1;
  }

  // --- 4. Top 10 clientes vencidos ---
  const cli = {};
  for (const d of docs) {
    if (d.categoria === "Vigente") continue;
    const k = d.nit;
    if (!cli[k]) {
      cli[k] = {
        nit: k,
        nombre: d.nombre_cliente || k,
        ciudad: d.ciudad || "—",
        vendedor: d.vendedor || "—",
        vencido: 0,
        facturas: 0,
        dias: 0,
        peorCat: "Vigente",
      };
    }
    cli[k].vencido += Number(d.saldo) || 0;
    cli[k].facturas += 1;
    if ((parseInt(d.dias_vencidos) || 0) > cli[k].dias) {
      cli[k].dias = parseInt(d.dias_vencidos) || 0;
      cli[k].peorCat = d.categoria;
    }
  }
  const top10 = Object.values(cli).sort((a, b) => b.vencido - a.vencido).slice(0, 10);

  // --- 5. Alertas críticas (promesas vencidas + mora +90) ---
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const alertasCriticas = [];

  const { data: acu } = await sb.from("acuerdos_pago").select("*").eq("estado", "Pendiente");
  for (const a of acu || []) {
    const f = new Date(a.fecha_compromiso + "T00:00:00");
    const diff = Math.floor((hoy - f) / MS_DIA);
    const nombre = cli[a.cliente_nit]?.nombre || a.cliente_nit;
    const monto = fmt(a.valor_comprometido);
    if (diff === 0) alertasCriticas.push({ tipo: "Promesa vence hoy", nombre, detalle: monto });
    else if (diff > 3) alertasCriticas.push({ tipo: "Promesa muy vencida", nombre, detalle: `${monto} · venció hace ${diff} días` });
  }
  for (const c of Object.values(cli)) {
    if (c.dias > 90) alertasCriticas.push({ tipo: "Mora +90 días", nombre: c.nombre, detalle: `${c.dias} días · ${fmt(c.vencido)} vencido` });
  }
  alertasCriticas.sort((a, b) => a.tipo.localeCompare(b.tipo));

  // --- 6. Comparativo con carga anterior ---
  const delta = (actual, prev) => {
    if (prev == null || prev === 0) return null;
    return ((actual - prev) / prev) * 100;
  };
  const deltaVencida = cargaPrev ? delta(Number(carga.cartera_vencida), Number(cargaPrev.cartera_vencida)) : null;
  const deltaPctVencida = cargaPrev ? Number(carga.pct_vencida) - Number(cargaPrev.pct_vencida) : null;

  const tendenciaHtml = (v) => {
    if (v == null) return "";
    if (v > 0) return `<span style="color:#d23b3b;font-size:12px;font-weight:600"> ▲ ${v.toFixed(1).replace(".", ",")}%</span>`;
    if (v < 0) return `<span style="color:#15a36b;font-size:12px;font-weight:600"> ▼ ${Math.abs(v).toFixed(1).replace(".", ",")}%</span>`;
    return `<span style="color:#5b6b86;font-size:12px"> = sin cambio</span>`;
  };

  // --- 7. HTML del correo ---
  const fechaTxt = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fechaCarga = new Date(carga.fecha_carga).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });

  const totalDist = Object.values(dist).reduce((s, x) => s + x.valor, 0) || 1;
  const distRows = ordenCat.map((k) => {
    const pctVal = (dist[k].valor / totalDist) * 100;
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px">
          <span style="display:inline-block;width:10px;height:10px;background:${COL_CAT[k]};border-radius:50%;margin-right:8px"></span>
          ${k}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:right;color:#5b6b86">${dist[k].facturas}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:right;font-weight:600">${fmtM(dist[k].valor)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:right;color:#5b6b86">${pctTxt(pctVal)}</td>
      </tr>`;
  }).join("");

  const top10Rows = top10.map((c, i) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:12px;color:#5b6b86">${i + 1}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:13px">
        <b>${c.nombre}</b><br>
        <span style="color:#5b6b86;font-size:11px">${c.ciudad} · ${c.vendedor}</span>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:center">${c.facturas}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:center">
        <span style="background:${(COL_CAT[c.peorCat] || "#888")}22;color:${COL_CAT[c.peorCat] || "#555"};padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600">${c.dias}d</span>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:13px;text-align:right;font-weight:700;color:#d23b3b">${fmt(c.vencido)}</td>
    </tr>`).join("");

  const alertasRows = alertasCriticas.slice(0, 15).map((a) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;font-size:12px;color:#d23b3b;font-weight:600">${a.tipo}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;font-size:13px"><b>${a.nombre}</b></td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:#5b6b86">${a.detalle}</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #e3e9f4;border-radius:12px;overflow:hidden;background:#fff">
    <!-- HEADER -->
    <div style="background:#00378a;color:#fff;padding:24px 28px">
      <p style="margin:0;color:#cfe0ff;font-size:12px;letter-spacing:1px;text-transform:uppercase">Reporte diario de cartera</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700">Electroingeniería S.A.S.</h1>
      <p style="margin:6px 0 0;color:#cfe0ff;font-size:13px">${fechaTxt}</p>
    </div>

    <!-- KPIs -->
    <div style="padding:24px 28px 8px;background:#fff">
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0">
        <tr>
          <td style="background:#f3f6fb;border-radius:10px;padding:14px;width:25%;vertical-align:top">
            <p style="margin:0;color:#5b6b86;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Cartera total</p>
            <p style="margin:6px 0 0;color:#0f1b33;font-size:18px;font-weight:700">${fmtM(carga.cartera_total)}</p>
          </td>
          <td style="background:#fff5f5;border-radius:10px;padding:14px;width:25%;vertical-align:top">
            <p style="margin:0;color:#5b6b86;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Cartera vencida</p>
            <p style="margin:6px 0 0;color:#d23b3b;font-size:18px;font-weight:700">${fmtM(carga.cartera_vencida)}${tendenciaHtml(deltaVencida)}</p>
          </td>
          <td style="background:#fff5f5;border-radius:10px;padding:14px;width:25%;vertical-align:top">
            <p style="margin:0;color:#5b6b86;font-size:11px;text-transform:uppercase;letter-spacing:.5px">% vencida</p>
            <p style="margin:6px 0 0;color:#d23b3b;font-size:18px;font-weight:700">${pctTxt(carga.pct_vencida)}${deltaPctVencida != null ? `<span style="color:${deltaPctVencida > 0 ? "#d23b3b" : "#15a36b"};font-size:12px;font-weight:600"> ${deltaPctVencida > 0 ? "▲" : "▼"} ${Math.abs(deltaPctVencida).toFixed(1).replace(".", ",")} pp</span>` : ""}</p>
          </td>
          <td style="background:#f3f6fb;border-radius:10px;padding:14px;width:25%;vertical-align:top">
            <p style="margin:0;color:#5b6b86;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Clientes en mora</p>
            <p style="margin:6px 0 0;color:#0f1b33;font-size:18px;font-weight:700">${carga.clientes_mora}<span style="color:#5b6b86;font-size:12px;font-weight:500"> / ${carga.clientes_totales}</span></p>
          </td>
        </tr>
      </table>
    </div>

    <!-- DISTRIBUCIÓN POR CATEGORÍA -->
    <div style="padding:18px 28px">
      <h2 style="margin:0 0 10px;font-size:15px;color:#0f1b33">Distribución por rango de mora</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px">
        <thead>
          <tr style="background:#f3f6fb">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">Categoría</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#5b6b86;text-transform:uppercase">Facturas</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#5b6b86;text-transform:uppercase">Valor</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#5b6b86;text-transform:uppercase">Participación</th>
          </tr>
        </thead>
        <tbody>${distRows}</tbody>
      </table>
    </div>

    <!-- TOP 10 -->
    <div style="padding:18px 28px">
      <h2 style="margin:0 0 10px;font-size:15px;color:#0f1b33">Top 10 clientes con mayor cartera vencida</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px">
        <thead>
          <tr style="background:#f3f6fb">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">Cliente</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#5b6b86;text-transform:uppercase">Facturas</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#5b6b86;text-transform:uppercase">Mora</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#5b6b86;text-transform:uppercase">Vencido</th>
          </tr>
        </thead>
        <tbody>${top10Rows}</tbody>
      </table>
    </div>

    ${alertasCriticas.length > 0 ? `
    <!-- ALERTAS CRÍTICAS -->
    <div style="padding:18px 28px">
      <h2 style="margin:0 0 10px;font-size:15px;color:#0f1b33">⚠️ Alertas críticas (${alertasCriticas.length})</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px">
        <tbody>${alertasRows}</tbody>
      </table>
      ${alertasCriticas.length > 15 ? `<p style="color:#5b6b86;font-size:12px;margin-top:10px">…y ${alertasCriticas.length - 15} alertas más en la plataforma.</p>` : ""}
    </div>
    ` : ""}

    <!-- FOOTER -->
    <div style="background:#f3f6fb;padding:16px 28px;font-size:11px;color:#5b6b86;border-top:1px solid #e3e9f4">
      Datos de la carga: ${fechaCarga}${carga.nombre_archivo ? ` · ${carga.nombre_archivo}` : ""}<br>
      ${cargaPrev ? `Comparativo vs. carga anterior del ${new Date(cargaPrev.fecha_carga).toLocaleDateString("es-CO", { dateStyle: "long" })}.` : "Es la primera carga registrada, sin comparativo disponible."}
    </div>
    <div style="background:#00276a;color:#cfe0ff;padding:14px 28px;font-size:12px;text-align:center">
      Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya
    </div>
  </div>`;

  // --- 8. Envío con Nodemailer ---
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { ciphers: "SSLv3" },
  });

  try {
    await transporter.sendMail({
      from: `"Gestión de Cartera" <${smtpUser}>`,
      to: destinatarios,
      cc: auxiliar ? [auxiliar] : undefined,
      subject: `Reporte diario de cartera — ${fechaTxt}`,
      html,
    });
    return Response.json({
      ok: true,
      destinatarios,
      cc: auxiliar || null,
      kpis: {
        cartera_total: carga.cartera_total,
        cartera_vencida: carga.cartera_vencida,
        pct_vencida: carga.pct_vencida,
        clientes_mora: carga.clientes_mora,
      },
      alertas_criticas: alertasCriticas.length,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "Error al enviar.", code: err?.code || null },
      { status: 500 }
    );
  }
}
