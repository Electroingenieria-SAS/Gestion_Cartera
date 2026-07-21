"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { getCargaActual } from "../../lib/cartera";
import { getPerfil } from "../../lib/auth";
import { millones, num, pct, pesos } from "../../lib/format";
import {
  getPeriodos, getTasasEmpiricas, getCumplimientoAcuerdos,
  recalcularHistorico, agruparPorSemana,
} from "../../lib/recaudo";
import { resolverTasas, calcularPronostico } from "../../lib/pronostico";
import { exportarExcelEstilizado, hoyISO } from "../../lib/exportar";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";

const S = {
  panel: {
    background: "#fff", border: "1px solid #e3e9f4", borderRadius: 16,
    padding: "20px 22px", boxShadow: "0 10px 30px rgba(0,55,138,0.06)",
  },
  h3: {
    fontSize: 13, fontWeight: 700, color: "#0f1b33", marginBottom: 14,
    textTransform: "uppercase", letterSpacing: ".4px",
  },
  label: {
    fontSize: 11, fontWeight: 700, color: "#5b6b86",
    textTransform: "uppercase", letterSpacing: ".6px",
  },
};

function Insignia({ origen }) {
  const medido = origen === "medido";
  return (
    <span
      title={medido
        ? "Tasa calculada con el recaudo real medido en tu propia cartera"
        : "Supuesto configurado en business_rules/forecast_rules.json"}
      style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px",
        padding: "2px 7px", borderRadius: 5,
        background: medido ? "#eaf6ef" : "#eef2f8",
        color: medido ? "#15a36b" : "#5b6b86",
      }}
    >
      {medido ? "medido" : "supuesto"}
    </span>
  );
}

export default function Pronostico() {
  const [estado, setEstado] = useState("cargando");
  const [pron, setPron] = useState(null);
  const [config, setConfig] = useState(null);
  const [semanas, setSemanas] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [rol, setRol] = useState("consulta");
  const [recalculando, setRecalculando] = useState(false);
  const [aviso, setAviso] = useState(null);

  async function cargarTodo() {
    const perfil = await getPerfil();
    setRol(perfil?.rol || "consulta");

    const { carga, docs } = await getCargaActual();
    if (!carga) { setEstado("vacio"); return; }

    const [tasasEmp, cumpl, per] = await Promise.all([
      getTasasEmpiricas(),
      getCumplimientoAcuerdos(),
      getPeriodos(),
    ]);

    const { data: acu } = await supabase
      .from("acuerdos_pago")
      .select("cliente_nit, fecha_compromiso, valor_comprometido")
      .eq("estado", "Pendiente");

    const cfg = resolverTasas(tasasEmp, cumpl);
    setConfig({ ...cfg, cumplimiento: cumpl });
    setPron(calcularPronostico({ docs, acuerdos: acu || [], config: cfg }));
    setPeriodos(per);
    setSemanas(agruparPorSemana(per));
    setEstado("ok");
  }

  useEffect(() => { cargarTodo().catch(() => setEstado("error")); }, []);

  async function recalcular() {
    setRecalculando(true);
    setAviso(null);
    try {
      const n = await recalcularHistorico();
      setAviso({ tipo: "ok", txt: `Histórico recalculado: ${n} periodo${n === 1 ? "" : "s"} medido${n === 1 ? "" : "s"}.` });
      await cargarTodo();
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error al recalcular: " + (err?.message || "desconocido") + ". ¿Ya ejecutaste el script 07 en Supabase?" });
    } finally {
      setRecalculando(false);
    }
  }

  async function exportar() {
    if (!pron) return;
    const columnas = [
      { header: "Concepto", key: "concepto", width: 34, bold: true },
      { header: "Base", key: "base", width: 20, formato: "moneda" },
      { header: "Tasa aplicada", key: "tasa", width: 16 },
      { header: "Origen de la tasa", key: "origen", width: 18 },
      { header: "Recaudo esperado", key: "esperado", width: 22, formato: "moneda" },
    ];

    const filas = [];
    for (const b of pron.bolsas) {
      filas.push({
        concepto: b.titulo,
        base: b.base,
        tasa: pct(b.tasa * 100),
        origen: b.origen === "medido" ? "Medido" : b.origen === "mixto" ? "Mixto" : "Supuesto",
        esperado: b.esperado,
      });
      for (const d of b.detalle || []) {
        filas.push({
          concepto: "    " + d.categoria,
          base: d.base,
          tasa: pct(d.tasa * 100),
          origen: config?.origen?.[d.categoria] === "medido" ? "Medido" : "Supuesto",
          esperado: d.esperado,
        });
      }
    }

    const f = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    await exportarExcelEstilizado(`PronosticoRecaudo_${hoyISO()}`, filas, columnas, {
      nombreHoja: "Pronóstico",
      titulo: "Pronóstico de Recaudo — Electroingeniería S.A.S.",
      subtitulo: `Ventana del ${f(pron.desde)} al ${f(pron.hasta)}  ·  Esperado ${pesos(Math.round(pron.esperado))} (rango ${pesos(Math.round(pron.minimo))} – ${pesos(Math.round(pron.maximo))})`,
    });
  }

  // ── Estados de carga ──
  if (estado === "cargando") {
    return (
      <AppShell active="pronostico" titulo="Pronóstico de recaudo" subtitulo="Cuánto se espera recaudar esta semana">
        <p className="muted">Calculando el pronóstico…</p>
      </AppShell>
    );
  }

  if (estado === "vacio") {
    return (
      <AppShell active="pronostico" titulo="Pronóstico de recaudo" subtitulo="Cuánto se espera recaudar esta semana">
        <div className="empty">
          <div className="empty-ico">◷</div>
          <h2>Aún no hay cartera cargada</h2>
          <p>Sube tu archivo de Siesa para generar el pronóstico.</p>
          <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
        </div>
      </AppShell>
    );
  }

  if (estado === "error" || !pron) {
    return (
      <AppShell active="pronostico" titulo="Pronóstico de recaudo" subtitulo="Cuánto se espera recaudar esta semana">
        <div className="upload-msg error">
          No se pudo calcular el pronóstico. Verifica que ejecutaste el script
          <code> database/07_recaudo_medicion.sql </code> en Supabase.
        </div>
      </AppShell>
    );
  }

  const f = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const madurez = config?.madurez || "inicial";

  // Datos de la gráfica: semanas medidas + la semana pronosticada
  const datosGrafica = semanas.slice(-8).map((s) => ({
    semana: s.etiqueta,
    Recaudado: Math.round(s.recaudo / 1e6),
    tipo: "real",
  }));
  datosGrafica.push({
    semana: "Esta semana",
    Esperado: Math.round(pron.esperado / 1e6),
    tipo: "pronostico",
  });

  const ultimaSemana = semanas.length ? semanas[semanas.length - 1] : null;

  return (
    <AppShell
      active="pronostico"
      titulo="Pronóstico de recaudo"
      subtitulo={`Ventana del ${f(pron.desde)} al ${f(pron.hasta)}`}
    >
      {/* ── Aviso de madurez del modelo ── */}
      {madurez !== "medido" && (
        <div
          style={{
            background: "#eef6ff", border: "1px solid #cfe2fb", borderLeft: "5px solid #00378a",
            borderRadius: 12, padding: "13px 18px", marginBottom: 16, fontSize: 13, color: "#1f2a44",
          }}
        >
          <b>El modelo todavía está aprendiendo.</b> Lleva{" "}
          <b>{config.periodosMedidos}</b> periodo{config.periodosMedidos === 1 ? "" : "s"} de recaudo medido
          {config.acuerdosCerrados > 0 && <> y <b>{config.acuerdosCerrados}</b> acuerdo{config.acuerdosCerrados === 1 ? "" : "s"} cerrado{config.acuerdosCerrados === 1 ? "" : "s"}</>}.
          Las tasas marcadas como <i>supuesto</i> salen de{" "}
          <code>business_rules/forecast_rules.json</code>; las marcadas como <i>medido</i> ya salen
          de tu propia cartera. Entre más días se cargue el archivo, más preciso será el rango.
        </div>
      )}

      {aviso && <div className={`upload-msg ${aviso.tipo === "ok" ? "listo" : "error"}`} style={{ marginBottom: 14 }}>{aviso.txt}</div>}

      {/* ── EL NÚMERO ── */}
      <div style={{ ...S.panel, borderTop: "4px solid #15a36b", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={S.label}>Recaudo esperado · próximos {pron.ventana} días</div>
            <div style={{ fontSize: 42, fontWeight: 800, color: "#15a36b", lineHeight: 1.15, marginTop: 6 }}>
              {millones(pron.minimo)} – {millones(pron.maximo)}
            </div>
            <div style={{ fontSize: 13, color: "#5b6b86", marginTop: 6 }}>
              Valor central <b>{pesos(Math.round(pron.esperado))}</b> · margen de ±{Math.round(pron.banda * 100)}%
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost-light" onClick={exportar}>Exportar Excel</button>
            {rol !== "consulta" && (
              <button className="btn-ghost-light" onClick={recalcular} disabled={recalculando}>
                {recalculando ? "Recalculando…" : "Recalcular histórico"}
              </button>
            )}
          </div>
        </div>

        {/* Marcador: cómo nos fue la semana pasada */}
        {ultimaSemana && (
          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef2f7",
            fontSize: 13, color: "#5b6b86",
          }}>
            Semana anterior ({ultimaSemana.etiqueta}): recaudo real medido de{" "}
            <b style={{ color: "#0f1b33" }}>{pesos(Math.round(ultimaSemana.recaudo))}</b>
            {ultimaSemana.facturacion > 0 && (
              <> · facturación nueva {pesos(Math.round(ultimaSemana.facturacion))}</>
            )}
          </div>
        )}
      </div>

      {/* ── LAS TRES BOLSAS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
        {pron.bolsas.map((b) => (
          <div key={b.id} style={{ ...S.panel, borderTop: `4px solid ${b.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={S.label}>{b.titulo}</div>
              {b.origen !== "mixto" && <Insignia origen={b.origen} />}
            </div>

            <div style={{ fontSize: 24, fontWeight: 800, color: b.color, marginTop: 8 }}>
              {millones(b.esperado)}
            </div>

            <div style={{ fontSize: 12, color: "#5b6b86", marginTop: 6, lineHeight: 1.5 }}>
              De <b>{millones(b.base)}</b> en cartera<br />
              se espera recuperar el <b>{pct(b.tasa * 100)}</b>
            </div>

            <div style={{ fontSize: 11.5, color: "#8a97ad", marginTop: 8, borderTop: "1px solid #eef2f7", paddingTop: 8 }}>
              {b.descripcion}
            </div>

            {/* Desglose por rango de mora */}
            {b.detalle && b.detalle.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {b.detalle.map((d) => (
                  <div key={d.categoria} style={{
                    display: "flex", justifyContent: "space-between", gap: 8,
                    fontSize: 11.5, padding: "5px 0", borderTop: "1px solid #f4f7fb",
                  }}>
                    <span style={{ color: "#5b6b86" }}>{d.categoria}</span>
                    <span style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: "#8a97ad" }}>{pct(d.tasa * 100)}</span>{" "}
                      <b>{millones(d.esperado)}</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── HISTÓRICO MEDIDO vs PRONÓSTICO ── */}
      <div style={{ ...S.panel, marginBottom: 16 }}>
        <div style={S.h3}>Recaudo real medido por semana (millones)</div>
        {semanas.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: 8 }}>
              Todavía no hay recaudo medido.
            </p>
            <p className="muted" style={{ fontSize: 12.5, maxWidth: 560, margin: "0 auto" }}>
              El sistema mide el recaudo comparando la carga de un día contra la del día anterior.
              Necesita al menos dos cargas para empezar. Si ya tienes varias, usa el botón
              <b> Recalcular histórico</b>.
            </p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={datosGrafica} margin={{ left: 10, right: 16, top: 10 }}>
                <CartesianGrid stroke="#eef2f8" vertical={false} />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + v} />
                <Tooltip formatter={(v) => "$" + num(v) + " M"} />
                <Legend />
                <Bar dataKey="Recaudado" fill="#00378a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Esperado" fill="#15a36b" radius={[6, 6, 0, 0]} />
                <ReferenceLine y={0} stroke="#d8deea" />
              </BarChart>
            </ResponsiveContainer>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Azul: plata que realmente entró, medida documento por documento entre cargas.
              Verde: lo que el modelo espera para la ventana actual.
            </p>
          </>
        )}
      </div>

      {/* ── PIPELINE DE LA AUXILIAR ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.panel}>
          <div style={S.h3}>Gestión de la auxiliar</div>
          <p style={{ fontSize: 12.5, color: "#5b6b86", marginBottom: 12, lineHeight: 1.5 }}>
            La auxiliar no controla si el cliente paga; sí controla cuántos compromisos logra pactar.
            Esto mide lo segundo.
          </p>
          {[
            ["Compromisos vigentes", pron.contexto.acuerdosVentana.length, "#00378a"],
            ["Valor comprometido", pesos(Math.round(pron.bolsas[0].base)), "#15a36b"],
            ["Acuerdos ya cerrados", config?.acuerdosCerrados ?? 0, "#5b6b86"],
            ["Tasa de cumplimiento", config?.cumplimiento?.tasa_cumplimiento != null
              ? pct(Number(config.cumplimiento.tasa_cumplimiento) * 100) : "—", "#d9a400"],
          ].map(([k, v, c]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between",
              padding: "11px 0", borderBottom: "1px solid #eef2f7", fontSize: 13,
            }}>
              <span style={{ color: "#5b6b86" }}>{k}</span>
              <b style={{ color: c }}>{v}</b>
            </div>
          ))}
          <Link href="/acuerdos" className="btn-mini" style={{ marginTop: 14, display: "inline-block" }}>
            Ver acuerdos
          </Link>
        </div>

        <div style={S.panel}>
          <div style={S.h3}>Cómo se calcula</div>
          <p style={{ fontSize: 12.5, color: "#5b6b86", lineHeight: 1.6 }}>
            El pronóstico suma tres bolsas independientes. A cada una se le aplica su propia
            tasa de recuperación:
          </p>
          <ol style={{ fontSize: 12.5, color: "#5b6b86", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
            <li><b>Compromisos pactados</b> — lo que el cliente prometió por escrito. Es la bolsa de mayor confianza.</li>
            <li><b>Facturas por vencer</b> — clientes al día cuya factura vence dentro de la ventana.</li>
            <li><b>Cartera vencida</b> — lo que se recupera con gestión, con una tasa distinta por cada rango de mora.</li>
          </ol>
          <p style={{ fontSize: 12.5, color: "#5b6b86", lineHeight: 1.6, marginTop: 10 }}>
            Un cliente con compromiso vigente <b>no se cuenta dos veces</b>: su cartera sale de las
            bolsas 2 y 3 para no inflar el resultado
            ({millones(pron.contexto.baseExcluidaPorAcuerdo)} excluidos por esta regla).
          </p>
          <p style={{ fontSize: 12, color: "#8a97ad", marginTop: 10, borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
            Los supuestos se ajustan en <code>business_rules/forecast_rules.json</code> sin tocar código.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
