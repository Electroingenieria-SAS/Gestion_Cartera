"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { supabase } from "../../lib/supabase";
import { calcularScore, nivelPrioridad } from "../../lib/scoring";
import { pesos, num } from "../../lib/format";
import { exportarExcelEstilizado, exportarPDF, hoyISO } from "../../lib/exportar";
import { etapaCobranza, ETAPAS_ORDEN } from "../../lib/etapas";

export default function PlanDiario() {
  const [estado, setEstado] = useState("cargando");
  const [lista, setLista] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [etapaSel, setEtapaSel] = useState(null);

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }

      const cli = {};
      for (const d of docs) {
        const k = d.nit;
        if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0, dias: 0 };
        const c = cli[k];
        const s = Number(d.saldo) || 0;
        c.total += s;
        if (d.categoria && d.categoria !== "Vigente") c.vencido += s;
        c.dias = Math.max(c.dias, parseInt(d.dias_vencidos) || 0);
      }

      const { data: gest } = await supabase.from("gestiones").select("cliente_nit, fecha");
      const ultima = {};
      for (const g of gest || []) {
        if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) ultima[g.cliente_nit] = g.fecha;
      }

      const { data: inc } = await supabase.from("acuerdos_pago").select("cliente_nit").eq("estado", "Incumplido");
      const promInc = {};
      for (const a of inc || []) promInc[a.cliente_nit] = (promInc[a.cliente_nit] || 0) + 1;

      const filas = Object.values(cli).map((c) => {
        const diasSinGestion = ultima[c.nit] ? Math.floor((Date.now() - new Date(ultima[c.nit])) / 86400000) : 9999;
        const score = calcularScore({ diasMora: c.dias, valorVencido: c.vencido, diasSinGestion, promesasIncumplidas: promInc[c.nit] || 0 });
        const etapa = etapaCobranza(c.dias);
        return { ...c, ultima: ultima[c.nit] || null, score, prio: nivelPrioridad(score), etapa };
      });

      filas.sort((a, b) => b.score - a.score);
      setLista(filas);
      setEstado("ok");
    })();
  }, []);

  const resumenEtapas = useMemo(() => {
    const r = {};
    ETAPAS_ORDEN.forEach((e) => { r[e.id] = { etapa: e, count: 0, vencido: 0 }; });
    for (const f of lista) { r[f.etapa.id].count += 1; r[f.etapa.id].vencido += f.vencido; }
    return r;
  }, [lista]);

  const prioritarios = lista.filter((f) => f.score >= 40);
  let mostradas = verTodos ? lista : prioritarios;
  if (etapaSel) mostradas = mostradas.filter((f) => f.etapa.id === etapaSel);

  async function exportarAExcel() {
    const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const columnas = [
      { header: "#",               key: "n",       width: 6,  formato: "numero" },
      { header: "Cliente",         key: "cliente", width: 34, bold: true },
      { header: "NIT",             key: "nit",     width: 14 },
      { header: "Ciudad",          key: "ciudad",  width: 16 },
      { header: "Vendedor",        key: "vendedor", width: 22 },
      { header: "Etapa",           key: "etapa",   width: 16 },
      { header: "Valor vencido",   key: "vencido", width: 20, formato: "moneda" },
      { header: "Días mora",       key: "dias",    width: 12, formato: "numero" },
      { header: "Última gestión",  key: "ultima",  width: 16 },
      { header: "Score",           key: "score",   width: 10, formato: "numero" },
      { header: "Prioridad",       key: "prio",    width: 14 },
    ];

    const filas = mostradas.map((f, i) => ({
      n: i + 1,
      cliente: f.nombre || f.nit,
      nit: f.nit,
      ciudad: f.ciudad || "",
      vendedor: f.vendedor || "",
      etapa: f.etapa.label,
      vencido: Number(f.vencido) || 0,
      dias: f.dias,
      ultima: f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : "Nunca",
      score: f.score,
      prio: f.prio.label,
    }));

    await exportarExcelEstilizado(`PlanDiario_${hoyISO()}`, filas, columnas, {
      nombreHoja: "Plan diario",
      titulo: "Plan Diario de Cobranza — Electroingeniería S.A.S.",
      subtitulo: `${fechaHoy}  ·  ${mostradas.length} clientes  ·  Generado desde Gestión de Cartera`,
    });
  }

  function exportarAPDF() {
    const columnas = [
      { header: "#", key: "n" }, { header: "Cliente", key: "cliente" }, { header: "NIT", key: "nit" },
      { header: "Etapa", key: "etapa" },
      { header: "Valor vencido", key: "vencido" }, { header: "Días", key: "dias" },
      { header: "Última gestión", key: "ultima" }, { header: "Score", key: "score" }, { header: "Prioridad", key: "prio" },
    ];
    const filas = mostradas.map((f, i) => ({
      n: i + 1, cliente: f.nombre || f.nit, nit: f.nit, etapa: f.etapa.label,
      vencido: pesos(f.vencido), dias: f.dias,
      ultima: f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : "Nunca", score: f.score, prio: f.prio.label,
    }));
    exportarPDF("Plan diario", `${mostradas.length} clientes · ${new Date().toLocaleDateString("es-CO")}`, columnas, filas);
  }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Calculando prioridades…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">◎</div>
        <h2>Aún no hay cartera cargada</h2>
        <p>Sube tu archivo de Siesa para generar el plan diario.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="plan-banner">
          Hoy debes gestionar prioritariamente <b>{prioritarios.length}</b> clientes (prioridad alta o crítica).
        </div>

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
                  <span className="muted">{pesos(r.vencido)}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pred-explica" style={{ marginTop: 14 }}>
          <b>¿Cómo se calcula el Score?</b> Combina 4 factores, cada uno llevado a una escala de 0 a 100 y luego
          ponderado: <b>40%</b> días de mora · <b>30%</b> valor adeudado · <b>20%</b> días sin gestión ·
          <b> 10%</b> promesas incumplidas. Prioridad: Crítica ≥66 · Alta 40–65 · Media 20–39 · Baja &lt;20.
          Los pesos son configurables en <code>business_rules/priority_rules.json</code>.
        </div>

        <div className="filtros" style={{ marginTop: 14 }}>
          <button className="btn-ghost-light" onClick={() => setVerTodos(!verTodos)}>
            {verTodos ? "Ver solo prioritarios" : `Ver todos (${lista.length})`}
          </button>
          {etapaSel && (
            <button className="btn-ghost-light" onClick={() => setEtapaSel(null)}>
              Quitar filtro de etapa
            </button>
          )}
          <button className="btn-ghost-light" onClick={exportarAExcel}>Exportar Excel</button>
          <button className="btn-ghost-light" onClick={exportarAPDF}>Exportar PDF</button>
          <Link href="/gestion-masiva" className="btn-ghost-light" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>Gestión masiva (circular)</Link>
          <span className="muted" style={{ alignSelf: "center" }}>Mostrando {mostradas.length} clientes</span>
        </div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "4%" }} /><col style={{ width: "25%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "7%" }} /><col style={{ width: "11%" }} />
                <col style={{ width: "7%" }} /><col style={{ width: "11%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Cliente</th>
                  <th>Etapa</th>
                  <th style={{ textAlign: "right" }}>Valor vencido</th>
                  <th style={{ textAlign: "right" }}>Días mora</th>
                  <th>Última gestión</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th>Prioridad</th><th></th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((f, i) => (
                  <tr key={f.nit}>
                    <td>{i + 1}</td>
                    <td><b>{f.nombre || f.nit}</b><br /><span className="muted">{f.nit} · {f.ciudad || "—"}</span></td>
                    <td>
                      <span className="pill" style={{ background: f.etapa.bg, color: f.etapa.color }}>
                        {f.etapa.label}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{pesos(f.vencido)}</td>
                    <td style={{ textAlign: "right" }}>{f.dias}</td>
                    <td>{f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : <span className="muted">Nunca</span>}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: f.prio.color }}>{f.score}</td>
                    <td><span className="pill" style={{ background: f.prio.color + "22", color: f.prio.color }}>{f.prio.label}</span></td>
                    <td><Link href={`/cliente/${encodeURIComponent(f.nit)}`} className="btn-mini">Gestionar</Link></td>
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
    <AppShell active="plan" titulo="Plan diario" subtitulo="Clientes ordenados por prioridad de cobro">
      {contenido}
    </AppShell>
  );
}
