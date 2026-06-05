"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { millones, num, pct } from "../../lib/format";

// Color del semáforo según el % de mora.
function colorMora(p) {
  if (p > 40) return "var(--rojo)";
  if (p >= 20) return "var(--amarillo)";
  return "var(--verde)";
}

export default function Dashboard() {
  const [cargando, setCargando] = useState(true);
  const [carga, setCarga] = useState(null);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    async function traer() {
      // Traemos las 2 cargas más recientes: la actual y la anterior (para la variación).
      const { data } = await supabase
        .from("cargas")
        .select("*")
        .order("fecha_carga", { ascending: false })
        .limit(2);
      if (data && data.length) {
        setCarga(data[0]);
        setPrevia(data[1] || null);
      }
      setCargando(false);
    }
    traer();
  }, []);

  let contenido;

  if (cargando) {
    contenido = <p className="muted">Cargando indicadores…</p>;
  } else if (!carga) {
    contenido = (
      <div className="empty">
        <div className="empty-ico">▤</div>
        <h2>Aún no has cargado cartera</h2>
        <p>Sube tu archivo de Siesa para ver tus indicadores reales.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    const c = carga;
    const dt =
      previa && previa.cartera_total
        ? ((c.cartera_total - previa.cartera_total) / previa.cartera_total) * 100
        : null;
    const deltaTotal =
      dt === null
        ? "primera carga"
        : (dt >= 0 ? "+" : "") + dt.toFixed(1).replace(".", ",") + "% vs anterior";

    const kpis = [
      { label: "Cartera Total", value: millones(c.cartera_total), sub: deltaTotal, color: "var(--azul)", barra: 100 },
      { label: "Cartera Vigente", value: millones(c.cartera_vigente), sub: pct((c.cartera_vigente / c.cartera_total) * 100) + " del total", color: "var(--verde)", barra: (c.cartera_vigente / c.cartera_total) * 100 },
      { label: "Cartera Vencida", value: millones(c.cartera_vencida), sub: pct(c.pct_vencida) + " del total", color: "var(--rojo)", barra: c.pct_vencida },
      { label: "% Cartera Vencida", value: pct(c.pct_vencida), sub: c.pct_vencida > 40 ? "Crítico" : c.pct_vencida >= 20 ? "Atención" : "Normal", color: colorMora(c.pct_vencida), barra: c.pct_vencida },
      { label: "Clientes Totales", value: num(c.clientes_totales), sub: num(c.total_documentos) + " documentos", color: "var(--azul)", barra: 100 },
      { label: "Clientes con Mora", value: num(c.clientes_mora), sub: pct((c.clientes_mora / c.clientes_totales) * 100) + " de clientes", color: "var(--amarillo)", barra: (c.clientes_mora / c.clientes_totales) * 100 },
      { label: "Clientes en Riesgo", value: num(c.clientes_riesgo), sub: "Mora +90 días", color: "var(--rojo)", barra: (c.clientes_riesgo / c.clientes_totales) * 100 },
      { label: "Acuerdos Pendientes", value: "—", sub: "Próximamente", color: "var(--texto-suave)", barra: 0 },
    ];

    contenido = (
      <>
        <div className="kpi-grid kpi-8">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <div className="label">{k.label}</div>
              <div className="value" style={{ color: k.color === "var(--texto-suave)" ? "var(--texto-suave)" : "var(--azul)" }}>{k.value}</div>
              <div className="delta" style={{ color: "var(--texto-suave)" }}>{k.sub}</div>
              <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, k.barra))}%`, background: k.color }} /></div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 18 }}>
          Datos de la carga: {new Date(c.fecha_carga).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
          {c.nombre_archivo ? ` · ${c.nombre_archivo}` : ""}
        </p>
      </>
    );
  }

  return (
    <AppShell active="dashboard" titulo="Dashboard" subtitulo="Indicadores de cartera">
      {contenido}
    </AppShell>
  );
}
