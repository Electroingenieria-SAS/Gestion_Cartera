"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { pesos } from "../../lib/format";
import { ArrowRight } from "lucide-react";

// =========================================================
//  BannerCompromisos
//  Aviso en el Dashboard cuando hay acuerdos de pago PENDIENTES
//  que vencen hoy o que ya se pasaron de la fecha.
//
//  Consulta directamente la tabla acuerdos_pago (es pequeña),
//  NO descarga toda la cartera.
// =========================================================

const MS_DIA = 86400000;

export default function BannerCompromisos() {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const { data: acu } = await supabase
          .from("acuerdos_pago")
          .select("id, cliente_nit, fecha_compromiso, valor_comprometido")
          .eq("estado", "Pendiente")
          .lte("fecha_compromiso", hoy.toISOString().slice(0, 10))
          .order("fecha_compromiso", { ascending: true });

        const lista = acu || [];
        if (lista.length === 0) {
          if (activo) setDatos({ vencenHoy: [], vencidos: [] });
          return;
        }

        // Nombres de los clientes involucrados
        const nits = [...new Set(lista.map((a) => a.cliente_nit))];
        const nombres = {};
        const { data: cli } = await supabase.from("clientes").select("nit, nombre").in("nit", nits);
        for (const c of cli || []) nombres[c.nit] = c.nombre;

        const vencenHoy = [];
        const vencidos = [];

        for (const a of lista) {
          const f = new Date(a.fecha_compromiso + "T00:00:00");
          const dias = Math.floor((hoy - f) / MS_DIA);
          const item = {
            ...a,
            nombre: nombres[a.cliente_nit] || a.cliente_nit,
            dias,
          };
          if (dias === 0) vencenHoy.push(item);
          else if (dias > 0) vencidos.push(item);
        }

        vencidos.sort((a, b) => b.dias - a.dias);
        if (activo) setDatos({ vencenHoy, vencidos });
      } catch {
        if (activo) setDatos({ vencenHoy: [], vencidos: [] });
      }
    })();

    return () => { activo = false; };
  }, []);

  if (!datos) return null;

  const { vencenHoy, vencidos } = datos;
  if (vencenHoy.length === 0 && vencidos.length === 0) return null;

  const hayVencidos = vencidos.length > 0;
  const color = hayVencidos ? "#d23b3b" : "#d9a400";
  const fondo = hayVencidos ? "#fdeaea" : "#fff7d6";
  const borde = hayVencidos ? "#f3c4c4" : "#f0e2a0";

  const totalHoy = vencenHoy.reduce((s, a) => s + (Number(a.valor_comprometido) || 0), 0);
  const totalVencido = vencidos.reduce((s, a) => s + (Number(a.valor_comprometido) || 0), 0);

  // Hasta 4 clientes de muestra, priorizando los ya vencidos.
  const muestra = [...vencidos, ...vencenHoy].slice(0, 4);
  const sobrantes = vencidos.length + vencenHoy.length - muestra.length;

  return (
    <div
      style={{
        background: fondo,
        border: `1px solid ${borde}`,
        borderLeft: `5px solid ${color}`,
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <strong style={{ color, fontSize: 15 }}>
            {hayVencidos ? "Compromisos de pago vencidos" : "Compromisos de pago que vencen hoy"}
          </strong>
          <div style={{ fontSize: 13, color: "#5b6b86", marginTop: 4 }}>
            {vencidos.length > 0 && (
              <span>
                <b style={{ color: "#d23b3b" }}>{vencidos.length}</b> vencido{vencidos.length > 1 ? "s" : ""} por{" "}
                <b>{pesos(totalVencido)}</b>
                {vencidos[0] && ` · el más atrasado hace ${vencidos[0].dias} día${vencidos[0].dias > 1 ? "s" : ""}`}
              </span>
            )}
            {vencidos.length > 0 && vencenHoy.length > 0 && <span style={{ margin: "0 8px" }}>·</span>}
            {vencenHoy.length > 0 && (
              <span>
                <b style={{ color: "#d9a400" }}>{vencenHoy.length}</b> vence{vencenHoy.length > 1 ? "n" : ""} hoy por{" "}
                <b>{pesos(totalHoy)}</b>
              </span>
            )}
          </div>
        </div>

        <Link
          href="/acuerdos"
          style={{
            background: color, color: "#fff", textDecoration: "none",
            borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          Ver acuerdos <ArrowRight size={15} />
        </Link>
      </div>

      {/* Clientes concretos, para que la auxiliar sepa a quién llamar sin salir del dashboard */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {muestra.map((a) => (
          <Link
            key={a.id}
            href={`/cliente/${encodeURIComponent(a.cliente_nit)}`}
            style={{
              background: "#fff", border: `1px solid ${borde}`, borderRadius: 9,
              padding: "7px 12px", fontSize: 12, textDecoration: "none", color: "#0f1b33",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <b style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.nombre}
            </b>
            <span style={{ color: "#5b6b86" }}>{pesos(a.valor_comprometido)}</span>
            <span style={{ color: a.dias > 0 ? "#d23b3b" : "#d9a400", fontWeight: 700 }}>
              {a.dias === 0 ? "vence hoy" : `hace ${a.dias}d`}
            </span>
          </Link>
        ))}
        {sobrantes > 0 && (
          <span style={{ alignSelf: "center", fontSize: 12, color: "#5b6b86" }}>y {sobrantes} más…</span>
        )}
      </div>
    </div>
  );
}
