// =========================================================
//  lib/etapas.js
//  Clasificación de clientes por ETAPA DEL PROCESO DE COBRANZA
//  según los rangos de días de mora definidos por la empresa:
//
//    Preventiva       → días de mora <= 0   (aún vigente)
//    Administrativa   → 1 a 49 días de mora
//    Pre-jurídica     → 50 a 70 días de mora
//    Jurídica         → 71 días en adelante
//
//  Si mañana la empresa cambia los rangos, se modifica
//  únicamente este archivo. Sin tocar páginas ni componentes.
// =========================================================

export const ETAPAS = {
  preventiva: {
    id: "preventiva",
    label: "Preventiva",
    descripcion: "Cartera vigente, antes del vencimiento",
    color: "#15a36b",      // verde
    bg: "#eaf6ef",
    orden: 1,
  },
  administrativa: {
    id: "administrativa",
    label: "Administrativa",
    descripcion: "1 a 49 días de mora",
    color: "#d9a400",      // amarillo / oro
    bg: "#fff7d6",
    orden: 2,
  },
  prejuridica: {
    id: "prejuridica",
    label: "Pre-jurídica",
    descripcion: "50 a 70 días de mora",
    color: "#e07a1f",      // naranja
    bg: "#fdecdb",
    orden: 3,
  },
  juridica: {
    id: "juridica",
    label: "Jurídica",
    descripcion: "71 días de mora en adelante",
    color: "#d23b3b",      // rojo
    bg: "#fdeaea",
    orden: 4,
  },
};

// Devuelve el objeto de la etapa correspondiente a unos días de mora.
export function etapaCobranza(diasMora) {
  const d = Number(diasMora);
  if (!Number.isFinite(d) || d <= 0) return ETAPAS.preventiva;
  if (d <= 49) return ETAPAS.administrativa;
  if (d <= 70) return ETAPAS.prejuridica;
  return ETAPAS.juridica;
}

// Orden estándar de las etapas (para mostrar siempre de menor a mayor severidad).
export const ETAPAS_ORDEN = [
  ETAPAS.preventiva,
  ETAPAS.administrativa,
  ETAPAS.prejuridica,
  ETAPAS.juridica,
];
