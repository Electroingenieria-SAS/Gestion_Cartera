"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { getBandejaJuridica } from "../../lib/juridico";
import { pesos } from "../../lib/format";
import { exportarExcelEstilizado, exportarPDF, hoyISO } from "../../lib/exportar";
import { Scale } from "lucide-react";

// Bandeja del rol jurídico: SOLO los clientes que le enviaron a cobro jurídico.
// Es el equivalente al "plan diario" para la persona de cobranza jurídica.
export default function BandejaJuridica() {
  const [estado, setEstado] = useState("cargando");
  const [lista, setLista] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    (async () => {
      const filas = await getBandejaJuridica();
      setLista(filas);
      setEstado(filas.length === 0 ? "vacio" : "ok");
    })();
  }, []);

  const b = busqueda.trim().toLowerCase();
  const mostradas = b
    ? lista.filter((f) => `${f.nombre || ""} ${f.nit || ""}`.toLowerCase().includes(b))
    : lista;

  const totalVencido = lista.reduce((s, f) => s + (f.vencido || 0), 0);

  function exportarAExcel() {
    const columnas = [
      { header: "#", key: "n", width: 6, formato: "numero" },
      { header: "Cliente", key: "cliente", width: 34, bold: true },
      { header: "NIT", key: "nit", width: 14 },
      { header: "Ciudad", key: "ciudad", width: 16 },
      { header: "Valor vencido", key: "vencido", width: 20, formato: "moneda" },
      { header: "Días mora", key: "dias", width: 12, formato: "numero" },
      { header: "En jurídico desde", key: "envio", width: 18 },
      { header: "Última gestión", key: "ultima", width: 16 },
    ];
    const filas = mostradas.map((f, i) => ({
      n: i + 1,
      cliente: f.nombre || f.nit,
      nit: f.nit,
      ciudad: f.ciudad || "",
      vencido: Number(f.vencido) || 0,
      dias: f.dias,
      envio: f.fechaEnvio ? new Date(f.fechaEnvio).toLocaleDateString("es-CO") : "—",
      ultima: f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : "Nunca",
    }));
    exportarExcelEstilizado(`CobroJuridico_${hoyISO()}`, filas, columnas, {
      nombreHoja: "Cobro jurídico",
      titulo: "Cartera en Cobro Jurídico — Electroingeniería S.A.S.",
      subtitulo: `${new Date().toLocaleDateString("es-CO")}  ·  ${mostradas.length} clientes`,
    });
  }

  function exportarAPDF() {
    const columnas = [
      { header: "#", key: "n" }, { header: "Cliente", key: "cliente" }, { header: "NIT", key: "nit" },
      { header: "Valor vencido", key: "vencido" }, { header: "Días", key: "dias" },
      { header: "En jurídico desde", key: "envio" }, { header: "Última gestión", key: "ultima" },
    ];
    const filas = mostradas.map((f, i) => ({
      n: i + 1, cliente: f.nombre || f.nit, nit: f.nit,
      vencido: pesos(f.vencido), dias: f.dias,
      envio: f.fechaEnvio ? new Date(f.fechaEnvio).toLocaleDateString("es-CO") : "—",
      ultima: f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : "Nunca",
    }));
    exportarPDF("Cobro jurídico", `${mostradas.length} clientes · ${new Date().toLocaleDateString("es-CO")}`, columnas, filas);
  }

  let contenido;
  if (estado === "cargando") {
    contenido = <p className="muted">Cargando bandeja jurídica…</p>;
  } else if (estado === "vacio") {
    contenido = (
      <div className="empty">
        <div className="empty-ico"><Scale size={30} strokeWidth={2} /></div>
        <h2>No hay clientes en cobro jurídico</h2>
        <p>Cuando cartera envíe un cliente a cobro jurídico, aparecerá aquí.</p>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="plan-banner" style={{ borderColor: "#d23b3b", background: "#fdeaea", color: "#8a1f1f" }}>
          Tienes <b>{lista.length}</b> cliente{lista.length > 1 ? "s" : ""} en cobro jurídico ·
          Total vencido en jurídico: <b>{pesos(totalVencido)}</b>
        </div>

        <div className="filtros" style={{ marginTop: 14 }}>
          <input placeholder="Buscar cliente o NIT…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && <button className="btn-ghost-light" onClick={() => setBusqueda("")}>Limpiar</button>}
          <button className="btn-ghost-light" onClick={exportarAExcel}>Exportar Excel</button>
          <button className="btn-ghost-light" onClick={exportarAPDF}>Exportar PDF</button>
          <span className="muted" style={{ alignSelf: "center" }}>Mostrando {mostradas.length} clientes</span>
        </div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabla-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: "right" }}>Valor vencido</th>
                  <th style={{ textAlign: "right" }}>Días mora</th>
                  <th>En jurídico desde</th>
                  <th>Última gestión</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((f, i) => (
                  <tr key={f.nit}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{f.nombre || f.nit}</b>
                      <br /><span className="muted">{f.nit} · {f.ciudad || "—"}</span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--rojo)", fontWeight: 700 }}>{pesos(f.vencido)}</td>
                    <td style={{ textAlign: "right" }}>{f.dias}</td>
                    <td>{f.fechaEnvio ? new Date(f.fechaEnvio).toLocaleDateString("es-CO") : <span className="muted">—</span>}</td>
                    <td>{f.ultima ? new Date(f.ultima).toLocaleDateString("es-CO") : <span className="muted">Nunca</span>}</td>
                    <td><Link href={`/cliente/${encodeURIComponent(f.nit)}`} className="btn-mini">Gestionar</Link></td>
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
    <AppShell active="juridico" titulo="Cobro jurídico" subtitulo="Clientes trasladados a cobranza jurídica">
      {contenido}
    </AppShell>
  );
}
