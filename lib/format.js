// Funciones para mostrar números bonitos en formato colombiano.

export function pesos(v) {
  const n = Number(v) || 0;
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export function millones(v) {
  const n = Number(v) || 0;
  return "$" + Math.round(n / 1e6).toLocaleString("es-CO") + " M";
}

export function num(v) {
  return (Number(v) || 0).toLocaleString("es-CO");
}

export function pct(v) {
  return (Number(v) || 0).toFixed(1).replace(".", ",") + "%";
}

// =========================================================
//  Utilidades para campos de dinero que se escriben a mano.
// =========================================================

// Formatea lo que la persona escribe poniendo los puntos de mil.
// "2300000" -> "2.300.000"   ·   "2.3a00" -> "2.300"
export function formatearMiles(v) {
  const digitos = String(v ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return Number(digitos).toLocaleString("es-CO");
}

// Quita los puntos y devuelve el número limpio para guardar en la BD.
// "2.300.000" -> 2300000
export function soloNumero(v) {
  const digitos = String(v ?? "").replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}
