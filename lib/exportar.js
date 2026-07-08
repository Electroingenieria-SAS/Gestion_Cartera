// Utilidades para exportar tablas a Excel y PDF (100% en el navegador).
import * as XLSX from "xlsx";

// ─── Colores corporativos Electroingeniería ───
const AZUL = "00378A";
const AZUL_OSC = "00276A";
const ORO = "DDBC00";
const GRIS_CL = "F3F6FB";
const BLANCO = "FFFFFF";
const TEXTO = "0F1B33";
const TEXTO_SUAVE = "5B6B86";

// =========================================================
//  exportarExcel (básico, sin estilos) — compatibilidad
//  Lo siguen usando cartera y otras páginas.
// =========================================================
export function exportarExcel(nombreArchivo, filas, nombreHoja = "Datos") {
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

// =========================================================
//  exportarExcelEstilizado (con ExcelJS)
//  Genera un Excel profesional con colores corporativos,
//  formato moneda COP, bordes y anchos de columna.
//
//  columnas = [
//    { header: "Cliente", key: "cliente", width: 30 },
//    { header: "Valor", key: "valor", width: 18, formato: "moneda" },
//    ...
//  ]
//  filas = [ { cliente: "X", valor: 123456, ... }, ... ]
// =========================================================
export async function exportarExcelEstilizado(nombreArchivo, filas, columnas, opciones = {}) {
  const ExcelJS = (await import("exceljs")).default;

  const {
    nombreHoja = "Datos",
    titulo = null,           // Título grande arriba (ej: "Plan Diario de Cobranza")
    subtitulo = null,        // Línea debajo del título (ej: "8 de julio de 2026 · 82 clientes")
  } = opciones;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestión de Cartera — Electroingeniería S.A.S.";
  wb.created = new Date();

  const ws = wb.addWorksheet(nombreHoja, {
    views: [{ state: "frozen", ySplit: titulo ? 4 : 1 }],
  });

  // ── Anchos de columna ──
  ws.columns = columnas.map((c) => ({ key: c.key, width: c.width || 16 }));

  let filaInicio = 1;

  // ── Título + subtítulo (si se pasan) ──
  if (titulo) {
    // Fila 1: título con fondo azul oscuro
    ws.mergeCells(1, 1, 1, columnas.length);
    const celTitulo = ws.getCell("A1");
    celTitulo.value = titulo;
    celTitulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: BLANCO } };
    celTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSC } };
    celTitulo.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 36;

    // Fila 2: subtítulo
    ws.mergeCells(2, 1, 2, columnas.length);
    const celSub = ws.getCell("A2");
    celSub.value = subtitulo || "";
    celSub.font = { name: "Calibri", size: 11, color: { argb: TEXTO_SUAVE } };
    celSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CL } };
    celSub.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(2).height = 22;

    // Fila 3: separador vacío
    ws.getRow(3).height = 6;

    filaInicio = 4;
  }

  // ── Encabezados de columna ──
  const rowHead = ws.getRow(filaInicio);
  columnas.forEach((col, i) => {
    const cel = rowHead.getCell(i + 1);
    cel.value = col.header;
    cel.font = { name: "Calibri", size: 11, bold: true, color: { argb: BLANCO } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    cel.alignment = { vertical: "middle", horizontal: col.formato === "moneda" || col.formato === "numero" ? "right" : "left" };
    cel.border = {
      bottom: { style: "medium", color: { argb: ORO } },
    };
  });
  rowHead.height = 28;

  // ── Filas de datos ──
  filas.forEach((fila, idx) => {
    const r = ws.getRow(filaInicio + 1 + idx);
    const esPar = idx % 2 === 0;

    columnas.forEach((col, i) => {
      const cel = r.getCell(i + 1);
      const val = fila[col.key];
      cel.value = val;

      // Formato de número
      if (col.formato === "moneda") {
        cel.numFmt = '$ #,##0';
        cel.alignment = { horizontal: "right" };
      } else if (col.formato === "numero") {
        cel.numFmt = '#,##0';
        cel.alignment = { horizontal: "right" };
      } else {
        cel.alignment = { horizontal: "left", wrapText: true };
      }

      // Fuente
      cel.font = {
        name: "Calibri", size: 10.5,
        color: { argb: col.formato === "moneda" && typeof val === "number" && val > 0 ? "C0392B" : TEXTO },
        bold: col.bold || false,
      };

      // Color de fondo alterno
      cel.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: esPar ? BLANCO : GRIS_CL },
      };

      // Bordes sutiles
      cel.border = {
        bottom: { style: "thin", color: { argb: "E3E9F4" } },
      };
    });

    r.height = 22;
  });

  // ── Fila de totales (si hay columnas de moneda) ──
  const colsMoneda = columnas.filter((c) => c.formato === "moneda");
  if (colsMoneda.length > 0 && filas.length > 0) {
    const rTotal = ws.getRow(filaInicio + 1 + filas.length);
    rTotal.height = 26;

    // "TOTAL" en la primera columna
    const celLabel = rTotal.getCell(1);
    celLabel.value = "TOTAL";
    celLabel.font = { name: "Calibri", size: 11, bold: true, color: { argb: AZUL } };
    celLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CL } };
    celLabel.border = { top: { style: "medium", color: { argb: AZUL } }, bottom: { style: "medium", color: { argb: AZUL } } };

    columnas.forEach((col, i) => {
      const cel = rTotal.getCell(i + 1);
      if (col.formato === "moneda") {
        const suma = filas.reduce((s, f) => s + (Number(f[col.key]) || 0), 0);
        cel.value = suma;
        cel.numFmt = '$ #,##0';
        cel.alignment = { horizontal: "right" };
        cel.font = { name: "Calibri", size: 11, bold: true, color: { argb: "C0392B" } };
      } else if (i > 0) {
        cel.font = { name: "Calibri", size: 11 };
      }
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CL } };
      cel.border = { top: { style: "medium", color: { argb: AZUL } }, bottom: { style: "medium", color: { argb: AZUL } } };
    });
  }

  // ── Pie de página ──
  const filaPie = filaInicio + filas.length + 3;
  ws.mergeCells(filaPie, 1, filaPie, columnas.length);
  const celPie = ws.getCell(filaPie, 1);
  celPie.value = "Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya";
  celPie.font = { name: "Calibri", size: 9, italic: true, color: { argb: TEXTO_SUAVE } };

  // ── Generar y descargar ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================================================
//  exportarPDF (sin cambios)
// =========================================================
export async function exportarPDF(titulo, subtitulo, columnas, filas) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(0, 55, 138);
  doc.rect(0, 0, ancho, 52, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(titulo, 30, 26);
  doc.setFontSize(9);
  doc.setTextColor(207, 224, 255);
  doc.text(subtitulo, 30, 42);

  autoTable(doc, {
    startY: 66,
    head: [columnas.map((c) => c.header)],
    body: filas.map((f) => columnas.map((c) => f[c.key])),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [0, 55, 138], textColor: 255 },
    alternateRowStyles: { fillColor: [243, 246, 251] },
    margin: { left: 30, right: 30 },
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text("Construido para Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya", 30, alto - 14);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, ancho - 70, alto - 14);
    },
  });

  doc.save(`${titulo}.pdf`);
}

// Fecha corta para nombrar archivos: 2026-07-08
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
