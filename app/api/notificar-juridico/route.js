import nodemailer from "nodemailer";
import { verificarAuth } from "../../../lib/apiAuth";

// =========================================================
//  /api/notificar-juridico
//  Avisa por correo que un cliente fue enviado a cobro jurídico.
//
//  - PARA:  CORREO_JURIDICO_PARA  (quien hace la gestión jurídica)
//  - COPIA: CORREO_JURIDICO_COPIA (directivos, para trazabilidad)
//
//  El navegador solo envía el id del evento. Todos los datos del
//  correo se leen de la base de datos, no se confía en el navegador.
//  Solo puede notificar quien hizo el envío y dentro de los 15 min
//  siguientes (evita que se use para mandar correos repetidos).
// =========================================================
export const dynamic = "force-dynamic";

const VENTANA_MIN = 15;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export async function POST(request) {
  const auth = await verificarAuth(request);
  if (auth.error) return auth.error;
  const { sb, usuario } = auth;

  if (!["auxiliar", "supervisor"].includes(usuario.rol)) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const para = process.env.CORREO_JURIDICO_PARA;
  const copia = process.env.CORREO_JURIDICO_COPIA || "";
  if (!smtpUser || !smtpPass || !para) {
    return Response.json(
      { ok: false, error: "Faltan variables de entorno: SMTP_USER, SMTP_PASS o CORREO_JURIDICO_PARA." },
      { status: 500 }
    );
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const historialId = Number(body?.historialId);
  if (!historialId) {
    return Response.json({ ok: false, error: "Falta el id del evento." }, { status: 400 });
  }

  // 1. El evento de envío a jurídico.
  const { data: ev } = await sb
    .from("juridico_historial")
    .select("id, cliente_nit, accion, motivo, usuario_id, usuario_nombre, creado_en")
    .eq("id", historialId)
    .single();

  if (!ev || ev.accion !== "Enviado") {
    return Response.json({ ok: false, error: "Evento no encontrado." }, { status: 404 });
  }
  if (ev.usuario_id !== usuario.id) {
    return Response.json({ ok: false, error: "Solo quien hizo el envío puede notificarlo." }, { status: 403 });
  }
  if (Date.now() - new Date(ev.creado_en).getTime() > VENTANA_MIN * 60000) {
    return Response.json({ ok: false, error: "El envío ya no es reciente; no se notifica de nuevo." }, { status: 409 });
  }

  const nit = ev.cliente_nit;

  // 2. Datos del cliente, soportes y cartera de la carga actual.
  const [{ data: cliente }, { data: adjuntos }, { data: cargas }] = await Promise.all([
    sb.from("clientes").select("nombre, ciudad, vendedor").eq("nit", nit).single(),
    sb.from("juridico_adjuntos").select("nombre_archivo").eq("historial_id", ev.id),
    sb.from("cargas").select("id").order("fecha_carga", { ascending: false }).limit(1),
  ]);

  let total = 0, vencido = 0, dias = 0, docs = 0;
  if (cargas && cargas.length) {
    const { data: filas } = await sb
      .from("cartera_documentos")
      .select("saldo, categoria, dias_vencidos")
      .eq("carga_id", cargas[0].id)
      .eq("nit", nit);
    for (const d of filas || []) {
      const saldo = Number(d.saldo) || 0;
      if (saldo <= 0) continue; // regla: facturas pagadas no cuentan
      docs++;
      total += saldo;
      if (d.categoria && d.categoria !== "Vigente") vencido += saldo;
      dias = Math.max(dias, parseInt(d.dias_vencidos) || 0);
    }
  }

  const nombre = cliente?.nombre || nit;
  const fecha = new Date(ev.creado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" });
  const listaSoportes = (adjuntos || []).length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${adjuntos.map((a) => `<li>${esc(a.nombre_archivo)}</li>`).join("")}</ul>`
    : "Sin soportes adjuntos.";

  const fila = (k, v) => `<tr><td style="padding:7px 10px;border-bottom:1px solid #e3e9f4;color:#5b6b86;font-size:13px;width:170px">${k}</td><td style="padding:7px 10px;border-bottom:1px solid #e3e9f4;font-size:13px;color:#0f1b33">${v}</td></tr>`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e3e9f4;border-radius:12px;overflow:hidden">
    <div style="background:#00378a;color:#fff;padding:22px 24px">
      <h1 style="margin:0;font-size:20px">Cliente enviado a cobro jurídico</h1>
      <p style="margin:6px 0 0;color:#cfe0ff;font-size:13px">${esc(fecha)}</p>
    </div>
    <div style="padding:24px">
      <table style="width:100%;border-collapse:collapse">
        ${fila("Cliente", `<b>${esc(nombre)}</b>`)}
        ${fila("NIT", esc(nit))}
        ${fila("Ciudad", esc(cliente?.ciudad || "—"))}
        ${fila("Vendedor", esc(cliente?.vendedor || "—"))}
        ${fila("Saldo total", pesos(total))}
        ${fila("Saldo vencido", `<b style="color:#d23b3b">${pesos(vencido)}</b>`)}
        ${fila("Días de mora (máx.)", dias)}
        ${fila("Documentos con saldo", docs)}
        ${fila("Enviado por", esc(ev.usuario_nombre || "—"))}
        ${fila("Motivo", esc(ev.motivo || "—"))}
        ${fila("Soportes", listaSoportes)}
      </table>
      <p style="font-size:13px;color:#5b6b86;margin-top:16px">Los soportes se consultan en la plataforma, en la bandeja de Jurídico.</p>
    </div>
    <div style="background:#00276a;color:#cfe0ff;padding:14px 24px;font-size:12px">
      Gestión de Cartera — Electroingeniería S.A.S.
    </div>
  </div>`;

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
      to: para,
      cc: copia || undefined,
      subject: `Cobro jurídico — ${nombre} (NIT ${nit})`,
      html,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || "Error al enviar el correo." }, { status: 500 });
  }
}
