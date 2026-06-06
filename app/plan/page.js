"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { supabase } from "../../lib/supabase";
import { calcularScore, nivelPrioridad } from "../../lib/scoring";
import { pesos, num } from "../../lib/format";

export default function PlanDiario() {
  const router = useRouter();
  const [estado, setEstado] = useState("cargando");
  const [lista, setLista] = useState([]);

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }

      // Agregamos por cliente.
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

      // Última gestión por cliente.
      const { data: gest } = await supabase.from("gestiones").select("cliente_nit, fecha");
      const ultima = {};
      for (const g of gest || []) {
        if (!ultima[g.cliente_nit] || new Date(g.fecha) > new Date(ultima[g.cliente_nit])) ultima[g.cliente_nit] = g.fecha;
      }

      // Promesas incumplidas por cliente.
      const { data: inc } = await supabase.from("acuerdos_pago").select("cliente_nit").eq("estado", "Incumplido");
      const promInc = {};
      for (const a of inc || []) promInc[a.cliente_nit] = (promInc[a.cliente_nit] || 0) + 1;

      // Calculamos el Score de cada cliente.
      const filas = Object.values(cli).map((c) => {
        const diasSinGestion = ultima[c.nit] ? Math.floor((Date.now() - new Date(ultima[c.nit])) / 86400000) : 9999;
        const score = calcularScore({
          diasMora: c.dias,
          valorVencido: c.vencido,
          diasSinGestion,
          promesasIncumplidas: promInc[c.nit] || 0,
        });
        return { ...c, ultima: ultima[c.nit] || null, score, prio: nivelPrioridad(score) };
      });

      filas.sort((a, b) => b.score - a.score);
      setLista(filas);
      setEstado("ok");
    })();
  }, []);

  const aGestionar = lista.filter((f) => f.score >= 40).length;

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
          Hoy debes gestionar prioritariamente <b>{aGestionar}</b> clientes (prioridad alta o crítica).
        </div>
        <div className="panel" style={{ padding: 0, overflow: "hidden", marginTop: 16 }}>
          <div className="tabla-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th><th>Cliente</th>
                  <th style={{ textAlign: "right" }}>Valor vencido</th>
                  <th style={{ textAlign: "right" }}>Días mora</th>
                  <th>Última gestión</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  <th>Prioridad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f, i) => (
                  <tr key={f.nit}>
                    <td>{i + 1}</td>
                    <td><b>{f.nombre || f.nit}</b><br /><span className="muted">{f.nit} · {f.ciudad || "—"}</span></td>
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
