"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { getPerfil } from "../../lib/auth";
import { num } from "../../lib/format";

export default function Auditoria() {
  const [estado, setEstado] = useState("cargando");
  const [registros, setRegistros] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    (async () => {
      const perfil = await getPerfil();
      if (!perfil || perfil.rol !== "supervisor") {
        setEstado("denegado");
        return;
      }
      const { data } = await supabase
        .from("auditoria")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(300);
      setRegistros(data || []);
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
  } else if (registros.length === 0) {
    contenido = (
      <div className="empty">
        <div className="empty-ico">❑</div>
        <h2>Sin actividad registrada todavía</h2>
        <p>Aquí aparecerá cada carga, gestión y acuerdo que realice el equipo.</p>
      </div>
    );
  } else {
    contenido = (
      <>
        <div className="filtros">
          <input placeholder="Buscar por usuario, acción o detalle…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="resumen-filtro"><span><b>{num(filtrados.length)}</b> registros (últimos 300)</span></div>
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
      </>
    );
  }

  return (
    <AppShell active="auditoria" titulo="Auditoría" subtitulo="Registro de actividad del equipo">
      {contenido}
    </AppShell>
  );
}
