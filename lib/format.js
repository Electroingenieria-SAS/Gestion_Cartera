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
