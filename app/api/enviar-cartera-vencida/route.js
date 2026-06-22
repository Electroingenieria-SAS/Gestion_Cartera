import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// =========================================================
//  /api/enviar-cartera-vencida
//  Envía por correo un reporte con TODA la cartera vencida
//  de la carga más reciente, agrupada por cliente.
//
//  Refactorizado para usar Nodemailer + SMTP de Office 365
//  en lugar de Resend.
// =========================================================
export const dynamic = "force-dynamic";

const fmt = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");

// Color de cada rango de mora (mismo que el dashboard).
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
  const destino = process.env.CORREO_ALERTAS;

  if (!url || !serviceKey || !smtpUser || !smtpPass || !destino) {
    return Response.json(
      { ok: false, error: "Faltan variables de entorno. Revisa en Vercel: SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASS y CORREO_ALERTAS." },
      { status: 500 }
    );
  }

  const sb = createClient(url, serviceKey);

  // --- 1. Carga más reciente ---
  const { data: cargas } = await sb
    .from("cargas")
    .select("id, fecha_carga, nombre_archivo")
    .order("fecha_carga", { ascending: false })
    .limit(1);

  if (!cargas || cargas.length === 0) {
    return Response.json({ ok: false, error: "No hay cartera cargada todavía." }, { status: 400 });
  }
  const carga = cargas[0];

  // --- 2. Documentos VENCIDOS (paginado de 1000 en 1000) ---
  const docs = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from("cartera_documentos")
      .select("nit, nombre_cliente, ciudad, vendedor, saldo, categoria, dias_vencidos")
      .eq("carga_id", carga.id)
      .neq("categoria", "Vigente")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    docs.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  if (docs.length === 0) {
    return Response.json({ ok: false, error: "No hay facturas vencidas en la carga actual. ¡Buen trabajo!" }, { status: 400 });
  }

  // --- 3. Agrupar por cliente ---
  const cli = {};
  for (const d of docs) {
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
    const c = cli[k];
    c.vencido += Number(d.saldo) || 0;
    c.facturas += 1;
    c.dias = Math.max(c.dias, parseInt(d.dias_vencidos) || 0);
    if ((d.dias_vencidos || 0) > c.dias - 1) c.peorCat = d.categoria || c.peorCat;
  }

  const clientes = Object.values(cli).sort((a, b) => b.vencido - a.vencido);
  const totalVencido = clientes.reduce((s, c) => s + c.vencido, 0);

  // --- 4. Armar HTML del correo ---
  const filas = clientes.slice(0, 50).map((c, i) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:12px;color:#5b6b86">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px">
        <b>${c.nombre}</b><br>
        <span style="color:#5b6b86;font-size:11px">${c.nit} · ${c.ciudad}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px;color:#5b6b86">${c.vendedor}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px;text-align:center">${c.facturas}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px;text-align:center">
        <span style="background:${(COL_CAT[c.peorCat] || "#888")}22;color:${COL_CAT[c.peorCat] || "#555"};padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600">${c.dias} días</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px;text-align:right;font-weight:700;color:#d23b3b">${fmt(c.vencido)}</td>
    </tr>
  `).join("");

  const fechaTxt = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fechaCarga = new Date(carga.fecha_carga).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #e3e9f4;border-radius:12px;overflow:hidden">
    <div style="background:#00378a;color:#fff;padding:22px 24px">
      <h1 style="margin:0;font-size:20px">Reporte de cartera vencida</h1>
      <p style="margin:6px 0 0;color:#cfe0ff;font-size:13px">${fechaTxt}</p>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#0f1b33;margin:0 0 16px">
        Total vencido: <b style="color:#d23b3b">${fmt(totalVencido)}</b> ·
        <b>${clientes.length}</b> clientes · <b>${docs.length}</b> facturas vencidas
      </p>
      <p style="font-size:12px;color:#5b6b86;margin:0 0 14px">
        Datos de la carga: ${fechaCarga}${carga.nombre_archivo ? ` · ${carga.nombre_archivo}` : ""}
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:6px">
        <thead>
          <tr style="background:#f3f6fb">
            <th style="padding:10px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">#</th>
            <th style="padding:10px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">Cliente</th>
            <th style="padding:10px;text-align:left;font-size:11px;color:#5b6b86;text-transform:uppercase">Vendedor</th>
            <th style="padding:10px;text-align:center;font-size:11px;color:#5b6b86;text-transform:uppercase">Facturas</th>
            <th style="padding:10px;text-align:center;font-size:11px;color:#5b6b86;text-transform:uppercase">Mora</th>
            <th style="padding:10px;text-align:right;font-size:11px;color:#5b6b86;text-transform:uppercase">Vencido</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      ${clientes.length > 50 ? `<p style="color:#5b6b86;font-size:13px;margin-top:14px">…y ${clientes.length - 50} clientes más con cartera vencida. Entra a la plataforma para verlos todos.</p>` : ""}
    </div>
    <div style="background:#00276a;color:#cfe0ff;padding:14px 24px;font-size:12px">
      Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya
    </div>
  </div>`;

  // --- 5. Envío con Nodemailer + SMTP Office 365 ---
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
      to: destino,
      subject: `Cartera vencida — ${fmt(totalVencido)} · ${clientes.length} clientes`,
      html,
    });
    return Response.json({
      ok: true,
      destino,
      facturas: docs.length,
      clientes: clientes.length,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "Error al enviar.", code: err?.code || null },
      { status: 500 }
    );
  }
}
