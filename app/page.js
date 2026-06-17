"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual, getTendencia } from "../../lib/cartera";
import { getAlertas } from "../../lib/alertas";
import { supabase } from "../../lib/supabase";
import { millones, num, pct, pesos } from "../../lib/format";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const ORDEN = ["Vigente", "Vencido 1 a 30", "Vencido 31 a 60", "Vencido 61 a 90", "Vencido 91 >"];
const ETI = {
  "Vigente": "Vigente", "Vencido 1 a 30": "1-30 días",
  "Vencido 31 a 60": "31-60 días", "Vencido 61 a 90": "61-90 días", "Vencido 91 >": "+90 días",
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
  const [docs, setDocs] = useState([]);
  const [tend, setTend] = useState([]);
  const [acuPend, setAcuPend] = useState(0);
  const [numAlertas, setNumAlertas] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [fVend, setFVend] = useState("");
  const [fCiudad, setFCiudad] = useState("");

  useEffect(() => {
    setMounted(true);
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }
      setCarga(carga);
      setDocs(docs);

      const t = await getTendencia();
      setTend(t.map((c) => ({
        fecha: new Date(c.fecha_carga).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
        Total: Math.round(c.cartera_total / 1e6),
        Vencida: Math.round(c.cartera_vencida / 1e6),
      })));
      setPrevia(t.length >= 2 ? t[t.length - 2] : null);

      const { count } = await supabase.from("acuerdos_pago").select("*", { count: "exact", head: true }).eq("estado", "Pendiente");
      setAcuPend(count || 0);
      getAlertas().then((a) => setNumAlertas(a.length)).catch(() => {});

      setEstado("ok");
    })();
  }, []);

  // Opciones de filtro (de TODA la cartera, no de lo filtrado).
  const vendedores = useMemo(() => [...new Set(docs.map((d) => d.vendedor).filter(Boolean))].sort(), [docs]);
  const ciudades = useMemo(() => [...new Set(docs.map((d) => d.ciudad).filter(Boolean))].sort(), [docs]);

  const filtrados = useMemo(
    () => docs.filter((d) => (!fVend || d.vendedor === fVend) && (!fCiudad || d.ciudad === fCiudad)),
    [docs, fVend, fCiudad]
  );

  // Todo lo del dashboard se recalcula según el filtro.
  const data = useMemo(() => {
    const cMap = {};
    let total = 0, vigente = 0, dificil = 0;
    const segMap = Object.fromEntries(ORDEN.map((c) => [c, 0]));
    const vMap = {};
    for (const d of filtrados) {
      const s = Number(d.saldo) || 0;
      total += s;
      if (d.categoria === "Vigente") vigente += s;
      if (d.categoria === "Vencido 91 >") dificil += s;
      if (segMap[d.categoria] != null) segMap[d.categoria] += s;
      if (d.categoria && d.categoria !== "Vigente") {
        const kv = d.vendedor || "Sin vendedor";
        vMap[kv] = (vMap[kv] || 0) + s;
      }
      const k = d.nit;
      if (!cMap[k]) cMap[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0, dias: 0, buckets: Object.fromEntries(ORDEN.map((c) => [c, 0])) };
      const c = cMap[k];
      c.total += s;
      if (d.categoria && d.categoria !== "Vigente") c.vencido += s;
      if (c.buckets[d.categoria] != null) c.buckets[d.categoria] += s;
      c.dias = Math.max(c.dias, parseInt(d.dias_vencidos) || 0);
    }
    const clientes = Object.values(cMap);
    const vencida = total - vigente;
    const kpis = {
      total, vigente, vencida,
      pctVencida: total > 0 ? (vencida / total) * 100 : 0,
      clientesTotales: clientes.length,
      clientesMora: clientes.filter((c) => c.vencido > 0).length,
      clientesRiesgo: clientes.filter((c) => c.dias > 90).length,
      dificil,
    };
    const seg = ORDEN.filter((c) => segMap[c] > 0).map((c) => ({ name: ETI[c], cat: c, value: Math.round(segMap[c]) }));
    const vend = Object.entries(vMap)
      .map(([k, v]) => ({ vendedor: k.split(" ").slice(0, 2).join(" "), valor: Math.round(v / 1e6) }))
      .sort((a, b) => b.valor - a.valor).slice(0, 8);
    const top = [...clientes].sort((a, b) => b.vencido - a.vencido).slice(0, 20);
    const matriz = [...clientes].sort((a, b) => b.total - a.total).slice(0, 60);
    return { kpis, seg, vend, top, matriz };
  }, [filtrados]);

  const filtroActivo = !!(fVend || fCiudad);

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando indicadores…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">📊</div>
        <h2>Aún no has cargado cartera</h2>
        <p>Sube tu archivo de Siesa para ver tus indicadores reales.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    const k = data.kpis;
    let deltaTotal = "primera carga";
    if (filtroActivo) deltaTotal = "filtrado";
    else if (previa && previa.cartera_total) {
      const dt = ((k.total - previa.cartera_total) / previa.cartera_total) * 100;
      deltaTotal = (dt >= 0 ? "+" : "") + dt.toFixed(1).replace(".", ",") + "% vs anterior";
    }

    const kpis = [
      { label: "Cartera Total", value: millones(k.total), sub: deltaTotal, color: "var(--azul)", barra: 100 },
      { label: "Cartera Vigente", value: millones(k.vigente), sub: pct(k.total ? (k.vigente / k.total) * 100 : 0) + " del total", color: "var(--verde)", barra: k.total ? (k.vigente / k.total) * 100 : 0 },
      { label: "Cartera Vencida", value: millones(k.vencida), sub: pct(k.pctVencida) + " del total", color: "var(--rojo)", barra: k.pctVencida },
      { label: "% Cartera Vencida", value: pct(k.pctVencida), sub: k.pctVencida > 40 ? "Crítico" : k.pctVencida >= 20 ? "Atención" : "Normal", color: colorMora(k.pctVencida), barra: k.pctVencida },
      { label: "Clientes Totales", value: num(k.clientesTotales), sub: num(filtrados.length) + " documentos", color: "var(--azul)", barra: 100 },
      { label: "Clientes con Mora", value: num(k.clientesMora), sub: pct(k.clientesTotales ? (k.clientesMora / k.clientesTotales) * 100 : 0) + " de clientes", color: "var(--amarillo)", barra: k.clientesTotales ? (k.clientesMora / k.clientesTotales) * 100 : 0 },
      { label: "Clientes Mora +90", value: num(k.clientesRiesgo), sub: "Riesgo alto", color: "var(--rojo)", barra: k.clientesTotales ? (k.clientesRiesgo / k.clientesTotales) * 100 : 0 },
      { label: "Cartera Difícil Cobro", value: millones(k.dificil), sub: "Vencido +90 días", color: "var(--rojo)", barra: k.total ? (k.dificil / k.total) * 100 : 0 },
    ];

    const monto = (v) => (v > 0 ? pesos(v) : <span className="muted">—</span>);

    contenido = (
      <>
        {numAlertas > 0 && (
          <Link href="/alertas" className="alert-banner">
            <span>🔔 Tienes <b>{numAlertas}</b> alertas que requieren atención</span>
            <span className="alert-banner-cta">Ver alertas →</span>
          </Link>
        )}

        <div className="filtros">
          <select value={fVend} onChange={(e) => setFVend(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fCiudad} onChange={(e) => setFCiudad(e.target.value)}>
            <option value="">Todas las ciudades</option>
            {ciudades.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {filtroActivo && <button className="btn-ghost-light" onClick={() => { setFVend(""); setFCiudad(""); }}>Limpiar filtros</button>}
        </div>

        <div className="kpi-grid kpi-8">
          {kpis.map((kp) => (
            <div className="kpi" key={kp.label}>
              <div className="label">{kp.label}</div>
              <div className="value" style={{ color: "var(--azul)" }}>{kp.value}</div>
              <div className="delta" style={{ color: "var(--texto-suave)" }}>{kp.sub}</div>
              <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, kp.barra))}%`, background: kp.color }} /></div>
            </div>
          ))}
        </div>

        {mounted && (
          <>
            <div className="charts-2">
              <div className="panel">
                <h3>Estado de cartera</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.seg} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                      {data.seg.map((s) => <Cell key={s.cat} fill={COL[s.cat]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => pesos(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <h3>Cartera vencida por vendedor (millones)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.vend} layout="vertical" margin={{ left: 10, right: 16 }}>
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
              <h3>Tendencia de cartera — global (millones)</h3>
              <ResponsiveContainer width="100%" height={240}>
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
          <h3>Estado de cartera por cliente</h3>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "28%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: "right" }}>Vigente</th>
                  <th style={{ textAlign: "right" }}>1-30</th>
                  <th style={{ textAlign: "right" }}>31-60</th>
                  <th style={{ textAlign: "right" }}>61-90</th>
                  <th style={{ textAlign: "right" }}>+90</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.matriz.map((c) => (
                  <tr key={c.nit}>
                    <td><b>{c.nombre || c.nit}</b><br /><span className="muted">{c.nit}</span></td>
                    <td style={{ textAlign: "right" }}>{monto(c.buckets["Vigente"])}</td>
                    <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 1 a 30"])}</td>
                    <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 31 a 60"])}</td>
                    <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 61 a 90"])}</td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{monto(c.buckets["Vencido 91 >"])}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>Mostrando los {data.matriz.length} clientes con mayor saldo.</p>
        </div>

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
                {data.top.map((c, i) => (
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
          Datos de la carga: {new Date(carga.fecha_carga).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
          {carga.nombre_archivo ? ` · ${carga.nombre_archivo}` : ""}
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
