"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual, getTendencia } from "../../lib/cartera";
import { millones, num, pct, pesos } from "../../lib/format";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const ORDEN = ["Vigente", "Vencido 1 a 30", "Vencido 31 a 60", "Vencido 61 a 90", "Vencido 91 >"];
const ETI = {
  "Vigente": "Vigente", "Vencido 1 a 30": "1-30 dias",
  "Vencido 31 a 60": "31-60 dias", "Vencido 61 a 90": "61-90 dias", "Vencido 91 >": "+90 dias",
};
const COL = {
  "Vigente": "#15a36b", "Vencido 1 a 30": "#ddbc00",
  "Vencido 31 a 60": "#e8930c", "Vencido 61 a 90": "#e2632b", "Vencido 91 >": "#d23b3b",
};

function colorMora(p) {
  if (p > 40) return "var(--rojo)";
  if (p >= 20) return "var(--amarillo)";
  return "var(--verde)";
}

export default function Dashboard() {
  const [estado, setEstado] = useState("cargando");
  const [carga, setCarga] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [seg, setSeg] = useState([]);
  const [vend, setVend] = useState([]);
  const [top, setTop] = useState([]);
  const [tend, setTend] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }
      setCarga(carga);

      const t = await getTendencia();
      setTend(t.map((c) => ({
        fecha: new Date(c.fecha_carga).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
        Total: Math.round(c.cartera_total / 1e6),
        Vencida: Math.round(c.cartera_vencida / 1e6),
      })));
      setPrevia(t.length >= 2 ? t[t.length - 2] : null);

      const segMap = Object.fromEntries(ORDEN.map((c) => [c, 0]));
      for (const d of docs) if (segMap[d.categoria] != null) segMap[d.categoria] += Number(d.saldo) || 0;
      setSeg(ORDEN.filter((c) => segMap[c] > 0).map((c) => ({ name: ETI[c], cat: c, value: Math.round(segMap[c]) })));

      const vMap = {};
      for (const d of docs) {
        if (d.categoria && d.categoria !== "Vigente") {
          const k = d.vendedor || "Sin vendedor";
          vMap[k] = (vMap[k] || 0) + (Number(d.saldo) || 0);
        }
      }
      setVend(
        Object.entries(vMap)
          .map(([k, v]) => ({ vendedor: k.split(" ").slice(0, 2).join(" "), valor: Math.round(v / 1e6) }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 8)
      );

      const cMap = {};
      for (const d of docs) {
        const k = d.nit;
        if (!cMap[k]) cMap[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0, dias: 0 };
        const c = cMap[k];
        c.total += Number(d.saldo) || 0;
        if (d.categoria && d.categoria !== "Vigente") c.vencido += Number(d.saldo) || 0;
        c.dias = Math.max(c.dias, parseInt(d.dias_vencidos) || 0);
      }
      setTop(Object.values(cMap).sort((a, b) => b.vencido - a.vencido).slice(0, 20));

      setEstado("ok");
    })();
  }, []);

  let contenido;

  if (estado === "cargando") {
    contenido = <p className="muted">Cargando indicadores…</p>;
  } else if (estado === "vacio") {
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
    const dt = previa && previa.cartera_total
      ? ((c.cartera_total - previa.cartera_total) / previa.cartera_total) * 100 : null;
    const deltaTotal = dt === null ? "primera carga" : (dt >= 0 ? "+" : "") + dt.toFixed(1).replace(".", ",") + "% vs anterior";

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

        {mounted && (
          <>
            <div className="charts-2">
              <div className="panel">
                <h3>Segmentación de cartera</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={seg} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                      {seg.map((s) => <Cell key={s.cat} fill={COL[s.cat]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => pesos(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <h3>Cartera vencida por vendedor (millones)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vend} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="#eef2f8" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="vendedor" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                    <Bar dataKey="valor" fill="#00378a" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <h3>Tendencia de cartera (millones)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tend} margin={{ left: 10, right: 16 }}>
                  <CartesianGrid stroke="#eef2f8" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                  <Legend />
                  <Line type="monotone" dataKey="Total" stroke="#00378a" strokeWidth={2} />
                  <Line type="monotone" dataKey="Vencida" stroke="#d23b3b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              {tend.length < 2 && <p className="muted" style={{ marginTop: 8 }}>La tendencia se irá dibujando a medida que cargues la cartera cada día.</p>}
            </div>
          </>
        )}

        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Top 20 clientes críticos</h3>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "5%" }} /><col style={{ width: "29%" }} />
                <col style={{ width: "14%" }} /><col style={{ width: "20%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Cliente</th><th>Ciudad</th><th>Vendedor</th>
                  <th style={{ textAlign: "right" }}>Saldo total</th>
                  <th style={{ textAlign: "right" }}>Vencido</th>
                  <th style={{ textAlign: "right" }}>Días mora</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c, i) => (
                  <tr key={c.nit}>
                    <td>{i + 1}</td>
                    <td><b>{c.nombre || c.nit}</b><br /><span className="muted">{c.nit}</span></td>
                    <td>{c.ciudad || "—"}</td>
                    <td>{c.vendedor || "—"}</td>
                    <td style={{ textAlign: "right" }}>{pesos(c.total)}</td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{pesos(c.vencido)}</td>
                    <td style={{ textAlign: "right" }}>{c.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
