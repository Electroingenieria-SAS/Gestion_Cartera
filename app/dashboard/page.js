"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import BannerCompromisos from "../components/BannerCompromisos";
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
  "Vigente": "Vigente", "Vencido 1 a 30": "1–30 días",
  "Vencido 31 a 60": "31–60 días", "Vencido 61 a 90": "61–90 días", "Vencido 91 >": "+90 días",
};
const COL = {
  "Vigente": "#15a36b", "Vencido 1 a 30": "#ddbc00",
  "Vencido 31 a 60": "#e8930c", "Vencido 61 a 90": "#e2632b", "Vencido 91 >": "#d23b3b",
};

const DONUT_COL = { vigente: "#15a36b", vencida: "#ddbc00", dificil: "#d23b3b" };

const S = {
  panel: { background: "#fff", border: "1px solid #e3e9f4", borderRadius: 16, padding: "20px 22px", boxShadow: "0 10px 30px rgba(0,55,138,0.06)" },
  h3: { fontSize: 14, fontWeight: 700, color: "#0f1b33", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".4px" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 },
  kpiCard: (color) => ({
    background: "#fff", border: "1px solid #e3e9f4", borderRadius: 14,
    padding: "18px 20px", boxShadow: "0 6px 20px rgba(0,55,138,0.06)",
    borderTop: `4px solid ${color}`,
  }),
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 },
  gridSide: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginTop: 16 },
  label: { fontSize: 11, fontWeight: 700, color: "#5b6b86", textTransform: "uppercase", letterSpacing: ".6px" },
  bigNum: (color) => ({ fontSize: 26, fontWeight: 800, color, marginTop: 4 }),
  sub: { fontSize: 12, color: "#5b6b86", marginTop: 4 },
  indicador: { display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #eef2f7", fontSize: 13 },
};

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
  const [fBusqueda, setFBusqueda] = useState("");
  const [fCliente, setFCliente] = useState(null); // { nit, nombre } — cross-filter por clic en tabla

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

  const vendedores = useMemo(() => [...new Set(docs.map((d) => d.vendedor).filter(Boolean))].sort(), [docs]);
  const ciudades = useMemo(() => [...new Set(docs.map((d) => d.ciudad).filter(Boolean))].sort(), [docs]);

  const filtrados = useMemo(() => {
    const b = fBusqueda.trim().toLowerCase();
    return docs.filter((d) =>
      (!fVend || d.vendedor === fVend) &&
      (!fCiudad || d.ciudad === fCiudad) &&
      (!fCliente || d.nit === fCliente.nit) &&
      (!b || `${d.nombre_cliente || ""} ${d.nit || ""}`.toLowerCase().includes(b))
    );
  }, [docs, fVend, fCiudad, fBusqueda, fCliente]);

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
      if (!cMap[k]) cMap[k] = {
        nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor,
        total: 0, vencido: 0, dias: 0,
        buckets: Object.fromEntries(ORDEN.map((c) => [c, 0])),
      };
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
      condPagoPromedio: 0,
    };

    // Distribución por días de mora (barras verticales)
    const distMora = ORDEN.map((c) => ({
      name: ETI[c], cat: c, valor: Math.round(segMap[c] / 1e6),
    }));

    // Donut 3 segmentos: Vigente / Vencida / Difícil cobro
    const vencidaSinDificil = vencida - dificil;
    const donut = [
      { name: "Vigente", value: Math.round(vigente), color: DONUT_COL.vigente },
      { name: "Vencida", value: Math.round(vencidaSinDificil > 0 ? vencidaSinDificil : 0), color: DONUT_COL.vencida },
      { name: "Difícil cobro", value: Math.round(dificil), color: DONUT_COL.dificil },
    ].filter((d) => d.value > 0);

    // Vendedores — top 8 por vencido
    const vend = Object.entries(vMap)
      .map(([k, v]) => ({ vendedor: k.length > 20 ? k.slice(0, 18) + "…" : k, valor: Math.round(v / 1e6) }))
      .sort((a, b) => b.valor - a.valor).slice(0, 8);

    // Tablas
    const top10Dificil = [...clientes].filter((c) => c.buckets["Vencido 91 >"] > 0)
      .sort((a, b) => b.buckets["Vencido 91 >"] - a.buckets["Vencido 91 >"])
      .slice(0, 10);

    const matriz = [...clientes].sort((a, b) => b.total - a.total).slice(0, 60);

    return { kpis, distMora, donut, vend, top10Dificil, matriz };
  }, [filtrados]);

  const filtroActivo = !!(fVend || fCiudad || fBusqueda || fCliente);

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

    let deltaVencida = null;
    if (!filtroActivo && previa && previa.cartera_vencida) {
      deltaVencida = ((k.vencida - previa.cartera_vencida) / previa.cartera_vencida) * 100;
    }

    const monto = (v) => (v > 0 ? pesos(v) : <span className="muted">—</span>);

    const donutTotal = data.donut.reduce((s, d) => s + d.value, 0) || 1;

    contenido = (
      <>
        <BannerCompromisos />

        {numAlertas > 0 && (
          <Link href="/alertas" className="alert-banner">
            <span>Tienes <b>{numAlertas}</b> alertas que requieren atención</span>
            <span className="alert-banner-cta">Ver alertas →</span>
          </Link>
        )}

        {/* ── KPIs principales (5 cards) ── */}
        <div style={S.kpiRow}>
          <div style={S.kpiCard("var(--azul)")}>
            <div style={S.label}>Cartera Total</div>
            <div style={S.bigNum("var(--azul)")}>{millones(k.total)}</div>
            <div style={S.sub}>{num(filtrados.length)} documentos</div>
          </div>
          <div style={S.kpiCard("#d23b3b")}>
            <div style={S.label}>Cartera Vencida</div>
            <div style={S.bigNum("#d23b3b")}>{millones(k.vencida)}</div>
            <div style={S.sub}>
              {deltaVencida != null
                ? <span style={{ color: deltaVencida > 0 ? "#d23b3b" : "#15a36b", fontWeight: 700 }}>{deltaVencida > 0 ? "▲" : "▼"} {Math.abs(deltaVencida).toFixed(1).replace(".", ",")}% vs anterior</span>
                : filtroActivo ? "filtrado" : "primera carga"
              }
            </div>
          </div>
          <div style={S.kpiCard("#e8930c")}>
            <div style={S.label}>% Cartera Vencida</div>
            <div style={S.bigNum("#e8930c")}>{pct(k.pctVencida)}</div>
            <div style={S.sub}>{k.pctVencida > 40 ? "Nivel crítico" : k.pctVencida >= 20 ? "Requiere atención" : "Nivel normal"}</div>
          </div>
          <div style={S.kpiCard("#15a36b")}>
            <div style={S.label}>Cartera Vigente</div>
            <div style={S.bigNum("#15a36b")}>{millones(k.vigente)}</div>
            <div style={S.sub}>{pct(k.total ? (k.vigente / k.total) * 100 : 0)} del total</div>
          </div>
          <div style={S.kpiCard("var(--azul)")}>
            <div style={S.label}># Clientes</div>
            <div style={S.bigNum("var(--azul)")}>{num(k.clientesTotales)}</div>
            <div style={S.sub}>{num(k.clientesMora)} en mora</div>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className="filtros" style={{ marginTop: 16 }}>
          <input placeholder="Buscar cliente o NIT…" value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} />
          <select value={fVend} onChange={(e) => setFVend(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fCiudad} onChange={(e) => setFCiudad(e.target.value)}>
            <option value="">Todas las ciudades</option>
            {ciudades.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {filtroActivo && <button className="btn-ghost-light" onClick={() => { setFVend(""); setFCiudad(""); setFBusqueda(""); setFCliente(null); }}>Limpiar</button>}
        </div>

        {/* Banner de cross-filter cuando se da clic en un cliente */}
        {fCliente && (
          <div style={{
            marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "#eef6ff", border: "1px solid #cfe2fb", borderRadius: 12, padding: "12px 18px",
          }}>
            <span style={{ fontSize: 14, color: "var(--azul)" }}>
              Filtrando por: <b>{fCliente.nombre}</b> <span style={{ color: "#5b6b86" }}>(NIT {fCliente.nit})</span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/cliente/${encodeURIComponent(fCliente.nit)}`} className="btn-mini">Ir a ficha</Link>
              <button onClick={() => setFCliente(null)} style={{
                background: "#fff", border: "1px solid var(--borde)", borderRadius: 8,
                padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--texto)", cursor: "pointer",
              }}>Quitar filtro</button>
            </div>
          </div>
        )}

        {/* ── Fila de 3 gráficos ── */}
        {mounted && (
          <div style={S.grid3}>
            {/* 1. Distribución por días de mora */}
            <div style={S.panel}>
              <h3 style={S.h3}>Distribución por días de mora</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.distMora} margin={{ left: 0, right: 8, top: 20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f8" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + v + " M"} />
                  <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]} label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "#0f1b33", formatter: (v) => "$" + num(v) + " M" }}>
                    {data.distMora.map((d) => <Cell key={d.cat} fill={COL[d.cat]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 2. Estado de cartera (donut 3 segmentos) */}
            <div style={S.panel}>
              <h3 style={S.h3}>Estado de cartera</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={data.donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}
                    cx="50%" cy="45%"
                    label={({ cx, cy, midAngle, outerRadius, name, value }) => {
                      const RADIAN = Math.PI / 180;
                      const r = outerRadius + 28;
                      const x = cx + r * Math.cos(-midAngle * RADIAN);
                      const y = cy + r * Math.sin(-midAngle * RADIAN);
                      const p = pct((value / donutTotal) * 100);
                      return (
                        <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700, fill: "#0f1b33" }}>
                          {p}
                        </text>
                      );
                    }}
                    labelLine={{ stroke: "#b0bec5", strokeWidth: 1 }}
                  >
                    {data.donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => millones(v)} />
                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 3. Cartera vencida por vendedor */}
            <div style={S.panel}>
              <h3 style={S.h3}>Vencida por vendedor (mill.)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.vend} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid horizontal={false} stroke="#eef2f8" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => "$" + v} />
                  <YAxis type="category" dataKey="vendedor" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                  <Bar dataKey="valor" fill="#00378a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Indicadores clave + Estado por cliente ── */}
        <div style={S.gridSide}>
          {/* Sidebar: Indicadores clave */}
          <div style={S.panel}>
            <h3 style={S.h3}>Indicadores clave</h3>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>Cartera difícil cobro</span>
              <b style={{ color: "#d23b3b" }}>{millones(k.dificil)}</b>
            </div>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>Clientes mora +90</span>
              <b style={{ color: "#d23b3b" }}>{num(k.clientesRiesgo)}</b>
            </div>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>Clientes en mora</span>
              <b>{num(k.clientesMora)}</b>
            </div>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>% clientes en mora</span>
              <b>{pct(k.clientesTotales ? (k.clientesMora / k.clientesTotales) * 100 : 0)}</b>
            </div>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>Acuerdos pendientes</span>
              <b style={{ color: "var(--amarillo)" }}>{num(acuPend)}</b>
            </div>
            <div style={S.indicador}>
              <span style={{ color: "#5b6b86" }}>Alertas activas</span>
              <b style={{ color: numAlertas > 0 ? "#d23b3b" : "#15a36b" }}>{num(numAlertas)}</b>
            </div>
            <div style={{ ...S.indicador, borderBottom: "none" }}>
              <span style={{ color: "#5b6b86" }}>Total documentos</span>
              <b>{num(filtrados.length)}</b>
            </div>
          </div>

          {/* Tabla: Estado de cartera por cliente */}
          <div style={{ ...S.panel, padding: 0, overflow: "hidden" }}>
            <h3 style={{ ...S.h3, padding: "18px 22px 0" }}>Estado de cartera por cliente</h3>
            <div className="tabla-wrap" style={{ maxHeight: 420 }}>
              <table className="data">
                <colgroup>
                  <col style={{ width: "26%" }} /><col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Nombre Cliente</th>
                    <th style={{ textAlign: "right" }}>Vigente</th>
                    <th style={{ textAlign: "right" }}>1–30</th>
                    <th style={{ textAlign: "right" }}>31–60</th>
                    <th style={{ textAlign: "right" }}>61–90</th>
                    <th style={{ textAlign: "right" }}>+90</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matriz.map((c) => (
                    <tr key={c.nit} onClick={() => setFCliente({ nit: c.nit, nombre: c.nombre || c.nit })} style={{ cursor: "pointer" }} title="Clic para filtrar por este cliente">
                      <td><b style={{ color: "var(--azul)" }}>{c.nombre || c.nit}</b><br /><span className="muted" style={{ fontSize: 11 }}>{c.nit}</span></td>
                      <td style={{ textAlign: "right" }}>{monto(c.buckets["Vigente"])}</td>
                      <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 1 a 30"])}</td>
                      <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 31 a 60"])}</td>
                      <td style={{ textAlign: "right" }}>{monto(c.buckets["Vencido 61 a 90"])}</td>
                      <td style={{ textAlign: "right", color: "#d23b3b", fontWeight: 700 }}>{monto(c.buckets["Vencido 91 >"])}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Top 10 difícil cobro + Tendencia ── */}
        <div style={S.grid2}>
          {/* Top 10 clientes por cartera difícil cobro */}
          <div style={{ ...S.panel, padding: 0, overflow: "hidden" }}>
            <h3 style={{ ...S.h3, padding: "18px 22px 0" }}>Top 10 clientes — cartera difícil cobro</h3>
            <div className="tabla-wrap" style={{ maxHeight: 360 }}>
              <table className="data">
                <colgroup>
                  <col style={{ width: "38%" }} /><col style={{ width: "22%" }} />
                  <col style={{ width: "22%" }} /><col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Nombre Cliente</th>
                    <th style={{ textAlign: "right" }}>Cartera Vencida</th>
                    <th style={{ textAlign: "right" }}>Difícil cobro (+90)</th>
                    <th style={{ textAlign: "right" }}>Días mora</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top10Dificil.map((c) => (
                    <tr key={c.nit} onClick={() => setFCliente({ nit: c.nit, nombre: c.nombre || c.nit })} style={{ cursor: "pointer" }} title="Clic para filtrar por este cliente">
                      <td><b style={{ color: "var(--azul)" }}>{c.nombre || c.nit}</b><br /><span className="muted" style={{ fontSize: 11 }}>{c.nit}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{pesos(c.vencido)}</td>
                      <td style={{ textAlign: "right", color: "#d23b3b", fontWeight: 700 }}>{pesos(c.buckets["Vencido 91 >"])}</td>
                      <td style={{ textAlign: "right" }}>{num(c.dias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.top10Dificil.length > 0 && (
              <div style={{ padding: "12px 22px", borderTop: "1px solid #eef2f7", fontSize: 13 }}>
                <span style={{ color: "#5b6b86" }}>Total difícil cobro: </span>
                <b style={{ color: "#d23b3b" }}>{millones(k.dificil)}</b>
              </div>
            )}
          </div>

          {/* Tendencia */}
          {mounted && (
            <div style={S.panel}>
              <h3 style={S.h3}>Tendencia de cartera (millones)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={tend} margin={{ left: 10, right: 16 }}>
                  <CartesianGrid stroke="#eef2f8" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + v} />
                  <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                  <Legend />
                  <Line type="monotone" dataKey="Total" stroke="#00378a" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Vencida" stroke="#d23b3b" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              {tend.length < 2 && <p className="muted" style={{ marginTop: 8 }}>La tendencia se dibuja a medida que cargues cartera cada día.</p>}
            </div>
          )}
        </div>

        <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>
          Datos de la carga: {new Date(carga.fecha_carga).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
          {carga.nombre_archivo ? ` · ${carga.nombre_archivo}` : ""}
        </p>
      </>
    );
  }

  return (
    <AppShell active="dashboard" titulo="Seguimiento en Cartera" subtitulo="Indicadores y análisis de cartera">
      {contenido}
    </AppShell>
  );
}
