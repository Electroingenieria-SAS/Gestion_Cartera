"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { pesos, num } from "../../lib/format";
import { exportarExcelEstilizado, hoyISO } from "../../lib/exportar";
import { History, Image as ImageIcon, Paperclip, ChevronUp, ChevronDown } from "lucide-react";

// Supabase entrega máximo 1.000 filas por consulta.
// Esta función pide página por página hasta traer TODO el historial.
async function traerTodo(construirConsulta) {
  const TAM = 1000;
  let desde = 0;
  const todo = [];
  while (true) {
    const { data, error } = await construirConsulta().range(desde, desde + TAM - 1);
    if (error) throw error;
    todo.push(...(data || []));
    if (!data || data.length < TAM) break;
    desde += TAM;
  }
  return todo;
}

const fmtFecha = (f) => new Date(f).toLocaleDateString("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = (f) => new Date(f).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });

// Colores por resultado de gestión
const RES_COL = {
  "Contactado": "var(--verde)", "Compromiso de pago": "var(--verde)",
  "Pago parcial": "var(--verde)", "Pago total": "var(--verde)",
  "No contesta": "var(--amarillo)", "Número errado": "var(--amarillo)",
  "Requiere seguimiento": "var(--amarillo)", "En espera": "var(--amarillo)",
  "Trasladado a seguro": "#3b42a0",
};

export default function Trazabilidad() {
  const [estado, setEstado] = useState("cargando");
  const [registros, setRegistros] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [expandido, setExpandido] = useState(null); // id del registro expandido
  const [filtroTipo, setFiltroTipo] = useState("todos"); // "todos" | "gestiones" | "sistema"
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState(null);

  // Descarga el historial COMPLETO (no solo lo que se ve en pantalla)
  async function exportarAExcel() {
    setExportando(true);
    setErrorExport(null);
    try {
      const gest = await traerTodo(() =>
        supabase
          .from("gestiones")
          .select("id, fecha, cliente_nit, tipo, resultado, observacion, archivo_url, usuario_nombre")
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
      );
      const audit = await traerTodo(() =>
        supabase
          .from("auditoria")
          .select("id, fecha, usuario_nombre, accion, detalle")
          .not("accion", "eq", "Registró gestión") // mismo criterio que la pantalla
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
      );

      // Nombres de clientes, en grupos de 200 NIT para no saturar la consulta
      const nits = [...new Set(gest.map((g) => g.cliente_nit))];
      const nombres = {};
      for (let i = 0; i < nits.length; i += 200) {
        const { data: cli, error } = await supabase.from("clientes").select("nit, nombre").in("nit", nits.slice(i, i + 200));
        if (error) throw error;
        for (const c of cli || []) nombres[c.nit] = c.nombre;
      }

      const todos = [
        ...gest.map((g) => ({ fecha: g.fecha, esGestion: true, ...g })),
        ...audit.map((a) => ({ fecha: a.fecha, esGestion: false, ...a })),
      ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // del más antiguo al más reciente

      const filas = todos.map((r, i) => ({
        n: i + 1,
        fecha: fmtFecha(r.fecha),
        hora: fmtHora(r.fecha),
        usuario: r.usuario_nombre || "—",
        categoria: r.esGestion ? "Gestión de cliente" : "Evento del sistema",
        tipo: r.esGestion ? r.tipo : "—",
        resultado: r.esGestion ? r.resultado : "—",
        cliente: r.esGestion ? (nombres[r.cliente_nit] || r.cliente_nit) : "—",
        nit: r.esGestion ? r.cliente_nit : "—",
        observacion: r.esGestion ? (r.observacion || "—") : "—",
        accion: r.esGestion ? "—" : r.accion,
        detalle: r.esGestion ? "—" : (r.detalle || "—"),
        adjunto: r.esGestion && r.archivo_url ? (/\.(jpg|jpeg|png)$/i.test(r.archivo_url) ? "Imagen" : "PDF") : "No",
      }));

      const columnas = [
        { header: "#",            key: "n",           width: 7,  formato: "numero" },
        { header: "Fecha",        key: "fecha",       width: 12 },
        { header: "Hora",         key: "hora",        width: 11 },
        { header: "Usuario",      key: "usuario",     width: 22, bold: true },
        { header: "Categoría",    key: "categoria",   width: 19 },
        { header: "Tipo",         key: "tipo",        width: 18 },
        { header: "Resultado",    key: "resultado",   width: 22 },
        { header: "Cliente",      key: "cliente",     width: 36 },
        { header: "NIT",          key: "nit",         width: 14 },
        { header: "Observación",  key: "observacion", width: 50 },
        { header: "Acción (sistema)",  key: "accion",  width: 24 },
        { header: "Detalle (sistema)", key: "detalle", width: 40 },
        { header: "Adjunto",      key: "adjunto",     width: 10 },
      ];

      const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      await exportarExcelEstilizado(`Trazabilidad_${hoyISO()}`, filas, columnas, {
        nombreHoja: "Trazabilidad",
        titulo: "Trazabilidad — Electroingeniería S.A.S.",
        subtitulo: `${fechaHoy}  ·  Historial completo  ·  ${gest.length} gestiones + ${audit.length} eventos del sistema  ·  Generado desde Gestión de Cartera`,
      });
    } catch (e) {
      setErrorExport("No se pudo generar el Excel: " + (e.message || e));
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    (async () => {
      // 1. Traer gestiones con todos los detalles
      const { data: gest } = await supabase
        .from("gestiones")
        .select("id, fecha, cliente_nit, tipo, resultado, observacion, archivo_url, usuario_nombre")
        .order("fecha", { ascending: false })
        .limit(300);

      // 2. Traer eventos de sistema (cargas, etc.) de auditoría
      const { data: audit } = await supabase
        .from("auditoria")
        .select("id, fecha, usuario_nombre, accion, detalle")
        .not("accion", "eq", "Registró gestión") // evitar duplicados con gestiones
        .order("fecha", { ascending: false })
        .limit(100);

      // 3. Traer nombres de clientes
      const nits = [...new Set((gest || []).map((g) => g.cliente_nit))];
      let nombres = {};
      if (nits.length > 0) {
        const { data: cli } = await supabase.from("clientes").select("nit, nombre").in("nit", nits);
        for (const c of cli || []) nombres[c.nit] = c.nombre;
      }

      // 4. Unificar en una sola timeline
      const timeline = [];

      for (const g of gest || []) {
        timeline.push({
          id: "g-" + g.id,
          fecha: g.fecha,
          esGestion: true,
          usuario: g.usuario_nombre || "—",
          accion: `${g.tipo} → ${g.resultado}`,
          cliente_nit: g.cliente_nit,
          nombre_cliente: nombres[g.cliente_nit] || g.cliente_nit,
          tipo: g.tipo,
          resultado: g.resultado,
          observacion: g.observacion,
          archivo_url: g.archivo_url,
        });
      }

      for (const a of audit || []) {
        timeline.push({
          id: "a-" + a.id,
          fecha: a.fecha,
          esGestion: false,
          usuario: a.usuario_nombre || "—",
          accion: a.accion,
          detalle: a.detalle,
        });
      }

      // Ordenar por fecha descendente
      timeline.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      setRegistros(timeline);
      setEstado("ok");
    })();
  }, []);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return registros.filter((r) => {
      if (filtroTipo === "gestiones" && !r.esGestion) return false;
      if (filtroTipo === "sistema" && r.esGestion) return false;
      if (!b) return true;
      const texto = `${r.usuario} ${r.accion} ${r.nombre_cliente || ""} ${r.cliente_nit || ""} ${r.detalle || ""} ${r.observacion || ""}`.toLowerCase();
      return texto.includes(b);
    });
  }, [registros, busqueda, filtroTipo]);

  function toggleExpandir(id) {
    setExpandido(expandido === id ? null : id);
  }

  // Ver adjunto con URL firmada
  async function verAdjunto(url) {
    let ruta = url;
    const marcador = "/gestiones-adjuntos/";
    const idx = url.indexOf(marcador);
    if (idx !== -1) ruta = url.substring(idx + marcador.length);
    const { data } = await supabase.storage.from("gestiones-adjuntos").createSignedUrl(ruta, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const conteoGest = registros.filter((r) => r.esGestion).length;
  const conteoSist = registros.filter((r) => !r.esGestion).length;

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando trazabilidad…</p>;
  } else if (registros.length === 0) {
    contenido = (
      <div className="empty">
        <div className="empty-ico"><History size={30} strokeWidth={2} /></div>
        <h2>Sin actividad registrada</h2>
        <p>Cuando el equipo cargue cartera o registre gestiones, aparecerán aquí.</p>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="filtros">
          <input placeholder="Buscar por cliente, usuario, acción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="todos">Todo ({num(registros.length)})</option>
            <option value="gestiones">Gestiones de clientes ({num(conteoGest)})</option>
            <option value="sistema">Eventos del sistema ({num(conteoSist)})</option>
          </select>
          <button className="btn-ghost-light" onClick={exportarAExcel} disabled={exportando} title="Descarga todo el historial, desde el primer registro hasta hoy">
            {exportando ? "Generando…" : "Exportar Excel"}
          </button>
        </div>
        {errorExport && <div className="upload-msg error" style={{ marginBottom: 14 }}>{errorExport}</div>}
        <div className="resumen-filtro"><span><b>{num(filtrados.length)}</b> registros</span></div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "16%" }} /><col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} /><col style={{ width: "48%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const abierto = expandido === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => r.esGestion && toggleExpandir(r.id)}
                      style={{
                        cursor: r.esGestion ? "pointer" : "default",
                        background: abierto ? "#eef6ff" : undefined,
                        verticalAlign: "top",
                      }}
                      title={r.esGestion ? "Clic para ver detalles" : undefined}
                    >
                      <td>{new Date(r.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td><b>{r.usuario}</b></td>
                      <td>
                        {r.esGestion ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                            <span className="pill" style={{ background: "var(--gris-cl)", color: "var(--azul)" }}>{r.tipo}</span>
                            <span className="pill" style={{ background: (RES_COL[r.resultado] || "var(--azul)") + "18", color: RES_COL[r.resultado] || "var(--azul)" }}>{r.resultado}</span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--texto-suave)", fontSize: 13 }}>{r.accion}</span>
                        )}
                      </td>
                      <td>
                        {r.esGestion ? (
                          <div>
                            {/* Resumen de la fila */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <Link
                                href={`/cliente/${encodeURIComponent(r.cliente_nit)}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: "var(--azul)", fontWeight: 700, fontSize: 13 }}
                              >
                                {r.nombre_cliente}
                              </Link>
                              <span className="muted" style={{ fontSize: 11 }}>NIT {r.cliente_nit}</span>
                              {r.archivo_url && (
                                <span style={{ fontSize: 11, color: "var(--azul)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  {/\.(jpg|jpeg|png)$/i.test(r.archivo_url)
                                    ? <><ImageIcon size={12} /> con imagen</>
                                    : <><Paperclip size={12} /> con adjunto</>}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: "var(--texto-suave)", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {abierto
                                  ? <><ChevronUp size={13} /> cerrar</>
                                  : <><ChevronDown size={13} /> ver más</>}
                              </span>
                            </div>

                            {/* Detalle expandido */}
                            {abierto && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  marginTop: 12, padding: "14px 16px",
                                  background: "#fff", border: "1px solid var(--borde)", borderRadius: 12,
                                }}
                              >
                                <div style={{ fontSize: 13, marginBottom: 10, display: "grid", gap: 6 }}>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <span style={{ color: "var(--texto-suave)", minWidth: 90 }}>Tipo:</span>
                                    <b>{r.tipo}</b>
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <span style={{ color: "var(--texto-suave)", minWidth: 90 }}>Resultado:</span>
                                    <b>{r.resultado}</b>
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <span style={{ color: "var(--texto-suave)", minWidth: 90 }}>Observación:</span>
                                    <span>{r.observacion || "—"}</span>
                                  </div>
                                </div>

                                {r.archivo_url && (
                                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button
                                      onClick={() => verAdjunto(r.archivo_url)}
                                      style={{
                                        background: "#eef6ff", border: "1px solid #cfe2fb", borderRadius: 8,
                                        padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--azul)", cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", gap: 6,
                                      }}
                                    >
                                      {/\.(jpg|jpeg|png)$/i.test(r.archivo_url)
                                        ? <><ImageIcon size={14} /> Ver imagen</>
                                        : <><Paperclip size={14} /> Ver PDF</>}
                                    </button>
                                  </div>
                                )}

                                <div style={{ marginTop: 10 }}>
                                  <Link
                                    href={`/cliente/${encodeURIComponent(r.cliente_nit)}`}
                                    className="btn-mini"
                                  >
                                    Ir a ficha del cliente
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="muted">{r.detalle}</span>
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
    <AppShell active="auditoria" titulo="Trazabilidad" subtitulo="Historial completo de gestiones y actividad del equipo">
      {contenido}
    </AppShell>
  );
}
