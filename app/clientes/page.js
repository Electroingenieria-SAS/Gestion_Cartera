"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getCargaActual } from "../../lib/cartera";
import { pesos, num } from "../../lib/format";

export default function Clientes() {
  const [estado, setEstado] = useState("cargando");
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    (async () => {
      const { carga, docs } = await getCargaActual();
      if (!carga) { setEstado("vacio"); return; }
      const cli = {};
      for (const d of docs) {
        const k = d.nit;
        if (!cli[k]) cli[k] = { nit: k, nombre: d.nombre_cliente, ciudad: d.ciudad, vendedor: d.vendedor, total: 0, vencido: 0 };
        const s = Number(d.saldo) || 0;
        cli[k].total += s;
        if (d.categoria && d.categoria !== "Vigente") cli[k].vencido += s;
      }
      setClientes(Object.values(cli).sort((a, b) => b.total - a.total));
      setEstado("ok");
    })();
  }, []);

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return clientes;
    return clientes.filter((c) => `${c.nombre || ""} ${c.nit}`.toLowerCase().includes(b));
  }, [clientes, busqueda]);

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando clientes…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico">◍</div>
        <h2>Aún no hay clientes</h2>
        <p>Sube tu archivo de Siesa para ver tus clientes.</p>
        <Link href="/cargar" className="btn btn-primary">Subir archivo de Siesa</Link>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="filtros">
          <input placeholder="Buscar cliente o NIT…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="resumen-filtro"><span><b>{num(filtrados.length)}</b> clientes</span></div>
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cliente</th><th>Ciudad</th><th>Vendedor</th>
                  <th style={{ textAlign: "right" }}>Saldo total</th>
                  <th style={{ textAlign: "right" }}>Vencido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 500).map((c) => (
                  <tr key={c.nit}>
                    <td><b>{c.nombre || "—"}</b><br /><span className="muted">{c.nit}</span></td>
                    <td>{c.ciudad || "—"}</td>
                    <td>{c.vendedor || "—"}</td>
                    <td style={{ textAlign: "right" }}>{pesos(c.total)}</td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{pesos(c.vencido)}</td>
                    <td><Link href={`/cliente/${encodeURIComponent(c.nit)}`} className="btn-mini">Ver ficha</Link></td>
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
    <AppShell active="clientes" titulo="Clientes" subtitulo="Listado de clientes de la cartera actual">
      {contenido}
    </AppShell>
  );
}
