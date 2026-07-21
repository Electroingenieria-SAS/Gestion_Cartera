// =========================================================
//  lib/numeroALetras.js
//  Convierte un valor numérico a su representación en letras
//  en español (Colombia). Se usa debajo de los campos de dinero
//  para que la auxiliar confirme visualmente la cifra.
//
//  Ejemplos:
//    numeroALetras(2300000)  -> "Dos millones trescientos mil pesos"
//    numeroALetras(1100000)  -> "Un millón cien mil pesos"
//    numeroALetras(14636477) -> "Catorce millones seiscientos treinta y
//                                seis mil cuatrocientos setenta y siete pesos"
// =========================================================

const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];

const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos",
  "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos",
];

// Convierte 0–999 a letras. Aplica apócope masculino (uno -> un, veintiuno -> veintiún).
function menorMil(n) {
  if (n === 0) return "";
  if (n === 100) return "cien";

  const c = Math.floor(n / 100);
  const r = n % 100;
  let txt = c > 0 ? CENTENAS[c] : "";

  if (r > 0) {
    let rt;
    if (r < 30) {
      rt = UNIDADES[r];
    } else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      rt = DECENAS[d] + (u > 0 ? " y " + UNIDADES[u] : "");
    }
    txt = txt ? txt + " " + rt : rt;
  }

  // Apócope: "veintiuno" -> "veintiún", "uno" -> "un"
  return txt.replace(/veintiuno$/, "veintiún").replace(/(^|\s)uno$/, "$1un");
}

// Convierte 0–999.999 a letras (maneja el grupo de los miles).
function grupoMil(n) {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;

  let txt = "";
  if (miles === 1) txt = "mil";
  else if (miles > 1) txt = menorMil(miles) + " mil";

  if (resto > 0) txt = txt ? txt + " " + menorMil(resto) : menorMil(resto);
  return txt;
}

/**
 * Convierte un número a letras.
 * @param {number|string} valor  Cifra a convertir (se ignoran los decimales).
 * @param {string} moneda        Palabra que va al final. Por defecto "pesos".
 * @returns {string} Texto capitalizado, ej: "Dos millones trescientos mil pesos".
 */
export function numeroALetras(valor, moneda = "pesos") {
  const n = Math.floor(Math.abs(Number(valor) || 0));

  if (!Number.isFinite(n)) return "";
  if (n === 0) return "";
  if (n === 1) return "Un peso";

  const millones = Math.floor(n / 1e6);
  const resto = n % 1e6;

  let txt = "";
  if (millones === 1) txt = "un millón";
  else if (millones > 1) txt = grupoMil(millones) + " millones";

  if (resto > 0) txt = txt ? txt + " " + grupoMil(resto) : grupoMil(resto);

  txt = txt.trim();

  // Cifras exactas en millones llevan "de": "veintiún millones DE pesos".
  const conector = /mill(ón|ones)$/.test(txt) ? " de " : " ";

  return txt.charAt(0).toUpperCase() + txt.slice(1) + conector + moneda;
}
