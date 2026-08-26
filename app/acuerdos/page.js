"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { getPerfil, esSoloLectura } from "../../lib/auth";
import { pesos, num } from "../../lib/format";
import { exportarExcelEstilizado, hoyISO } from "../../lib/exportar";
import { Handshake, ChevronUp, ChevronDown } from "lucide-react";

const ESTADO_COLOR = {
  Pendiente: "var(--amarillo)", Cumplido: "var(--verde)",
  Incumplido: "var(--rojo)", Reprogramado: "var(--azul)",
};

const MS_DIA = 86400000;

// Días de diferencia entre hoy y la fecha de compromiso.
// >0 ya venció · 0 vence hoy · <0 todavía falta
function diasVencimiento(fechaCompromiso) {
  if (!fechaCompromiso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaCompromiso + "T00:00:00");
  return Math.floor((hoy - f) / MS_DIA);
}

function fechaCorta(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-CO");
}

function fechaHora(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

export default function Acuerdos() {
  const [estado, setEstado] = useState("cargando");
  const [acuerdos, setAcuerdos] = useState([]);
  const [filtro, setFiltro] = useState("Pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [soloLectura, setSoloLectura] = useState(false);

  // Estado para reprogramar: { id, fecha }
  const [reprog, setReprog] = useState(null);
  const [reprogGuardando, setReprogGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Trazabilidad expandible por acuerdo: { [acuerdoId]: [eventos] }
  const [historial, setHistorial] = useState({});
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    getPerfil().then((p) => setSoloLectura(esSoloLectura(p?.rol))).catch(() => {});
  }, []);

  async function cargar() {
    const { data: acu } = await supabase
      .from("acuerdos_pago")
      .select("*")
      .order("fecha_compromiso", { ascending: true });

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

  // Carga perezosa del historial de un acuerdo (solo cuando se despliega).
  async function alternarHistorial(id) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (historial[id]) return;
    const { data } = await supabase
      .from("acuerdos_historial")
      .select("*")
      .eq("acuerdo_id", id)
      .order("fecha", { ascending: true });
    setHistorial((h) => ({ ...h, [id]: data || [] }));
  }

  async function cambiarEstado(id, nuevo) {
    if (soloLectura) return;
    setAviso(null);

    // Si el nuevo estado es "Reprogramado", abrir el campo de fecha en vez de cambiar directo
    if (nuevo === "Reprogramado") {
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

    // El "quién" y el "cuándo" del cierre los sella un trigger en la base de datos.
    await supabase.from("acuerdos_pago").update({ estado: nuevo }).eq("id", id);
    setHistorial((h) => { const c = { ...h }; delete c[id]; return c; });
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

      // 2. Crear el nuevo acuerdo ENCADENADO al original (acuerdo_padre_id)
      const original = acuerdos.find((a) => a.id === reprog.id);
      if (original) {
        await supabase.from("acuerdos_pago").insert({
          cliente_nit: original.cliente_nit,
          gestion_id: original.gestion_id,
          fecha_compromiso: reprog.fecha,
          valor_comprometido: original.valor_comprometido,
          estado: "Pendiente",
          acuerdo_padre_id: original.id,
        });
      }

      setReprog(null);
      setHistorial({});
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

  // ── Filtros: estado + búsqueda por nombre o NIT ──
  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return acuerdos.filter((a) => {
      const okEstado = filtro === "Todos" || a.estado === filtro;
      const okBusq = !b || `${a.nombre || ""} ${a.cliente_nit || ""}`.toLowerCase().includes(b);
      return okEstado && okBusq;
    });
  }, [acuerdos, filtro, busqueda]);

  // Resumen rápido
  const pendientes = acuerdos.filter((a) => a.estado === "Pendiente").length;
  const cumplidos = acuerdos.filter((a) => a.estado === "Cumplido").length;
  const incumplidos = acuerdos.filter((a) => a.estado === "Incumplido").length;
  const reprogramados = acuerdos.filter((a) => a.estado === "Reprogramado").length;

  async function exportarAExcel() {
    const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const columnas = [
      { header: "#",                 key: "n",         width: 6,  formato: "numero" },
      { header: "Cliente",           key: "cliente",   width: 34, bold: true },
      { header: "NIT",               key: "nit",       width: 14 },
      { header: "Fecha compromiso",  key: "fecha",     width: 18 },
      { header: "Valor comprometido",key: "valor",     width: 20, formato: "moneda" },
      { header: "Estado",            key: "estadoTxt", width: 15 },
      { header: "Situación",         key: "situacion", width: 20 },
      { header: "Fecha de cierre",   key: "cierre",    width: 20 },
      { header: "Cerrado por",       key: "cerradoPor",width: 24 },
      { header: "Registrado por",    key: "creadoPor", width: 24 },
      { header: "Reprogramado de",   key: "padre",     width: 18 },
    ];

    const filas = filtrados.map((a, i) => {
      const d = diasVencimiento(a.fecha_compromiso);
      let situacion = "—";
      if (a.estado === "Pendiente") {
        if (d === null) situacion = "—";
        else if (d > 0) situacion = `Vencido hace ${d} día${d > 1 ? "s" : ""}`;
        else if (d === 0) situacion = "Vence hoy";
        else situacion = `Faltan ${-d} día${-d > 1 ? "s" : ""}`;
      }
      return {
        n: i + 1,
        cliente: a.nombre || a.cliente_nit,
        nit: a.cliente_nit,
        fecha: fechaCorta(a.fecha_compromiso + "T00:00:00"),
        valor: Number(a.valor_comprometido) || 0,
        estadoTxt: a.estado,
        situacion,
        cierre: a.resuelto_en ? fechaHora(a.resuelto_en) : "—",
        cerradoPor: a.resuelto_por_nombre || "—",
        creadoPor: a.creado_por_nombre || "—",
        padre: a.acuerdo_padre_id ? `Acuerdo #${a.acuerdo_padre_id}` : "—",
      };
    });

    await exportarExcelEstilizado(`Acuerdos_${filtro}_${hoyISO()}`, filas, columnas, {
      nombreHoja: "Acuerdos",
      titulo: "Acuerdos de Pago — Electroingeniería S.A.S.",
      subtitulo: `${fechaHoy}  ·  Filtro: ${filtro}  ·  ${filas.length} acuerdos  ·  Generado desde Gestión de Cartera`,
    });
  }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando acuerdos…</p>;
  } else if (acuerdos.length === 0) {
    contenido = (
      <div className="empty">
        <div className="empty-ico"><Handshake size={30} strokeWidth={2} /></div>
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
          <span style={{ color: "var(--azul)" }}><b>{reprogramados}</b> reprogramados</span>
        </div>

        <div className="filtros">
          <input
            placeholder="Buscar cliente o NIT…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {["Pendiente", "Cumplido", "Incumplido", "Reprogramado", "Todos"].map((e) => <option key={e}>{e}</option>)}
          </select>
          <button className="btn-ghost-light" onClick={exportarAExcel}>Exportar Excel</button>
          <span className="muted" style={{ alignSelf: "center" }}>{num(filtrados.length)} acuerdos</span>
        </div>

        {aviso && <div className={`upload-msg ${aviso.tipo === "ok" ? "listo" : "error"}`} style={{ marginBottom: 14 }}>{aviso.txt}</div>}

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "22%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "15%" }} /><col style={{ width: "25%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Fecha compromiso</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Estado</th>
                  <th>Cierre</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => {
                  const esReprogActivo = reprog && reprog.id === a.id;
                  const d = diasVencimiento(a.fecha_compromiso);
                  const esUrgente = a.estado === "Pendiente" && d !== null && d >= 0;
                  const eventos = historial[a.id];

                  return (
                    <Fragment key={a.id}>
                      <tr
                        style={
                          esReprogActivo ? { background: "#eef6ff" }
                            : esUrgente ? { background: d > 0 ? "#fdf3f3" : "#fffcf0" }
                            : undefined
                        }
                      >
                        <td>
                          <Link href={`/cliente/${encodeURIComponent(a.cliente_nit)}`} style={{ color: "var(--azul)" }}>
                            <b>{a.nombre}</b>
                          </Link>
                          <br /><span className="muted">{a.cliente_nit}</span>
                          {a.acuerdo_padre_id && (
                            <><br /><span className="muted" style={{ fontSize: 11 }}>↳ reprogramado del acuerdo #{a.acuerdo_padre_id}</span></>
                          )}
                        </td>

                        <td>
                          {new Date(a.fecha_compromiso + "T00:00:00").toLocaleDateString("es-CO")}
                          {a.estado === "Pendiente" && d !== null && (
                            <>
                              <br />
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: d > 0 ? "var(--rojo)" : d === 0 ? "var(--amarillo)" : "var(--texto-suave)",
                              }}>
                                {d > 0 ? `Vencido hace ${d} día${d > 1 ? "s" : ""}`
                                  : d === 0 ? "Vence hoy"
                                  : `Faltan ${-d} día${-d > 1 ? "s" : ""}`}
                              </span>
                            </>
                          )}
                        </td>

                        <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(a.valor_comprometido)}</td>

                        <td>
                          <span className="pill" style={{ background: ESTADO_COLOR[a.estado] + "22", color: ESTADO_COLOR[a.estado] }}>
                            {a.estado}
                          </span>
                        </td>

                        <td style={{ fontSize: 12 }}>
                          {a.resuelto_en ? (
                            <>
                              {fechaCorta(a.resuelto_en)}
                              <br /><span className="muted">{a.resuelto_por_nombre || "—"}</span>
                            </>
                          ) : <span className="muted">—</span>}
                        </td>

                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {soloLectura ? (
                              <span className="muted">—</span>
                            ) : esReprogActivo ? (
                              /* ── Inline: campo de fecha + confirmar/cancelar ── */
                              <>
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
                              </>
                            ) : a.estado === "Pendiente" ? (
                              <div className="acu-acciones">
                                <button onClick={() => cambiarEstado(a.id, "Cumplido")} className="chip-ok">Cumplido</button>
                                <button onClick={() => cambiarEstado(a.id, "Incumplido")} className="chip-no">Incumplido</button>
                                <button onClick={() => cambiarEstado(a.id, "Reprogramado")} className="chip-re">Reprogramar</button>
                              </div>
                            ) : (
                              <button onClick={() => cambiarEstado(a.id, "Pendiente")} className="chip-re">Reabrir</button>
                            )}

                            <button
                              onClick={() => alternarHistorial(a.id)}
                              title="Ver la línea de tiempo de este acuerdo"
                              style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--azul)", fontSize: 12, fontWeight: 600, padding: "4px 2px",
                              }}
                            >
                              {abierto === a.id
                                ? <><ChevronUp size={13} style={{ verticalAlign: "-2px" }} /> ocultar</>
                                : <><ChevronDown size={13} style={{ verticalAlign: "-2px" }} /> trazabilidad</>}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Línea de tiempo del acuerdo ── */}
                      {abierto === a.id && (
                        <tr>
                          <td colSpan={6} style={{ background: "#f7f9fd", padding: "14px 18px" }}>
                            {!eventos ? (
                              <span className="muted" style={{ fontSize: 12 }}>Cargando trazabilidad…</span>
                            ) : eventos.length === 0 ? (
                              <span className="muted" style={{ fontSize: 12 }}>Sin movimientos registrados.</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {eventos.map((h) => (
                                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                                    <span style={{ color: "var(--texto-suave)", minWidth: 130 }}>{fechaHora(h.fecha)}</span>
                                    <span className="pill" style={{
                                      background: (ESTADO_COLOR[h.estado_nuevo] || "#5b6b86") + "22",
                                      color: ESTADO_COLOR[h.estado_nuevo] || "#5b6b86",
                                    }}>
                                      {h.estado_anterior ? `${h.estado_anterior} → ${h.estado_nuevo}` : `Creado como ${h.estado_nuevo}`}
                                    </span>
                                    <span style={{ color: "var(--texto)" }}><b>{h.usuario_nombre || "—"}</b></span>
                                    <span className="muted">{pesos(h.valor_comprometido)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
