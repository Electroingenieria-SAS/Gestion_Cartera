"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { supabase } from "../../lib/supabase";
import { getPerfil, esSoloLectura } from "../../lib/auth";
import { pesos, num } from "../../lib/format";

const TIPOS = ["Correo físico (carta)", "Correo", "WhatsApp", "Llamada", "Gestión interna", "Conciliación", "Visita"];
const RESULTADOS = ["En espera", "Contactado", "No contesta", "Requiere seguimiento"];

export default function GestionMasiva() {
  const [estado, setEstado] = useState("cargando");
  const [clientes, setClientes] = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [soloLectura, setSoloLectura] = useState(false);
  const [usuario, setUsuario] = useState({ id: null, nombre: "" });

  const [tipo, setTipo] = useState("Correo físico (carta)");
  const [resultado, setResultado] = useState("En espera");
  const [obs, setObs] = useState("");
  const [archivo, setArchivo] = useState(null);

  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    (async () => {
      const perfil = await getPerfil();
      setSoloLectura(esSoloLectura(perfil?.rol));

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase.from("profiles").select("nombre").eq("id", session.user.id).single();
        setUsuario({ id: session.user.id, nombre: p?.nombre || session.user.email });
      }

      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }

      // Agrupar por cliente
      const cli = {};
      for (const d of docs) {
        const k = d.nit;
        if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0 };
        cli[k].total += Number(d.saldo) || 0;
        if (d.categoria && d.categoria !== "Vigente") cli[k].vencido += Number(d.saldo) || 0;
      }

      const lista = Object.values(cli).sort((a, b) => b.vencido - a.vencido);
      setClientes(lista);
      setEstado("ok");
    })();
  }, []);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return clientes;
    return clientes.filter((c) => `${c.nombre || ""} ${c.nit}`.toLowerCase().includes(b));
  }, [clientes, busqueda]);

  function toggleTodos() {
    if (seleccionados.size === filtrados.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(filtrados.map((c) => c.nit)));
    }
  }

  function toggleUno(nit) {
    const copia = new Set(seleccionados);
    if (copia.has(nit)) copia.delete(nit);
    else copia.add(nit);
    setSeleccionados(copia);
  }

  async function ejecutarMasivo() {
    if (soloLectura || procesando) return;
    setAviso(null);

    if (seleccionados.size === 0) {
      setAviso({ tipo: "error", txt: "Selecciona al menos un cliente." });
      return;
    }
    if (obs.trim().length < 20) {
      setAviso({ tipo: "error", txt: "La observación debe tener al menos 20 caracteres." });
      return;
    }

    setProcesando(true);
    setProgreso({ hecho: 0, total: seleccionados.size });

    try {
      // 1. Subir archivo adjunto (una sola vez)
      let archivoUrl = null;
      if (archivo) {
        const ruta = `circular/${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: errUpload } = await supabase.storage
          .from("gestiones-adjuntos")
          .upload(ruta, archivo, { contentType: archivo.type });
        if (errUpload) throw new Error("Error al subir el archivo: " + errUpload.message);
        archivoUrl = ruta;
      }

      // 2. Crear las gestiones en lotes
      const nits = [...seleccionados];
      const LOTE = 50;
      let hecho = 0;

      for (let i = 0; i < nits.length; i += LOTE) {
        const lote = nits.slice(i, i + LOTE).map((nit) => ({
          cliente_nit: nit,
          tipo,
          resultado,
          observacion: obs.trim(),
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre,
          archivo_url: archivoUrl,
        }));

        const { error } = await supabase.from("gestiones").insert(lote);
        if (error) throw error;

        hecho += lote.length;
        setProgreso({ hecho, total: nits.length });
      }

      setAviso({ tipo: "ok", txt: `Gestión masiva completada: ${num(nits.length)} clientes registrados.` });
      setSeleccionados(new Set());
      setObs("");
      setArchivo(null);
      const fileInput = document.getElementById("archivo-circular");
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error: " + (err?.message || "desconocido") });
    } finally {
      setProcesando(false);
      setProgreso(null);
    }
  }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando clientes…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">▤</div>
        <h2>No hay cartera cargada</h2>
        <p>Sube tu archivo de Siesa primero.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo</Link>
      </div>
    );
  } else {
    const todosSeleccionados = filtrados.length > 0 && seleccionados.size === filtrados.length;

    contenido = (
      <>
        <Link href="/plan" className="volver">← Volver al plan diario</Link>

        {soloLectura && (
          <div className="lectura-aviso">Tu rol es de <b>consulta</b> (solo lectura). No puedes registrar gestiones.</div>
        )}

        {/* Formulario de la gestión masiva */}
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ color: "var(--azul)", fontSize: 16, marginBottom: 14 }}>Datos de la gestión masiva</h3>
          <div className="form-gestion">
            <label className="field"><span>Tipo de gestión</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field"><span>Resultado</span>
              <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                {RESULTADOS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span>Observación (mínimo 20 caracteres) — se aplica a todos los clientes seleccionados</span>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: Se envió circular de cobro N° 045 del 15/07/2026 informando sobre saldos pendientes." />
            <small className="muted">{obs.trim().length}/20</small>
          </label>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Adjuntar circular (opcional) — PDF o imagen</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                id="archivo-circular"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                style={{
                  border: "1px dashed var(--borde)", borderRadius: 10, padding: "10px 14px",
                  background: "var(--gris-cl)", fontSize: 13, cursor: "pointer", maxWidth: 360,
                }}
              />
              {archivo && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {archivo.name} ({(archivo.size / 1024).toFixed(0)} KB)
                </span>
              )}
            </div>
          </label>
        </div>

        {/* Selección de clientes */}
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--borde)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={toggleTodos}
              style={{
                background: todosSeleccionados ? "var(--azul)" : "var(--gris-cl)",
                color: todosSeleccionados ? "#fff" : "var(--azul)",
                border: "1px solid var(--borde)", borderRadius: 8,
                padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {todosSeleccionados ? "Deseleccionar todos" : `Seleccionar todos (${num(filtrados.length)})`}
            </button>
            <input
              placeholder="Buscar cliente o NIT…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                flex: 1, minWidth: 200, height: 38, border: "1px solid var(--borde)", borderRadius: 10,
                padding: "0 12px", fontSize: 14, background: "#fff",
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--azul)" }}>
              {num(seleccionados.size)} seleccionados
            </span>
          </div>

          <div className="tabla-wrap" style={{ maxHeight: 420 }}>
            <table className="data">
              <colgroup>
                <col style={{ width: "5%" }} /><col style={{ width: "35%" }} />
                <col style={{ width: "15%" }} /><col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} /><col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th></th><th>Cliente</th><th>NIT</th><th>Ciudad</th>
                  <th style={{ textAlign: "right" }}>Saldo total</th>
                  <th style={{ textAlign: "right" }}>Vencido</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const sel = seleccionados.has(c.nit);
                  return (
                    <tr
                      key={c.nit}
                      onClick={() => toggleUno(c.nit)}
                      style={{ cursor: "pointer", background: sel ? "#eef6ff" : undefined }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={sel} readOnly style={{ cursor: "pointer", accentColor: "var(--azul)" }} />
                      </td>
                      <td><b>{c.nombre || c.nit}</b></td>
                      <td className="muted">{c.nit}</td>
                      <td className="muted">{c.ciudad || "—"}</td>
                      <td style={{ textAlign: "right" }}>{pesos(c.total)}</td>
                      <td style={{ textAlign: "right", color: c.vencido > 0 ? "var(--rojo)" : "var(--verde)", fontWeight: 700 }}>
                        {pesos(c.vencido)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Botón de ejecutar + progreso */}
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={ejecutarMasivo}
            disabled={procesando || soloLectura || seleccionados.size === 0}
            style={{ fontSize: 15, padding: "14px 28px" }}
          >
            {procesando
              ? `Registrando… ${progreso?.hecho || 0}/${progreso?.total || 0}`
              : `Registrar gestión a ${num(seleccionados.size)} clientes`}
          </button>
          {aviso && <span className={`envio-msg ${aviso.tipo === "ok" ? "listo" : "error"}`}>{aviso.txt}</span>}
        </div>
      </>
    );
  }

  return (
    <AppShell active="plan" titulo="Gestión masiva" subtitulo="Registrar una gestión a múltiples clientes de una sola vez">
      {contenido}
    </AppShell>
  );
}
