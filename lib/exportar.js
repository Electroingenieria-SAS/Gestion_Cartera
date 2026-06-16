// Utilidades para exportar tablas a Excel y PDF (100% en el navegador).
import * as XLSX from "xlsx";

// Excel: recibe un arreglo de objetos (cada objeto = una fila).
export function exportarExcel(nombreArchivo, filas, nombreHoja = "Datos") {
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

// PDF: columnas = [{ header, key }]; filas = arreglo de objetos.
// jsPDF se carga solo cuando se necesita (no pesa en la carga inicial).
export async function exportarPDF(titulo, subtitulo, columnas, filas) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();

  // Encabezado azul de marca.
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

// Fecha corta para nombrar archivos: 2026-06-16
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
