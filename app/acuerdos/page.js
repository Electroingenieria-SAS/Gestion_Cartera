"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { pesos, num } from "../../lib/format";

const ESTADO_COLOR = {
  Pendiente: "var(--amarillo)", Cumplido: "var(--verde)",
  Incumplido: "var(--rojo)", Reprogramado: "var(--azul)",
};

export default function Acuerdos() {
  const [estado, setEstado] = useState("cargando");
  const [acuerdos, setAcuerdos] = useState([]);
  const [filtro, setFiltro] = useState("Pendiente");

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
    await supabase.from("acuerdos_pago").update({ estado: nuevo }).eq("id", id);
    await cargar();
  }

  const filtrados = filtro === "Todos" ? acuerdos : acuerdos.filter((a) => a.estado === filtro);

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
        <div className="filtros">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {["Pendiente", "Cumplido", "Incumplido", "Reprogramado", "Todos"].map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="resumen-filtro"><span><b>{num(filtrados.length)}</b> acuerdos</span></div>
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "26%" }} /><col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} /><col style={{ width: "14%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Cliente</th><th>Fecha compromiso</th>
                  <th style={{ textAlign: "right" }}>Valor</th><th>Estado</th><th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.nombre}</b><br /><span className="muted">{a.cliente_nit}</span></td>
                    <td>{new Date(a.fecha_compromiso + "T00:00:00").toLocaleDateString("es-CO")}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(a.valor_comprometido)}</td>
                    <td><span className="pill" style={{ background: ESTADO_COLOR[a.estado] + "22", color: ESTADO_COLOR[a.estado] }}>{a.estado}</span></td>
                    <td>
                      {a.estado === "Pendiente" ? (
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
                ))}
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
