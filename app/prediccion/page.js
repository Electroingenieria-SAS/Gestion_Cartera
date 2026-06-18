"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { supabase } from "../../lib/supabase";
import { calcularProbabilidad } from "../../lib/prediccion";
import { pesos, num } from "../../lib/format";
import { etapaCobranza, ETAPAS_ORDEN } from "../../lib/etapas";

export default function Prediccion() {
  const [estado, setEstado] = useState("cargando");
  const [lista, setLista] = useState([]);
  // Filtro por etapa de cobranza. null = todas.
  const [etapaSel, setEtapaSel] = useState(null);

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }

      const cli = {};
      for (const d of docs) {
        const k = d.nit;
        if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, total: 0, vencido: 0, dias: 0 };
        const s = Number(d.saldo) || 0;
        cli[k].total += s;
        if (d.categoria && d.categoria !== "Vigente") cli[k].vencido += s;
        cli[k].dias = Math.max(cli[k].dias, parseInt(d.dias_vencidos) || 0);
      }

      const { data: acu } = await supabase.from("acuerdos_pago").select("cliente_nit, estado");
      const cumplidos = {}, incumplidos = {};
      for (const a of acu || []) {
        if (a.estado === "Cumplido") cumplidos[a.cliente_nit] = (cumplidos[a.cliente_nit] || 0) + 1;
        if (a.estado === "Incumplido") incumplidos[a.cliente_nit] = (incumplidos[a.cliente_nit] || 0) + 1;
      }

      // Última gestión por cliente, GUARDANDO su resultado.
      const { data: gest } = await supabase.from("gestiones").select("cliente_nit, fecha, resultado");
      const ultima = {}, ultimoResultado = {};
      for (const g of gest || []) {
        if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) {
          ultima[g.cliente_nit] = g.fecha;
          ultimoResultado[g.cliente_nit] = g.resultado;
        }
      }

      const filas = Object.values(cli).map((c) => {
        const pred = calcularProbabilidad({
          diasMora: c.dias,
          pctVencida: c.total > 0 ? c.vencido / c.total : 0,
          cumplidos: cumplidos[c.nit] || 0,
          incumplidos: incumplidos[c.nit] || 0,
          ultimoResultado: ultimoResultado[c.nit] || null,
        });
        const etapa = etapaCobranza(c.dias);
        return { ...c, ...pred, etapa };
      });

      filas.sort((a, b) => a.prob - b.prob);
      setLista(filas);
      setEstado("ok");
    })();
  }, []);

  // Resumen por etapa: cuántos clientes y % promedio de probabilidad de pago.
  const resumenEtapas = useMemo(() => {
    const r = {};
    ETAPAS_ORDEN.forEach((e) => { r[e.id] = { etapa: e, count: 0, sumaProb: 0, vencido: 0 }; });
    for (const f of lista) {
      r[f.etapa.id].count += 1;
      r[f.etapa.id].sumaProb += f.prob;
      r[f.etapa.id].vencido += f.vencido;
    }
    // Calcular probabilidad promedio por etapa.
    ETAPAS_ORDEN.forEach((e) => {
      const x = r[e.id];
      x.probProm = x.count > 0 ? Math.round(x.sumaProb / x.count) : 0;
    });
    return r;
  }, [lista]);

  // Lista filtrada por etapa (si la hay).
  const mostradas = etapaSel ? lista.filter((f) => f.etapa.id === etapaSel) : lista;

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Analizando clientes…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">✦</div>
        <h2>Aún no hay cartera cargada</h2>
        <p>Sube tu archivo de Siesa para generar las predicciones.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    const c = { Bajo: 0, Medio: 0, Alto: 0, Crítico: 0 };
    mostradas.forEach((f) => c[f.nivel]++);
    contenido = (
      <>
        <div className="pred-explica">
          <b>¿Cómo se calcula?</b> La probabilidad parte de ~88% y se ajusta así: <b>baja</b> con más días de mora
          y mayor % del saldo vencido; <b>sube</b> con cada promesa cumplida; <b>baja fuerte</b> con cada promesa
          incumplida; y según la última gestión (un "compromiso" o "contactado" suma, un "no contesta" o "número
          errado" resta). Riesgo: Bajo ≥70% · Medio 45–69% · Alto 25–44% · Crítico &lt;25%.
        </div>

        {/* === Resumen por etapa de cobranza === */}
        <div className="etapas-resumen">
          {ETAPAS_ORDEN.map((e) => {
            const r = resumenEtapas[e.id];
            const activo = etapaSel === e.id;
            return (
              <button
                key={e.id}
                className={`etapa-card ${activo ? "on" : ""}`}
                style={{ borderColor: e.color, background: activo ? e.bg : "var(--blanco)" }}
                onClick={() => setEtapaSel(activo ? null : e.id)}
                title={e.descripcion}
              >
                <span className="etapa-dot" style={{ background: e.color }} />
                <div className="etapa-info">
                  <strong>{e.label}</strong>
                  <span className="etapa-rango">{e.descripcion}</span>
                </div>
                <div className="etapa-cifras">
                  <b style={{ color: e.color }}>{r.count}</b>
                  <span className="muted">Prob. prom. {r.probProm}%</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="filtros" style={{ marginTop: 14 }}>
          {etapaSel && (
            <button className="btn-ghost-light" onClick={() => setEtapaSel(null)}>
              Quitar filtro de etapa
            </button>
          )}
          <span className="muted" style={{ alignSelf: "center" }}>Mostrando {mostradas.length} clientes</span>
        </div>

        <div className="pred-resumen" style={{ marginTop: 12 }}>
          <span style={{ color: "var(--rojo)" }}><b>{c["Crítico"]}</b> crítico</span>
          <span style={{ color: "var(--amarillo)" }}><b>{c["Alto"]}</b> alto</span>
          <span style={{ color: "var(--azul)" }}><b>{c["Medio"]}</b> medio</span>
          <span style={{ color: "var(--verde)" }}><b>{c["Bajo"]}</b> bajo</span>
        </div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "22%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "7%" }} />
                <col style={{ width: "15%" }} /><col style={{ width: "10%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Etapa</th>
                  <th style={{ textAlign: "right" }}>Vencido</th>
                  <th style={{ textAlign: "right" }}>Mora</th>
                  <th>Prob. de pago</th>
                  <th>Riesgo</th>
                  <th>Recomendación</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((f) => (
                  <tr key={f.nit}>
                    <td><b>{f.nombre || f.nit}</b><br /><span className="muted">{f.nit}</span></td>
                    <td>
                      <span className="pill" style={{ background: f.etapa.bg, color: f.etapa.color }}>
                        {f.etapa.label}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{pesos(f.vencido)}</td>
                    <td style={{ textAlign: "right" }}>{f.dias}d</td>
                    <td>
                      <div className="prob-row">
                        <span style={{ color: f.color, fontWeight: 800 }}>{f.prob}%</span>
                        <div className="prob-bar"><i style={{ width: `${f.prob}%`, background: f.color }} /></div>
                      </div>
                    </td>
                    <td><span className="pill" style={{ background: f.color + "22", color: f.color }}>{f.nivel}</span></td>
                    <td className="muted">{f.recomendacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  return (
    <AppShell active="prediccion" titulo="Predicción de pago (IA)" subtitulo="Probabilidad de pago y riesgo por cliente">
      {contenido}
    </AppShell>
  );
}
