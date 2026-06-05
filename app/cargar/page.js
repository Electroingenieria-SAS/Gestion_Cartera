"use client";

import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabase";
import { millones, num, pct } from "../../lib/format";

const COLUMNAS_REQUERIDAS = [
  "Cliente",
  "Nombre Cliente",
  "Saldo_final",
  "Categoria",
  "Dias_vencidos_f_vcto",
];

export default function Cargar() {
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState("idle");
  const [mensaje, setMensaje] = useState("");
  const [resumen, setResumen] = useState(null);

  function elegir(e) {
    const f = e.target.files?.[0];
    if (f) {
      setArchivo(f);
      setEstado("idle");
      setMensaje("");
      setResumen(null);
    }
  }

  async function procesar() {
    if (!archivo) return;
    try {
      setEstado("procesando");
      setMensaje("Leyendo el archivo…");

      const buf = await archivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const crudo = XLSX.utils.sheet_to_json(sheet, { range: 5, defval: null });

      const filas = crudo.map((r) => {
        const o = {};
        for (const k in r) o[String(k).trim()] = r[k];
        return o;
      });

      const presentes = filas.length ? Object.keys(filas[0]) : [];
      const faltan = COLUMNAS_REQUERIDAS.filter((c) => !presentes.includes(c));
      if (filas.length === 0 || faltan.length > 0) {
        setEstado("error");
        setMensaje(
          "Este archivo no tiene el formato de Siesa esperado. " +
            (faltan.length ? "Faltan columnas: " + faltan.join(", ") + ". " : "") +
            "Verifica que los encabezados estén en la fila 6."
        );
        return;
      }

      const docs = filas
        .filter((r) => r["Cliente"] != null && String(r["Cliente"]).trim() !== "")
        .map((r) => ({
          nit: String(r["Cliente"]).trim(),
          nombre_cliente: r["Nombre Cliente"] ?? null,
          ciudad: r["Descripcion Mun Cliente"] ?? null,
          vendedor: r["Razon_social_vend"] ?? null,
          nit_vendedor: r["Nit_tercero_vend"] != null ? String(r["Nit_tercero_vend"]) : null,
          tipo_docto: r["Tipo_docto_cruce"] ?? null,
          numero_docto: r["Numero_docto_cruce"] != null ? String(r["Numero_docto_cruce"]) : null,
          fecha_docto: r["Fecha_docto_cruce"] != null ? String(r["Fecha_docto_cruce"]) : null,
          fecha_vencimiento: r["Fecha_vencimiento"] != null ? String(r["Fecha_vencimiento"]) : null,
          condicion_pago: r["Condicion_pago"] != null ? String(r["Condicion_pago"]) : null,
          cupo: Number(r["Cupo Cliente"]) || 0,
          valor_original: Number(r["Valor_original"]) || 0,
          saldo: Number(r["Saldo_final"]) || 0,
          dias_vencidos: parseInt(r["Dias_vencidos_f_vcto"]) || 0,
          categoria: r["Categoria"] ?? null,
        }));

      if (docs.length === 0) {
        setEstado("error");
        setMensaje("No se encontraron filas con datos de clientes en el archivo.");
        return;
      }

      setMensaje("Calculando indicadores…");
      const total = docs.reduce((s, d) => s + d.saldo, 0);
      const vigente = docs.filter((d) => d.categoria === "Vigente").reduce((s, d) => s + d.saldo, 0);
      const vencida = total - vigente;
      const nits = new Set(docs.map((d) => d.nit));
      const nitsMora = new Set(
        docs.filter((d) => d.categoria && d.categoria !== "Vigente" && d.saldo > 0).map((d) => d.nit)
      );
      const nitsRiesgo = new Set(docs.filter((d) => d.categoria === "Vencido 91 >").map((d) => d.nit));

      const indic = {
        total_documentos: docs.length,
        cartera_total: total,
        cartera_vigente: vigente,
        cartera_vencida: vencida,
        pct_vencida: total > 0 ? (vencida / total) * 100 : 0,
        clientes_totales: nits.size,
        clientes_mora: nitsMora.size,
        clientes_riesgo: nitsRiesgo.size,
      };

      setMensaje("Guardando la carga…");
      const { data: { session } } = await supabase.auth.getSession();
      const { data: cargaIns, error: e1 } = await supabase
        .from("cargas")
        .insert({ nombre_archivo: archivo.name, usuario_id: session?.user?.id, ...indic })
        .select("id")
        .single();
      if (e1) throw e1;
      const cargaId = cargaIns.id;

      const conCarga = docs.map((d) => ({ ...d, carga_id: cargaId }));
      const LOTE = 500;
      for (let i = 0; i < conCarga.length; i += LOTE) {
        setMensaje(`Guardando documentos… ${Math.min(i + LOTE, conCarga.length)}/${conCarga.length}`);
        const { error: e2 } = await supabase.from("cartera_documentos").insert(conCarga.slice(i, i + LOTE));
        if (e2) throw e2;
      }

      setMensaje("Actualizando clientes…");
      const mapaCli = {};
      for (const d of docs) {
        mapaCli[d.nit] = {
          nit: d.nit,
          nombre: d.nombre_cliente,
          ciudad: d.ciudad,
          vendedor: d.vendedor,
          actualizado_en: new Date().toISOString(),
        };
      }
      const clientes = Object.values(mapaCli);
      for (let i = 0; i < clientes.length; i += LOTE) {
        const { error: e3 } = await supabase.from("clientes").upsert(clientes.slice(i, i + LOTE), { onConflict: "nit" });
        if (e3) throw e3;
      }

      setResumen(indic);
      setEstado("listo");
      setMensaje("¡Carga completada correctamente!");
    } catch (err) {
      setEstado("error");
      setMensaje(
        "Ocurrió un error al guardar: " +
          (err?.message || "desconocido") +
          ". Revisa que ya ejecutaste el script SQL de la Fase 3 en Supabase."
      );
    }
  }

  return (
    <AppShell active="cargar" titulo="Cargar archivo de Siesa" subtitulo="Sube el Excel diario de cartera">
      <div className="upload-card">
        <div className="upload-step">
          <span className="step-n">1</span>
          <div style={{ flex: 1 }}>
            <strong>Selecciona el archivo de Siesa</strong>
            <p className="muted">Formato Excel (.xlsx). Los encabezados deben estar en la fila 6.</p>
            <label className="file-input">
              <input type="file" accept=".xlsx,.xls" onChange={elegir} />
              <span>{archivo ? archivo.name : "Elegir archivo…"}</span>
            </label>
          </div>
        </div>

        <div className="upload-step">
          <span className="step-n">2</span>
          <div style={{ flex: 1 }}>
            <strong>Procesar y guardar</strong>
            <p className="muted">El sistema lee el archivo, calcula los indicadores y guarda la carga del día.</p>
            <button className="btn btn-primary" onClick={procesar} disabled={!archivo || estado === "procesando"}>
              {estado === "procesando" ? "Procesando…" : "Procesar archivo"}
            </button>
          </div>
        </div>

        {mensaje && <div className={`upload-msg ${estado}`}>{mensaje}</div>}

        {estado === "listo" && resumen && (
          <div className="upload-resumen">
            <h3>Resumen de la carga</h3>
            <ul>
              <li><span>Cartera total</span><b>{millones(resumen.cartera_total)}</b></li>
              <li><span>Cartera vencida</span><b>{millones(resumen.cartera_vencida)} ({pct(resumen.pct_vencida)})</b></li>
              <li><span>Clientes</span><b>{num(resumen.clientes_totales)}</b></li>
              <li><span>Documentos guardados</span><b>{num(resumen.total_documentos)}</b></li>
            </ul>
            <Link href="/dashboard" className="btn btn-primary">Ver el dashboard</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
