"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { getPerfil, esSoloLectura } from "../../lib/auth";
import { pesos, num } from "../../lib/format";

const ESTADO_COLOR = {
  Pendiente: "var(--amarillo)", Cumplido: "var(--verde)",
  Incumplido: "var(--rojo)", Reprogramado: "var(--azul)",
};

export default function Acuerdos() {
  const [estado, setEstado] = useState("cargando");
  const [acuerdos, setAcuerdos] = useState([]);
  const [filtro, setFiltro] = useState("Pendiente");
  const [soloLectura, setSoloLectura] = useState(false);

  // Estado para reprogramar: { id, fecha }
  const [reprog, setReprog] = useState(null);
  const [reprogGuardando, setReprogGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    getPerfil().then((p) => setSoloLectura(esSoloLectura(p?.rol))).catch(() => {});
  }, []);

  async function cargar() {
    const { data: acu } = await supabase.from("acuerdos_pago").select("*").order("fecha_compromiso", { ascending: true });
    const lista = acu || [];
    const nits = [...new Set(lista.map((a) => a.cliente_nit))];
    const nombres = {};
    if (nits.length) {
      const { data: cli } = await supabase.from("clientes").select("nit, nombre").in("nit", nits);
      for (const c of cli || []) nombres[c.nit] = c.nombre;
    }
    setAcuerdos(lista.map((a) => ({ ...a, nombre: nombres[a.cliente_nit] || a.cliente_nit })));
    setEstado("ok");
  }

  useEffect(() => { cargar(); }, []);

  async function cambiarEstado(id, nuevo) {
    if (soloLectura) return;
    setAviso(null);

    // Si el nuevo estado es "Reprogramado", abrir el campo de fecha en vez de cambiar directo
    if (nuevo === "Reprogramado") {
      // Pre-llenar con la fecha actual del acuerdo + 7 días
      const acu = acuerdos.find((a) => a.id === id);
      let fechaSugerida = "";
      if (acu?.fecha_compromiso) {
        const d = new Date(acu.fecha_compromiso + "T00:00:00");
        d.setDate(d.getDate() + 7);
        fechaSugerida = d.toISOString().slice(0, 10);
      }
      setReprog({ id, fecha: fechaSugerida });
      return;
    }

    await supabase.from("acuerdos_pago").update({ estado: nuevo }).eq("id", id);
    await cargar();
  }

  async function confirmarReprogramacion() {
    if (!reprog || !reprog.fecha || reprogGuardando) return;
    setReprogGuardando(true);
    setAviso(null);

    const hoy = new Date().toISOString().slice(0, 10);
    if (reprog.fecha <= hoy) {
      setAviso({ tipo: "error", txt: "La nueva fecha debe ser posterior a hoy." });
      setReprogGuardando(false);
      return;
    }

    try {
      // 1. Marcar el acuerdo actual como "Reprogramado"
      await supabase.from("acuerdos_pago").update({ estado: "Reprogramado" }).eq("id", reprog.id);

      // 2. Crear un nuevo acuerdo con la fecha nueva y el mismo valor
      const original = acuerdos.find((a) => a.id === reprog.id);
      if (original) {
        await supabase.from("acuerdos_pago").insert({
          cliente_nit: original.cliente_nit,
          gestion_id: original.gestion_id,
          fecha_compromiso: reprog.fecha,
          valor_comprometido: original.valor_comprometido,
          estado: "Pendiente",
        });
      }

      setReprog(null);
      setAviso({ tipo: "ok", txt: `Acuerdo reprogramado para el ${new Date(reprog.fecha + "T00:00:00").toLocaleDateString("es-CO")}.` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error al reprogramar: " + (err?.message || "desconocido") });
    } finally {
      setReprogGuardando(false);
    }
  }

  function cancelarReprogramacion() {
    setReprog(null);
  }

  const filtrados = filtro === "Todos" ? acuerdos : acuerdos.filter((a) => a.estado === filtro);

  // Resumen rápido
  const pendientes = acuerdos.filter((a) => a.estado === "Pendiente").length;
  const cumplidos = acuerdos.filter((a) => a.estado === "Cumplido").length;
  const incumplidos = acuerdos.filter((a) => a.estado === "Incumplido").length;

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando acuerdos…</p>;
  } else if (acuerdos.length === 0) {
    contenido = (
      <div className="empty">
        <div className="empty-ico">✓</div>
        <h2>Aún no hay acuerdos de pago</h2>
        <p>Los acuerdos se crean al registrar un "Compromiso de pago" en la gestión de un cliente.</p>
        <Link href="/plan" className="btn btn-primary">Ir al plan diario</Link>
      </div>
    );
  } else {
    contenido = (
      <>
        {/* Resumen de estados */}
        <div className="pred-resumen" style={{ marginBottom: 14 }}>
          <span style={{ color: "var(--amarillo)" }}><b>{pendientes}</b> pendientes</span>
          <span style={{ color: "var(--verde)" }}><b>{cumplidos}</b> cumplidos</span>
          <span style={{ color: "var(--rojo)" }}><b>{incumplidos}</b> incumplidos</span>
        </div>

        <div className="filtros">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {["Pendiente", "Cumplido", "Incumplido", "Reprogramado", "Todos"].map((e) => <option key={e}>{e}</option>)}
          </select>
          <span className="muted" style={{ alignSelf: "center" }}>{num(filtrados.length)} acuerdos</span>
        </div>

        {aviso && <div className={`upload-msg ${aviso.tipo === "ok" ? "listo" : "error"}`} style={{ marginBottom: 14 }}>{aviso.txt}</div>}

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "24%" }} /><col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "36%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th><th>Fecha compromiso</th>
                  <th style={{ textAlign: "right" }}>Valor</th><th>Estado</th><th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => {
                  const esReprogActivo = reprog && reprog.id === a.id;
                  return (
                    <tr key={a.id} style={esReprogActivo ? { background: "#eef6ff" } : undefined}>
                      <td>
                        <Link href={`/cliente/${encodeURIComponent(a.cliente_nit)}`} style={{ color: "var(--azul)" }}>
                          <b>{a.nombre}</b>
                        </Link>
                        <br /><span className="muted">{a.cliente_nit}</span>
                      </td>
                      <td>{new Date(a.fecha_compromiso + "T00:00:00").toLocaleDateString("es-CO")}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(a.valor_comprometido)}</td>
                      <td><span className="pill" style={{ background: ESTADO_COLOR[a.estado] + "22", color: ESTADO_COLOR[a.estado] }}>{a.estado}</span></td>
                      <td>
                        {soloLectura ? (
                          <span className="muted">—</span>
                        ) : esReprogActivo ? (
                          /* ── Inline: campo de fecha + confirmar/cancelar ── */
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--azul)" }}>Nueva fecha:</label>
                            <input
                              type="date"
                              value={reprog.fecha}
                              onChange={(e) => setReprog({ ...reprog, fecha: e.target.value })}
                              style={{
                                height: 34, border: "1px solid var(--azul)", borderRadius: 8,
                                padding: "0 10px", fontSize: 13, background: "#fff",
                              }}
                            />
                            <button
                              onClick={confirmarReprogramacion}
                              disabled={reprogGuardando}
                              style={{
                                background: "var(--azul)", color: "#fff", border: "none", borderRadius: 8,
                                padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                              }}
                            >
                              {reprogGuardando ? "Guardando…" : "Confirmar"}
                            </button>
                            <button
                              onClick={cancelarReprogramacion}
                              style={{
                                background: "var(--gris-cl)", color: "var(--texto)", border: "1px solid var(--borde)",
                                borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : a.estado === "Pendiente" ? (
                          <div className="acu-acciones">
                            <button onClick={() => cambiarEstado(a.id, "Cumplido")} className="chip-ok">Cumplido</button>
                            <button onClick={() => cambiarEstado(a.id, "Incumplido")} className="chip-no">Incumplido</button>
                            <button onClick={() => cambiarEstado(a.id, "Reprogramado")} className="chip-re">Reprogramar</button>
                          </div>
                        ) : (
                          <button onClick={() => cambiarEstado(a.id, "Pendiente")} className="chip-re">Reabrir</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  return (
    <AppShell active="acuerdos" titulo="Acuerdos de pago" subtitulo="Seguimiento a los compromisos">
      {contenido}
    </AppShell>
  );
}
