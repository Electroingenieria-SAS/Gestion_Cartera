"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { pesos, num } from "../../lib/format";
import { exportarExcel, exportarPDF, hoyISO } from "../../lib/exportar";
import { supabase } from "../../lib/supabase";
import { parseFechaSiesa } from "../../lib/pronostico";

function fmtFechaSiesa(v) {
  const f = parseFechaSiesa(v);
  return f ? f.toLocaleDateString("es-CO") : "—";
}

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
  const [enviando, setEnviando] = useState(false);
  const [envioMsg, setEnvioMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }
      setDocs(docs);
      setEstado("ok");
    })();
  }, []);

  async function enviarReporte() {
    setEnviando(true);
    setEnvioMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/enviar-cartera-vencida", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await r.json();
      if (data.ok) setEnvioMsg({ tipo: "listo", txt: `Reporte enviado a ${data.destino}: ${data.facturas} facturas vencidas de ${data.clientes} clientes.` });
      else setEnvioMsg({ tipo: "error", txt: data.error || "No se pudo enviar." });
    } catch (e) {
      setEnvioMsg({ tipo: "error", txt: "Error de conexión al enviar." });
    } finally {
      setEnviando(false);
    }
  }

  const router = useRouter();

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

  function exportarAExcel() {
    const filas = filtrados.map((d) => ({
      NIT: d.nit,
      Cliente: d.nombre_cliente || "",
      Ciudad: d.ciudad || "",
      Vendedor: d.vendedor || "",
      Documento: d.numero_docto || "",
      Vencimiento: d.fecha_vencimiento || "",
      "Días vencido": parseInt(d.dias_vencidos) || 0,
      Rango: d.categoria || "",
      Saldo: Number(d.saldo) || 0,
    }));
    exportarExcel(`Cartera_${hoyISO()}`, filas, "Cartera");
  }

  function exportarAPDF() {
    const columnas = [
      { header: "NIT", key: "nit" }, { header: "Cliente", key: "cliente" },
      { header: "Ciudad", key: "ciudad" }, { header: "Vendedor", key: "vendedor" },
      { header: "Documento", key: "doc" }, { header: "Días", key: "dias" },
      { header: "Rango", key: "rango" }, { header: "Saldo", key: "saldo" },
    ];
    const filas = filtrados.map((d) => ({
      nit: d.nit, cliente: d.nombre_cliente || "", ciudad: d.ciudad || "", vendedor: d.vendedor || "",
      doc: d.numero_docto || "", dias: d.dias_vencidos || 0, rango: d.categoria || "", saldo: pesos(d.saldo),
    }));
    exportarPDF("Cartera", `${filtrados.length} facturas · ${new Date().toLocaleDateString("es-CO")}`, columnas, filas);
  }

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
        <div className="alert-toolbar">
          <button className="btn btn-primary" onClick={enviarReporte} disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar cartera vencida a mi correo"}
          </button>
          <button className="btn-ghost-light" onClick={exportarAExcel}>Exportar Excel</button>
          <button className="btn-ghost-light" onClick={exportarAPDF}>Exportar PDF</button>
          {envioMsg && <span className={`envio-msg ${envioMsg.tipo}`}>{envioMsg.txt}</span>}
        </div>

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
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/cliente/${encodeURIComponent(d.nit)}`)}
                    style={{ cursor: "pointer" }}
                    title="Ver ficha del cliente"
                    className="fila-click"
                  >
                    <td>{d.nit}</td>
                    <td><b style={{ color: "var(--azul)" }}>{d.nombre_cliente || "—"}</b></td>
                    <td>{d.ciudad || "—"}</td>
                    <td>{d.vendedor || "—"}</td>
                    <td>{d.numero_docto || "—"}</td>
                    <td>{fmtFechaSiesa(d.fecha_vencimiento)}</td>
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
