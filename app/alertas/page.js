"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getAlertas } from "../../lib/alertas";

const NIVEL = {
  critica: { label: "Crítica", color: "var(--rojo)", bg: "#fdeaea" },
  alta: { label: "Alta", color: "var(--amarillo)", bg: "#fff8da" },
  media: { label: "Media", color: "var(--azul)", bg: "#eef6ff" },
};

export default function Alertas() {
  const [estado, setEstado] = useState("cargando");
  const [alertas, setAlertas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [envioMsg, setEnvioMsg] = useState(null);

  async function enviarCorreo() {
    setEnviando(true);
    setEnvioMsg(null);
    try {
      const r = await fetch("/api/enviar-alertas");
      const data = await r.json();
      if (data.ok) setEnvioMsg({ tipo: "listo", txt: `Correo enviado a ${data.destino} con ${data.alertas} alertas.` });
      else setEnvioMsg({ tipo: "error", txt: data.error || "No se pudo enviar." });
    } catch (e) {
      setEnvioMsg({ tipo: "error", txt: "Error de conexión al enviar." });
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    (async () => {
      const a = await getAlertas();
      setAlertas(a);
      setEstado("ok");
    })();
  }, []);

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Calculando alertas…</p>;
  } else if (alertas.length === 0) {
    contenido = (
      <div className="empty">
        <div className="empty-ico">◔</div>
        <h2>Sin alertas por ahora</h2>
        <p>Cuando haya promesas por vencer, mora alta o clientes sin gestión, aparecerán aquí.</p>
      </div>
    );
  } else {
    const conteo = { critica: 0, alta: 0, media: 0 };
    alertas.forEach((a) => conteo[a.nivel]++);
    contenido = (
      <>
        <div className="alert-resumen">
          <span style={{ color: "var(--rojo)" }}><b>{conteo.critica}</b> críticas</span>
          <span style={{ color: "var(--amarillo)" }}><b>{conteo.alta}</b> altas</span>
          <span style={{ color: "var(--azul)" }}><b>{conteo.media}</b> medias</span>
        </div>
        <div className="alert-lista">
          {alertas.map((a, i) => (
            <div className="alert-item" key={i} style={{ borderLeftColor: NIVEL[a.nivel].color }}>
              <div className="alert-main">
                <span className="pill" style={{ background: NIVEL[a.nivel].bg, color: NIVEL[a.nivel].color }}>{a.tipo}</span>
                <strong>{a.nombre}</strong>
                <span className="muted">{a.detalle}</span>
              </div>
              <Link href={`/cliente/${encodeURIComponent(a.nit)}`} className="btn-mini">Gestionar</Link>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <AppShell active="alertas" titulo="Alertas" subtitulo="Lo que requiere tu atención hoy">
      <div className="alert-toolbar">
        <button className="btn btn-primary" onClick={enviarCorreo} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar resumen a mi correo"}
        </button>
        {envioMsg && <span className={`envio-msg ${envioMsg.tipo}`}>{envioMsg.txt}</span>}
      </div>
      {contenido}
    </AppShell>
  );
}
