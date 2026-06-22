import nodemailer from "nodemailer";

// =========================================================
//  /api/test-smtp
//  Endpoint de PRUEBA para validar que Nodemailer + SMTP
//  de Office 365 funcionan desde Vercel.
//  Cuando confirmemos que funciona, refactorizamos los
//  endpoints reales y borramos este archivo.
// =========================================================
export const dynamic = "force-dynamic";

export async function GET() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const destino = process.env.CORREO_ALERTAS;

  // Validación de variables de entorno (que SÍ existan en Vercel).
  if (!user || !pass || !destino) {
    return Response.json(
      {
        ok: false,
        error: "Faltan variables de entorno. Configura en Vercel: SMTP_USER, SMTP_PASS y CORREO_ALERTAS.",
        tieneSmtpUser: !!user,
        tieneSmtpPass: !!pass,
        tieneCorreoAlertas: !!destino,
      },
      { status: 500 }
    );
  }

  // Configuración del transporter SMTP de Office 365.
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // false porque usamos STARTTLS en el puerto 587
    auth: { user, pass },
    tls: {
      ciphers: "SSLv3",
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Prueba Gestión Cartera" <${user}>`,
      to: destino,
      subject: "✅ Prueba SMTP desde Vercel — Gestión de Cartera",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e9f4;border-radius:12px;overflow:hidden">
          <div style="background:#00378a;color:#fff;padding:22px 24px">
            <h1 style="margin:0;font-size:20px">Prueba SMTP exitosa 🎉</h1>
          </div>
          <div style="padding:24px;color:#0f1b33">
            <p style="font-size:15px;margin:0 0 14px">
              Si estás leyendo este correo, significa que <b>Nodemailer + Office 365 funcionan correctamente</b>
              desde tu app en Vercel.
            </p>
            <p style="font-size:14px;color:#5b6b86;margin:0 0 14px">
              Ya podemos refactorizar los endpoints de alertas y cartera vencida para usar este mismo método,
              y eliminar la dependencia de Resend.
            </p>
            <p style="font-size:13px;color:#5b6b86;margin:0">
              Hora del envío: ${new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "medium" })}
            </p>
          </div>
          <div style="background:#00276a;color:#cfe0ff;padding:14px 24px;font-size:12px">
            Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya
          </div>
        </div>
      `,
    });

    return Response.json({
      ok: true,
      destino,
      mensaje: "Correo de prueba enviado. Revisa tu bandeja (y la de spam).",
      messageId: info.messageId,
    });
  } catch (err) {
    // Devolvemos el error completo para que sepamos qué tocar si falla.
    return Response.json(
      {
        ok: false,
        error: err?.message || "Error desconocido al enviar.",
        code: err?.code || null,
        response: err?.response || null,
        responseCode: err?.responseCode || null,
      },
      { status: 500 }
    );
  }
}
