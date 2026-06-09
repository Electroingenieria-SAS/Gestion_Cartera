import { createClient } from "@supabase/supabase-js";

// Esta función corre EN EL SERVIDOR (nunca en el navegador), por eso aquí
// sí podemos usar la clave secreta de Supabase y la de Resend con seguridad.
export const dynamic = "force-dynamic";

const MS_DIA = 86400000;
const fmt = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const destino = process.env.CORREO_ALERTAS;

  if (!url || !serviceKey || !resendKey || !destino) {
    return Response.json(
      { ok: false, error: "Faltan variables de entorno. Revisa en Vercel: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY y CORREO_ALERTAS." },
      { status: 500 }
    );
  }

  const sb = createClient(url, serviceKey);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // --- Carga actual + documentos ---
  const { data: cargas } = await sb.from("cargas").select("id").order("fecha_carga", { ascending: false }).limit(1);
  if (!cargas || cargas.length === 0) {
    return Response.json({ ok: false, error: "No hay cartera cargada todavía." }, { status: 400 });
  }
  const cargaId = cargas[0].id;

  const docs = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from("cartera_documentos").select("nit, nombre_cliente, saldo, categoria, dias_vencidos").eq("carga_id", cargaId).range(from, from + 999);
    if (!data || data.length === 0) break;
    docs.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const cli = {};
  for (const d of docs) {
    const k = d.nit;
    if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, dias: 0, vencido: 0 };
    cli[k].dias = Math.max(cli[k].dias, parseInt(d.dias_vencidos) || 0);
    if (d.categoria && d.categoria !== "Vigente") cli[k].vencido += Number(d.saldo) || 0;
  }

  const { data: gest } = await sb.from("gestiones").select("cliente_nit, fecha");
  const ultima = {};
  for (const g of gest || []) {
    if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) ultima[g.cliente_nit] = g.fecha;
  }

  const alertas = [];
  const { data: acu } = await sb.from("acuerdos_pago").select("*").eq("estado", "Pendiente");
  for (const a of acu || []) {
    const f = new Date(a.fecha_compromiso + "T00:00:00");
    const diff = Math.floor((hoy - f) / MS_DIA);
    const nombre = cli[a.cliente_nit]?.nombre || a.cliente_nit;
    if (diff === 0) alertas.push({ nivel: "critica", tipo: "Promesa vence hoy", nombre, detalle: `Compromiso de ${fmt(a.valor_comprometido)}` });
    else if (diff > 3) alertas.push({ nivel: "critica", tipo: "Promesa vencida", nombre, detalle: `${fmt(a.valor_comprometido)} · venció hace ${diff} días` });
  }
  for (const c of Object.values(cli)) {
    if (c.dias > 90) alertas.push({ nivel: "critica", tipo: "Mora +90 días", nombre: c.nombre, detalle: `${c.dias} días · ${fmt(c.vencido)} vencido` });
  }
  for (const c of Object.values(cli)) {
    if (c.vencido > 0) {
      const dsg = ultima[c.nit] ? Math.floor((Date.now() - new Date(ultima[c.nit])) / MS_DIA) : 9999;
      if (dsg >= 15) alertas.push({ nivel: "media", tipo: "Sin gestión 15+ días", nombre: c.nombre, detalle: ultima[c.nit] ? `Hace ${dsg} días` : "Nunca gestionado" });
    }
  }
  const orden = { critica: 0, alta: 1, media: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  const criticas = alertas.filter((a) => a.nivel === "critica").length;
  const filas = alertas.slice(0, 25).map((a) =>
    `<tr>
       <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;color:${a.nivel === "critica" ? "#d23b3b" : a.nivel === "alta" ? "#d9a400" : "#00378a"};font-weight:600;font-size:12px">${a.tipo}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;font-size:13px"><b>${a.nombre}</b></td>
       <td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;color:#5b6b86;font-size:13px">${a.detalle}</td>
     </tr>`
  ).join("");

  const fechaTxt = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e3e9f4;border-radius:12px;overflow:hidden">
    <div style="background:#00378a;color:#fff;padding:22px 24px">
      <h1 style="margin:0;font-size:20px">Alertas de cartera</h1>
      <p style="margin:6px 0 0;color:#cfe0ff;font-size:13px">${fechaTxt}</p>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#0f1b33">Tienes <b>${alertas.length}</b> alertas activas (<b style="color:#d23b3b">${criticas} críticas</b>).</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px">${filas}</table>
      ${alertas.length > 25 ? `<p style="color:#5b6b86;font-size:13px;margin-top:12px">…y ${alertas.length - 25} más. Entra a la plataforma para verlas todas.</p>` : ""}
    </div>
    <div style="background:#00276a;color:#cfe0ff;padding:14px 24px;font-size:12px">
      Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya
    </div>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Gestión de Cartera <onboarding@resend.dev>",
      to: [destino],
      subject: `Alertas de cartera — ${alertas.length} activas (${criticas} críticas)`,
      html,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    return Response.json({ ok: false, error: data?.message || "Error al enviar con Resend.", detalle: data }, { status: 500 });
  }
  return Response.json({ ok: true, alertas: alertas.length, destino });
}
