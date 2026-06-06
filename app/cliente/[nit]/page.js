"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import { supabase } from "../../../lib/supabase";
import { getResumenCliente } from "../../../lib/cartera";
import { pesos } from "../../../lib/format";

const TIPOS = ["Llamada", "WhatsApp", "Correo", "Visita"];
const RESULTADOS = ["Contactado", "No contesta", "Número errado", "Compromiso de pago", "Pago parcial", "Pago total", "Requiere seguimiento"];

export default function FichaCliente() {
  const nit = decodeURIComponent(useParams().nit || "");
  const [estado, setEstado] = useState("cargando");
  const [resumen, setResumen] = useState(null);
  const [contacto, setContacto] = useState({ telefono: "", correo: "" });
  const [historial, setHistorial] = useState([]);
  const [usuario, setUsuario] = useState({ id: null, nombre: "" });

  // Formulario de gestión
  const [tipo, setTipo] = useState("Llamada");
  const [resultado, setResultado] = useState("Contactado");
  const [obs, setObs] = useState("");
  const [fechaComp, setFechaComp] = useState("");
  const [valorComp, setValorComp] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  async function cargarTodo() {
    const r = await getResumenCliente(nit);
    setResumen(r);
    const { data: cli } = await supabase.from("clientes").select("telefono, correo").eq("nit", nit).single();
    if (cli) setContacto({ telefono: cli.telefono || "", correo: cli.correo || "" });
    const { data: hist } = await supabase.from("gestiones").select("*").eq("cliente_nit", nit).order("fecha", { ascending: false });
    setHistorial(hist || []);
    setEstado("ok");
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase.from("profiles").select("nombre").eq("id", session.user.id).single();
        setUsuario({ id: session.user.id, nombre: p?.nombre || session.user.email });
      }
      await cargarTodo();
    })();
  }, [nit]);

  async function guardarContacto() {
    await supabase.from("clientes").update({ telefono: contacto.telefono, correo: contacto.correo }).eq("nit", nit);
    setAviso({ tipo: "ok", txt: "Contacto guardado." });
  }

  async function guardarGestion() {
    setAviso(null);
    if (obs.trim().length < 20) {
      setAviso({ tipo: "error", txt: "La observación debe tener al menos 20 caracteres." });
      return;
    }
    if (resultado === "Compromiso de pago" && (!fechaComp || !valorComp)) {
      setAviso({ tipo: "error", txt: "Para un compromiso de pago ingresa la fecha y el valor." });
      return;
    }
    setGuardando(true);
    try {
      const { data: g, error: e1 } = await supabase
        .from("gestiones")
        .insert({ cliente_nit: nit, tipo, resultado, observacion: obs.trim(), usuario_id: usuario.id, usuario_nombre: usuario.nombre })
        .select("id")
        .single();
      if (e1) throw e1;

      if (resultado === "Compromiso de pago") {
        const { error: e2 } = await supabase.from("acuerdos_pago").insert({
          cliente_nit: nit, gestion_id: g.id, fecha_compromiso: fechaComp, valor_comprometido: Number(valorComp) || 0, estado: "Pendiente",
        });
        if (e2) throw e2;
      }
      setObs(""); setFechaComp(""); setValorComp(""); setResultado("Contactado"); setTipo("Llamada");
      setAviso({ tipo: "ok", txt: "Gestión registrada correctamente." });
      await cargarTodo();
    } catch (err) {
      setAviso({ tipo: "error", txt: "Error al guardar: " + (err?.message || "desconocido") });
    } finally {
      setGuardando(false);
    }
  }

  if (estado === "cargando") {
    return <AppShell active="plan" titulo="Cliente" subtitulo=""><p className="muted">Cargando ficha…</p></AppShell>;
  }

  const sinDatos = !resumen || resumen.documentos === 0;

  return (
    <AppShell active="plan" titulo={resumen?.nombre || nit} subtitulo={`NIT ${nit}`}>
      <Link href="/plan" className="volver">← Volver al plan diario</Link>

      <div className="ficha-grid">
        {/* Datos generales */}
        <div className="panel">
          <h3>Datos generales</h3>
          <div className="dato"><span>NIT</span><b>{nit}</b></div>
          <div className="dato"><span>Cliente</span><b>{resumen?.nombre || "—"}</b></div>
          <div className="dato"><span>Ciudad</span><b>{resumen?.ciudad || "—"}</b></div>
          <div className="dato"><span>Vendedor</span><b>{resumen?.vendedor || "—"}</b></div>
          <div className="contacto-edit">
            <label className="field"><span>Teléfono</span>
              <input value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} placeholder="Agregar teléfono" />
            </label>
            <label className="field"><span>Correo</span>
              <input value={contacto.correo} onChange={(e) => setContacto({ ...contacto, correo: e.target.value })} placeholder="Agregar correo" />
            </label>
            <button className="btn-ghost-light" onClick={guardarContacto}>Guardar contacto</button>
          </div>
        </div>

        {/* Resumen financiero */}
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

      {/* Formulario de gestión */}
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
                <input type="number" value={valorComp} onChange={(e) => setValorComp(e.target.value)} placeholder="$" />
              </label>
            </>
          )}
        </div>
        <label className="field" style={{ marginTop: 14 }}>
          <span>Observación (mínimo 20 caracteres)</span>
          <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: Cliente se compromete a pagar el saldo el 30/06/2026." />
          <small className="muted">{obs.trim().length}/20</small>
        </label>
        {aviso && <div className={`upload-msg ${aviso.tipo === "ok" ? "listo" : "error"}`}>{aviso.txt}</div>}
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={guardarGestion} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar gestión"}
        </button>
      </div>

      {/* Historial */}
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Historial de gestiones ({historial.length})</h3>
        {historial.length === 0 ? <p className="muted">Aún no hay gestiones registradas para este cliente.</p> : (
          <div className="historial">
            {historial.map((h) => (
              <div className="hist-item" key={h.id}>
                <div className="hist-fecha">{new Date(h.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</div>
                <div className="hist-cuerpo">
                  <span className="pill" style={{ background: "var(--gris-cl)", color: "var(--azul)" }}>{h.tipo}</span>
                  <span className="pill" style={{ background: "#eef6ff", color: "var(--azul)" }}>{h.resultado}</span>
                  <p>{h.observacion}</p>
                  <small className="muted">Registrado por {h.usuario_nombre || "—"}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
