"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import { supabase } from "../../../lib/supabase";
import { getResumenCliente } from "../../../lib/cartera";
import { calcularProbabilidad } from "../../../lib/prediccion";
import { pesos, formatearMiles, soloNumero } from "../../../lib/format";
import { numeroALetras } from "../../../lib/numeroALetras";

const TIPOS = ["Llamada", "WhatsApp", "Correo", "Correo físico (carta)", "Visita", "Gestión interna", "Conciliación"];
const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Número errado",
  "Compromiso de pago",
  "Pago parcial",
  "Pago total",
  "Requiere seguimiento",
  "En espera",
  "Trasladado a seguro",
];

export default function FichaCliente() {
  const nit = decodeURIComponent(useParams().nit || "");
  const [estado, setEstado] = useState("cargando");
  const [resumen, setResumen] = useState(null);
  const [contacto, setContacto] = useState({ telefono: "", correo: "" });
  const [historial, setHistorial] = useState([]);
  const [pred, setPred] = useState(null);
  const [enSeguro, setEnSeguro] = useState(false);
  const [usuario, setUsuario] = useState({ id: null, nombre: "", rol: "consulta" });
  const soloLectura = usuario.rol === "consulta";

  const [tipo, setTipo] = useState("Llamada");
  const [resultado, setResultado] = useState("Contactado");
  const [obs, setObs] = useState("");
  const [fechaComp, setFechaComp] = useState("");
  const [valorComp, setValorComp] = useState("");
  const [archivoPDF, setArchivoPDF] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Edición de gestiones (solo supervisor)
  const [editId, setEditId] = useState(null);
  const [editTipo, setEditTipo] = useState("");
  const [editResultado, setEditResultado] = useState("");
  const [editObs, setEditObs] = useState("");
  const [editFechaComp, setEditFechaComp] = useState("");
  const [editValorComp, setEditValorComp] = useState("");
  const [editGuardando, setEditGuardando] = useState(false);

  async function cargarTodo() {
    const r = await getResumenCliente(nit);
    setResumen(r);

    const { data: cli } = await supabase
      .from("clientes")
      .select("telefono, correo, en_seguro")
      .eq("nit", nit)
      .single();
    if (cli) {
      setContacto({ telefono: cli.telefono || "", correo: cli.correo || "" });
      setEnSeguro(cli.en_seguro || false);
    }

    const { data: hist } = await supabase
      .from("gestiones")
      .select("*")
      .eq("cliente_nit", nit)
      .order("fecha", { ascending: false });
    setHistorial(hist || []);

    // Predicción de pago
    const { data: acu } = await supabase.from("acuerdos_pago").select("estado").eq("cliente_nit", nit);
    const cumplidos = (acu || []).filter((a) => a.estado === "Cumplido").length;
    const incumplidos = (acu || []).filter((a) => a.estado === "Incumplido").length;
    const ultimoResultado = hist && hist[0] ? hist[0].resultado : null;
    if (r && r.saldo > 0) {
      setPred(calcularProbabilidad({ diasMora: r.dias, pctVencida: r.vencida / r.saldo, cumplidos, incumplidos, ultimoResultado }));
    } else {
      setPred(null);
    }

    setEstado("ok");
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase.from("profiles").select("nombre, rol").eq("id", session.user.id).single();
        setUsuario({ id: session.user.id, nombre: p?.nombre || session.user.email, rol: p?.rol || "consulta" });
      }
      await cargarTodo();
    })();
  }, [nit]);

  async function guardarContacto() {
    if (soloLectura) return;
    await supabase.from("clientes").update({ telefono: contacto.telefono, correo: contacto.correo }).eq("nit", nit);
    setAviso({ tipo: "ok", txt: "Contacto guardado." });
  }

  async function guardarGestion() {
    if (soloLectura) return;
    setAviso(null);
    if (obs.trim().length < 20) {
      setAviso({ tipo: "error", txt: "La observación debe tener al menos 20 caracteres." });
      return;
    }
    if (resultado === "Compromiso de pago" && (!fechaComp || soloNumero(valorComp) <= 0)) {
      setAviso({ tipo: "error", txt: "Para un compromiso de pago ingresa la fecha y el valor." });
      return;
    }
    setGuardando(true);
    try {
      // 1. Subir PDF a Storage si hay uno seleccionado
      let archivoUrl = null;
      if (archivoPDF) {
        const ext = archivoPDF.name.split(".").pop() || "pdf";
        const ruta = `${nit}/${Date.now()}_${archivoPDF.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: errUpload } = await supabase.storage
          .from("gestiones-adjuntos")
          .upload(ruta, archivoPDF, { contentType: archivoPDF.type || "application/pdf" });
        if (errUpload) throw new Error("Error al subir el archivo: " + errUpload.message);
        // Guardar solo la ruta interna (NO la URL pública, porque el bucket es privado)
        archivoUrl = ruta;
      }

      // 2. Insertar la gestión
      const payload = {
        cliente_nit: nit,
        tipo,
        resultado,
        observacion: obs.trim(),
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre,
      };
      if (archivoUrl) payload.archivo_url = archivoUrl;

      const { data: g, error: e1 } = await supabase
        .from("gestiones")
        .insert(payload)
        .select("id")
        .single();
      if (e1) throw e1;

      // 3. Crear acuerdo de pago si aplica
      if (resultado === "Compromiso de pago") {
        const { error: e2 } = await supabase.from("acuerdos_pago").insert({
          cliente_nit: nit,
          gestion_id: g.id,
          fecha_compromiso: fechaComp,
          valor_comprometido: soloNumero(valorComp),
          estado: "Pendiente",
        });
        if (e2) throw e2;
      }

      // 4. Marcar/desmarcar en_seguro en el cliente
      if (resultado === "Trasladado a seguro") {
        await supabase.from("clientes").update({ en_seguro: true }).eq("nit", nit);
      }

      // Limpiar formulario
      setObs("");
      setFechaComp("");
      setValorComp("");
      setResultado("Contactado");
      setTipo("Llamada");
      setArchivoPDF(null);
      // Limpiar el input file visualmente
      const fileInput = document.getElementById("pdf-adjunto");
      if (fileInput) fileInput.value = "";

      setAviso({ tipo: "ok", txt: resultado === "Trasladado a seguro" ? "Gestión registrada. Cliente marcado como 'En seguro'." : "Gestión registrada correctamente." });
      await cargarTodo();
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error al guardar: " + (err?.message || "desconocido") });
    } finally {
      setGuardando(false);
    }
  }

  // Descargar archivo adjunto de una gestión del historial
  async function descargarAdjunto(url) {
    let ruta = url;
    const marcador = "/gestiones-adjuntos/";
    const idx = url.indexOf(marcador);
    if (idx !== -1) ruta = url.substring(idx + marcador.length);
    const { data, error } = await supabase.storage.from("gestiones-adjuntos").createSignedUrl(ruta, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else setAviso({ tipo: "error", txt: "No se pudo obtener el archivo. Verifica que existe en Storage." });
  }

  // Iniciar edición de una gestión (solo supervisor)
  function iniciarEdicion(h) {
    setEditId(h.id);
    setEditTipo(h.tipo);
    setEditResultado(h.resultado);
    setEditObs(h.observacion || "");
    setEditFechaComp("");
    setEditValorComp("");
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion() {
    if (editObs.trim().length < 20) {
      setAviso({ tipo: "error", txt: "La observación debe tener al menos 20 caracteres." });
      return;
    }
    if (editResultado === "Compromiso de pago" && (!editFechaComp || soloNumero(editValorComp) <= 0)) {
      setAviso({ tipo: "error", txt: "Para un compromiso de pago ingresa la fecha y el valor." });
      return;
    }
    setEditGuardando(true);
    setAviso(null);
    try {
      // 1. Actualizar la gestión
      await supabase.from("gestiones").update({
        tipo: editTipo,
        resultado: editResultado,
        observacion: editObs.trim(),
      }).eq("id", editId);

      // 2. Si cambió a "Compromiso de pago", crear el acuerdo
      if (editResultado === "Compromiso de pago" && editFechaComp && soloNumero(editValorComp) > 0) {
        await supabase.from("acuerdos_pago").insert({
          cliente_nit: nit,
          gestion_id: editId,
          fecha_compromiso: editFechaComp,
          valor_comprometido: soloNumero(editValorComp),
          estado: "Pendiente",
        });
      }

      // 3. Si cambió a "Trasladado a seguro", marcar el cliente
      if (editResultado === "Trasladado a seguro") {
        await supabase.from("clientes").update({ en_seguro: true }).eq("nit", nit);
      }

      setEditId(null);
      setAviso({ tipo: "ok", txt: "Gestión actualizada correctamente." + (editResultado === "Compromiso de pago" ? " Se creó el acuerdo de pago." : "") });
      await cargarTodo();
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error al guardar: " + (err?.message || "desconocido") });
    } finally {
      setEditGuardando(false);
    }
  }

  if (estado === "cargando") {
    return <AppShell active="plan" titulo="Cliente" subtitulo=""><p className="muted">Cargando ficha…</p></AppShell>;
  }

  const sinDatos = !resumen || resumen.documentos === 0;

  return (
    <AppShell active="plan" titulo={resumen?.nombre || nit} subtitulo={`NIT ${nit}`}>
      <Link href="/plan" className="volver">← Volver al plan diario</Link>

      {/* Banner "En seguro" visible si el cliente está marcado */}
      {enSeguro && (
        <div style={{
          background: "#eef0ff", border: "1px solid #c5caed", color: "#3b42a0",
          borderRadius: "var(--radio)", padding: "14px 18px", marginBottom: 18,
          fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          Este cliente está marcado como <b>«En manos del seguro»</b>. El cobro lo gestiona la aseguradora.
        </div>
      )}

      <div className="ficha-grid">
        <div className="panel">
          <h3>Datos generales</h3>
          <div className="dato"><span>NIT</span><b>{nit}</b></div>
          <div className="dato"><span>Cliente</span><b>{resumen?.nombre || "—"}</b></div>
          <div className="dato"><span>Ciudad</span><b>{resumen?.ciudad || "—"}</b></div>
          <div className="dato"><span>Vendedor</span><b>{resumen?.vendedor || "—"}</b></div>
          {enSeguro && (
            <div className="dato"><span>Estado de cobro</span><b style={{ color: "#3b42a0" }}>En manos del seguro</b></div>
          )}
          <div className="contacto-edit">
            {soloLectura ? (
              <>
                <div className="dato"><span>Teléfono</span><b>{contacto.telefono || "—"}</b></div>
                <div className="dato"><span>Correo</span><b>{contacto.correo || "—"}</b></div>
              </>
            ) : (
              <>
                <label className="field"><span>Teléfono</span>
                  <input value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} placeholder="Agregar teléfono" />
                </label>
                <label className="field"><span>Correo</span>
                  <input value={contacto.correo} onChange={(e) => setContacto({ ...contacto, correo: e.target.value })} placeholder="Agregar correo" />
                </label>
                <button className="btn-ghost-light" onClick={guardarContacto}>Guardar contacto</button>
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <h3>Resumen financiero</h3>
          {sinDatos ? <p className="muted">Este cliente no está en la cartera actual.</p> : (
            <>
              <div className="dato"><span>Saldo actual</span><b>{pesos(resumen.saldo)}</b></div>
              <div className="dato"><span>Cartera vigente</span><b style={{ color: "var(--verde)" }}>{pesos(resumen.vigente)}</b></div>
              <div className="dato"><span>Cartera vencida</span><b style={{ color: "var(--rojo)" }}>{pesos(resumen.vencida)}</b></div>
              <div className="dato"><span>Días de mora</span><b>{resumen.dias}</b></div>
              <div className="dato"><span>Facturas</span><b>{resumen.documentos}</b></div>
            </>
          )}
        </div>
      </div>

      {pred && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="pred-panel">
            <div>
              <h3 style={{ marginBottom: 4 }}>Predicción de pago</h3>
              <p className="muted">{pred.recomendacion}</p>
            </div>
            <div className="pred-num">
              <span className="pred-pct" style={{ color: pred.color }}>{pred.prob}%</span>
              <span className="pill" style={{ background: pred.color + "22", color: pred.color }}>Riesgo {pred.nivel}</span>
            </div>
          </div>
          <div style={{ marginTop: 14, borderTop: "1px solid var(--borde)", paddingTop: 14, display: "grid", gap: 8 }}>
            <span className="muted" style={{ fontWeight: 600 }}>Por qué este resultado:</span>
            {pred.factores.map((f) => {
              const col = f.efecto === "sube" ? "var(--verde)" : f.efecto === "baja" ? "var(--rojo)" : "var(--texto-suave)";
              return (
                <div key={f.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--texto-suave)", flex: 1 }}>{f.nombre}</span>
                  <span style={{ color: "var(--texto)" }}>{f.valor}</span>
                  <span style={{ color: col, fontWeight: 700, minWidth: 78, textAlign: "right" }}>
                    {f.efecto === "sube" ? "↑ sube" : f.efecto === "baja" ? "↓ baja" : "– neutro"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulario de gestión (solo auxiliar/supervisor) */}
      {soloLectura ? (
        <div className="lectura-aviso" style={{ marginTop: 18 }}>Tu rol es de <b>consulta</b> (solo lectura). Puedes ver el historial, pero no registrar gestiones.</div>
      ) : (
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Registrar gestión</h3>
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
          {resultado === "Compromiso de pago" && (
            <>
              <label className="field"><span>Fecha compromiso</span>
                <input type="date" value={fechaComp} onChange={(e) => setFechaComp(e.target.value)} />
              </label>
              <label className="field"><span>Valor compromiso</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valorComp}
                  onChange={(e) => setValorComp(formatearMiles(e.target.value))}
                  placeholder="$ 0"
                />
                <small style={{
                  marginTop: 4, fontSize: 12, fontWeight: 600, minHeight: 16,
                  color: valorComp ? "var(--azul)" : "var(--texto-suave)",
                }}>
                  {valorComp ? numeroALetras(soloNumero(valorComp)) : "Escribe solo los números; los puntos se ponen solos."}
                </small>
              </label>
            </>
          )}
        </div>

        {/* Aviso visual cuando se selecciona "Trasladado a seguro" */}
        {resultado === "Trasladado a seguro" && (
          <div style={{
            marginTop: 14, background: "#eef0ff", border: "1px solid #c5caed", color: "#3b42a0",
            borderRadius: 10, padding: "12px 14px", fontSize: 13,
          }}>
            Al guardar, este cliente quedará marcado como <b>«En manos del seguro»</b>.
            Se recomienda adjuntar el soporte (carta, acta o comunicado de la aseguradora).
          </div>
        )}

        <label className="field" style={{ marginTop: 14 }}>
          <span>Observación (mínimo 20 caracteres)</span>
          <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: Cliente se compromete a pagar el saldo el 30/06/2026." />
          <small className="muted">{obs.trim().length}/20</small>
        </label>

        {/* Sugerencia inteligente: detecta que la auxiliar menciona pago/fecha pero no usó "Compromiso de pago" */}
        {resultado !== "Compromiso de pago" && obs.trim().length >= 10 &&
          /pag(o|ar|ará|a)|compromet|compromiso|fecha|semana|cancel|abono|consign|transfer|gir|plaz|cuota/i.test(obs) && (
          <div
            onClick={() => setResultado("Compromiso de pago")}
            style={{
              marginTop: 8, padding: "12px 16px", borderRadius: 10, cursor: "pointer",
              background: "#fff8da", border: "1px solid #f0e2a0", color: "#8a6d00",
              fontSize: 13, display: "flex", alignItems: "flex-start", gap: 10,
              transition: "background .15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#fff3c4"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#fff8da"}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>💡</span>
            <div>
              <b>¿El cliente se comprometió a pagar en una fecha?</b>
              <p style={{ margin: "4px 0 0", color: "#6b5a00" }}>
                Cambia el resultado a <b>"Compromiso de pago"</b> para registrar la fecha y el valor. Así el sistema te avisará automáticamente cuando se acerque el vencimiento.
              </p>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--azul)", marginTop: 6, display: "inline-block" }}>
                👆 Clic aquí para cambiar a "Compromiso de pago"
              </span>
            </div>
          </div>
        )}

        {/* Upload de PDF (opcional, disponible en cualquier gestión) */}
        <label className="field" style={{ marginTop: 10 }}>
          <span>Adjuntar archivo (opcional) — PDF o imagen</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input
              id="pdf-adjunto"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setArchivoPDF(e.target.files?.[0] || null)}
              style={{
                border: "1px dashed var(--borde)", borderRadius: 10, padding: "10px 14px",
                background: "var(--gris-cl)", fontSize: 13, cursor: "pointer", maxWidth: 360,
              }}
            />
            {archivoPDF && (
              <span className="muted" style={{ fontSize: 12 }}>
                {archivoPDF.name} ({(archivoPDF.size / 1024).toFixed(0)} KB)
              </span>
            )}
          </div>
        </label>

        {aviso && <div className={`upload-msg ${aviso.tipo === "ok" ? "listo" : "error"}`}>{aviso.txt}</div>}
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={guardarGestion} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar gestión"}
        </button>
      </div>
      )}

      {/* Historial */}
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Historial de gestiones ({historial.length})</h3>
        {historial.length === 0 ? <p className="muted">Aún no hay gestiones registradas para este cliente.</p> : (
          <div className="historial">
            {historial.map((h) => {
              const esEditando = editId === h.id;

              if (esEditando) {
                return (
                  <div className="hist-item" key={h.id} style={{ background: "#eef6ff", borderRadius: 12, padding: 16, display: "block", border: "1px solid #cfe2fb" }}>
                    <p style={{ fontSize: 12, color: "var(--texto-suave)", marginBottom: 10 }}>
                      Editando gestión del {new Date(h.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <div className="form-gestion">
                      <label className="field"><span>Tipo de gestión</span>
                        <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)}>
                          {TIPOS.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="field"><span>Resultado</span>
                        <select value={editResultado} onChange={(e) => setEditResultado(e.target.value)}>
                          {RESULTADOS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </label>
                      {editResultado === "Compromiso de pago" && (
                        <>
                          <label className="field"><span>Fecha compromiso</span>
                            <input type="date" value={editFechaComp} onChange={(e) => setEditFechaComp(e.target.value)} />
                          </label>
                          <label className="field"><span>Valor compromiso</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editValorComp}
                              onChange={(e) => setEditValorComp(formatearMiles(e.target.value))}
                              placeholder="$ 0"
                            />
                            <small style={{
                              marginTop: 4, fontSize: 12, fontWeight: 600, minHeight: 16,
                              color: editValorComp ? "var(--azul)" : "var(--texto-suave)",
                            }}>
                              {editValorComp ? numeroALetras(soloNumero(editValorComp)) : "Escribe solo los números; los puntos se ponen solos."}
                            </small>
                          </label>
                        </>
                      )}
                    </div>
                    <label className="field" style={{ marginTop: 12 }}><span>Observación</span>
                      <textarea rows={3} value={editObs} onChange={(e) => setEditObs(e.target.value)} />
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        onClick={guardarEdicion}
                        disabled={editGuardando}
                        style={{
                          background: "var(--azul)", color: "#fff", border: "none", borderRadius: 8,
                          padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {editGuardando ? "Guardando…" : "Guardar cambios"}
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        style={{
                          background: "var(--gris-cl)", color: "var(--texto)", border: "1px solid var(--borde)",
                          borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="hist-item" key={h.id}>
                  <div className="hist-fecha">{new Date(h.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</div>
                  <div className="hist-cuerpo">
                    <span className="pill" style={{ background: "var(--gris-cl)", color: "var(--azul)" }}>{h.tipo}</span>
                    <span className="pill" style={{
                      background: h.resultado === "Trasladado a seguro" ? "#eef0ff" : "#eef6ff",
                      color: h.resultado === "Trasladado a seguro" ? "#3b42a0" : "var(--azul)",
                    }}>
                      {h.resultado}
                    </span>
                    {h.archivo_url && (
                      <button
                        onClick={() => descargarAdjunto(h.archivo_url)}
                        style={{
                          background: "#f3f6fb", border: "1px solid var(--borde)", borderRadius: 8,
                          padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "var(--azul)",
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {/\.(jpg|jpeg|png)$/i.test(h.archivo_url) ? "🖼️ Ver imagen adjunta" : "📎 Ver PDF adjunto"}
                      </button>
                    )}
                    {/* Botón editar: solo visible para supervisor */}
                    {usuario.rol === "supervisor" && (
                      <button
                        onClick={() => iniciarEdicion(h)}
                        style={{
                          background: "transparent", border: "1px solid var(--borde)", borderRadius: 8,
                          padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--texto-suave)",
                          cursor: "pointer", marginLeft: "auto",
                        }}
                      >
                        ✏️ Editar
                      </button>
                    )}
                    <p>{h.observacion}</p>
                    <small className="muted">Registrado por {h.usuario_nombre || "—"}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
