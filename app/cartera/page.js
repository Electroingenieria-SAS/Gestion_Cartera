"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { pesos, num } from "../../lib/format";

const COL_CAT = {
  "Vigente": "#15a36b", "Vencido 1 a 30": "#ddbc00",
  "Vencido 31 a 60": "#e8930c", "Vencido 61 a 90": "#e2632b", "Vencido 91 >": "#d23b3b",
};
const MAX_FILAS = 500;

export default function Cartera() {
  const [estado, setEstado] = useState("cargando");
  const [docs, setDocs] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [categoria, setCategoria] = useState("");

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }
      setDocs(docs);
      setEstado("ok");
    })();
  }, []);

  const vendedores = useMemo(() => [...new Set(docs.map((d) => d.vendedor).filter(Boolean))].sort(), [docs]);
  const ciudades = useMemo(() => [...new Set(docs.map((d) => d.ciudad).filter(Boolean))].sort(), [docs]);
  const categorias = ["Vigente", "Vencido 1 a 30", "Vencido 31 a 60", "Vencido 61 a 90", "Vencido 91 >"];

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return docs.filter((d) => {
      if (b && !(`${d.nombre_cliente || ""} ${d.nit || ""}`.toLowerCase().includes(b))) return false;
      if (vendedor && d.vendedor !== vendedor) return false;
      if (ciudad && d.ciudad !== ciudad) return false;
      if (categoria && d.categoria !== categoria) return false;
      return true;
    });
  }, [docs, busqueda, vendedor, ciudad, categoria]);

  const sumaFiltrada = useMemo(() => filtrados.reduce((s, d) => s + (Number(d.saldo) || 0), 0), [filtrados]);

  function limpiar() { setBusqueda(""); setVendedor(""); setCiudad(""); setCategoria(""); }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando cartera…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">▤</div>
        <h2>Aún no hay cartera cargada</h2>
        <p>Sube tu archivo de Siesa para ver las facturas.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="filtros">
          <input placeholder="Buscar cliente o NIT…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
            <option value="">Todas las ciudades</option>
            {ciudades.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todos los rangos</option>
            {categorias.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button className="btn-ghost-light" onClick={limpiar}>Limpiar</button>
        </div>

        <div className="resumen-filtro">
          <span><b>{num(filtrados.length)}</b> facturas</span>
          <span>Saldo filtrado: <b>{pesos(sumaFiltrada)}</b></span>
        </div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <colgroup>
                <col style={{ width: "9%" }} /><col style={{ width: "20%" }} />
                <col style={{ width: "11%" }} /><col style={{ width: "16%" }} />
                <col style={{ width: "9%" }} /><col style={{ width: "10%" }} />
                <col style={{ width: "6%" }} /><col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>NIT</th><th>Cliente</th><th>Ciudad</th><th>Vendedor</th>
                  <th>Documento</th><th>Vencimiento</th>
                  <th style={{ textAlign: "right" }}>Días</th>
                  <th>Rango</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, MAX_FILAS).map((d) => (
                  <tr key={d.id}>
                    <td>{d.nit}</td>
                    <td><b>{d.nombre_cliente || "—"}</b></td>
                    <td>{d.ciudad || "—"}</td>
                    <td>{d.vendedor || "—"}</td>
                    <td>{d.numero_docto || "—"}</td>
                    <td>{d.fecha_vencimiento || "—"}</td>
                    <td style={{ textAlign: "right" }}>{d.dias_vencidos}</td>
                    <td>
                      <span className="pill" style={{ background: (COL_CAT[d.categoria] || "#888") + "22", color: COL_CAT[d.categoria] || "#555" }}>
                        {d.categoria || "—"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{pesos(d.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > MAX_FILAS && (
            <p className="muted" style={{ padding: "12px 16px" }}>
              Mostrando las primeras {num(MAX_FILAS)} de {num(filtrados.length)} facturas. Usa los filtros para afinar.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <AppShell active="cartera" titulo="Cartera" subtitulo="Detalle de facturas">
      {contenido}
    </AppShell>
  );
}
