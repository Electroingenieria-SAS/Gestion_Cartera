"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { getPerfil } from "../../lib/auth";
import { num } from "../../lib/format";

export default function Auditoria() {
  const [estado, setEstado] = useState("cargando");
  const [registros, setRegistros] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState("actividad"); // "actividad" | "adjuntos"

  useEffect(() => {
    (async () => {
      const perfil = await getPerfil();
      if (!perfil || perfil.rol !== "supervisor") {
        setEstado("denegado");
        return;
      }

      // Cargar auditoría
      const { data: audit } = await supabase
        .from("auditoria")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(300);
      setRegistros(audit || []);

      // Cargar gestiones que tienen archivo adjunto
      const { data: gest } = await supabase
        .from("gestiones")
        .select("id, fecha, cliente_nit, resultado, archivo_url, usuario_nombre")
        .not("archivo_url", "is", null)
        .order("fecha", { ascending: false })
        .limit(100);

      // Traer nombres de clientes para las gestiones con adjuntos
      const nits = [...new Set((gest || []).map((g) => g.cliente_nit))];
      let mapaNombres = {};
      if (nits.length > 0) {
        const { data: clis } = await supabase
          .from("clientes")
          .select("nit, nombre")
          .in("nit", nits);
        for (const c of clis || []) mapaNombres[c.nit] = c.nombre;
      }

      setAdjuntos(
        (gest || []).map((g) => ({
          ...g,
          nombre_cliente: mapaNombres[g.cliente_nit] || g.cliente_nit,
        }))
      );

      setEstado("ok");
    })();
  }, []);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return registros;
    return registros.filter((r) =>
      `${r.usuario_nombre || ""} ${r.accion || ""} ${r.detalle || ""}`.toLowerCase().includes(b)
    );
  }, [registros, busqueda]);

  const adjuntosFiltrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return adjuntos;
    return adjuntos.filter((a) =>
      `${a.nombre_cliente || ""} ${a.cliente_nit || ""} ${a.usuario_nombre || ""} ${a.resultado || ""}`.toLowerCase().includes(b)
    );
  }, [adjuntos, busqueda]);

  // Abrir PDF en pestaña nueva (visor del navegador, sin descargar)
  async function verPDF(url) {
    if (url.startsWith("http")) {
      window.open(url, "_blank");
      return;
    }
    const { data, error } = await supabase.storage.from("gestiones-adjuntos").createSignedUrl(url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  // Forzar descarga del PDF
  async function descargarPDF(url, nombreCliente) {
    let urlFinal = url;
    if (!url.startsWith("http")) {
      const { data } = await supabase.storage.from("gestiones-adjuntos").createSignedUrl(url, 3600);
      if (!data?.signedUrl) return;
      urlFinal = data.signedUrl;
    }
    // Descargar forzando con un <a> temporal
    const a = document.createElement("a");
    a.href = urlFinal;
    a.download = `adjunto_${nombreCliente.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando registro…</p>;
  } else if (estado === "denegado") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">❑</div>
        <h2>Solo para supervisores</h2>
        <p>El registro de auditoría únicamente puede ser consultado por usuarios con rol de supervisor.</p>
      </div>
    );
  } else {
    contenido = (
      <>
        {/* Tabs: Actividad | Documentos adjuntos */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          <button
            onClick={() => setTab("actividad")}
            style={{
              padding: "10px 20px", borderRadius: "10px 10px 0 0", fontWeight: 700, fontSize: 14,
              border: "1px solid var(--borde)", borderBottom: tab === "actividad" ? "2px solid var(--azul)" : "1px solid var(--borde)",
              background: tab === "actividad" ? "var(--blanco)" : "var(--gris-cl)",
              color: tab === "actividad" ? "var(--azul)" : "var(--texto-suave)",
              cursor: "pointer",
            }}
          >
            Registro de actividad
          </button>
          <button
            onClick={() => setTab("adjuntos")}
            style={{
              padding: "10px 20px", borderRadius: "10px 10px 0 0", fontWeight: 700, fontSize: 14,
              border: "1px solid var(--borde)", borderBottom: tab === "adjuntos" ? "2px solid var(--azul)" : "1px solid var(--borde)",
              background: tab === "adjuntos" ? "var(--blanco)" : "var(--gris-cl)",
              color: tab === "adjuntos" ? "var(--azul)" : "var(--texto-suave)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            Documentos adjuntos
            {adjuntos.length > 0 && (
              <span style={{
                background: "var(--azul)", color: "#fff", fontSize: 11, fontWeight: 800,
                padding: "2px 7px", borderRadius: 999, minWidth: 20, textAlign: "center",
              }}>
                {adjuntos.length}
              </span>
            )}
          </button>
        </div>

        <div className="filtros">
          <input
            placeholder={tab === "actividad" ? "Buscar por usuario, acción o detalle…" : "Buscar por cliente, NIT o usuario…"}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {tab === "actividad" ? (
          <>
            <div className="resumen-filtro"><span><b>{num(filtrados.length)}</b> registros (últimos 300)</span></div>
            {filtrados.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">❑</div>
                <h2>Sin actividad registrada todavía</h2>
                <p>Aquí aparecerá cada carga, gestión y acuerdo que realice el equipo.</p>
              </div>
            ) : (
              <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                <div className="tabla-wrap">
                  <table className="data">
                    <colgroup>
                      <col style={{ width: "20%" }} /><col style={{ width: "20%" }} />
                      <col style={{ width: "22%" }} /><col style={{ width: "38%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td><b>{r.usuario_nombre || "—"}</b></td>
                          <td>{r.accion}</td>
                          <td className="muted">{r.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="resumen-filtro"><span><b>{num(adjuntosFiltrados.length)}</b> documentos adjuntos</span></div>
            {adjuntosFiltrados.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">📎</div>
                <h2>Sin documentos adjuntos</h2>
                <p>Cuando la auxiliar adjunte un PDF a una gestión, aparecerá aquí para consulta y descarga.</p>
              </div>
            ) : (
              <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                <div className="tabla-wrap">
                  <table className="data">
                    <colgroup>
                      <col style={{ width: "18%" }} /><col style={{ width: "16%" }} />
                      <col style={{ width: "22%" }} /><col style={{ width: "18%" }} />
                      <col style={{ width: "26%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Usuario</th><th>Cliente</th><th>Resultado</th><th>Archivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjuntosFiltrados.map((a) => (
                        <tr key={a.id}>
                          <td>{new Date(a.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td><b>{a.usuario_nombre || "—"}</b></td>
                          <td>
                            <b>{a.nombre_cliente}</b>
                            <br />
                            <span className="muted" style={{ fontSize: 11 }}>{a.cliente_nit}</span>
                          </td>
                          <td>
                            <span className="pill" style={{
                              background: a.resultado === "Trasladado a seguro" ? "#eef0ff" : "#eef6ff",
                              color: a.resultado === "Trasladado a seguro" ? "#3b42a0" : "var(--azul)",
                            }}>
                              {a.resultado}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                onClick={() => verPDF(a.archivo_url)}
                                style={{
                                  background: "#eef6ff", border: "1px solid #cfe2fb", borderRadius: 8,
                                  padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "var(--azul)",
                                  cursor: "pointer",
                                }}
                              >
                                Ver
                              </button>
                              <button
                                onClick={() => descargarPDF(a.archivo_url, a.nombre_cliente)}
                                style={{
                                  background: "var(--gris-cl)", border: "1px solid var(--borde)", borderRadius: 8,
                                  padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "var(--texto)",
                                  cursor: "pointer",
                                }}
                              >
                                Descargar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <AppShell active="auditoria" titulo="Auditoría" subtitulo="Registro de actividad del equipo">
      {contenido}
    </AppShell>
  );
}
