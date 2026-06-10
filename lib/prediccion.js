// Modelo explicable de PROBABILIDAD DE PAGO.
// Combina señales reales del cliente con una función logística (sigmoide).
// Cada coeficiente está comentado para que sepas exactamente qué hace.

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

const M = {
  base: 2.0,        // probabilidad de partida (~88%)
  diasMora: -3.0,   // entre más mora, menos probable
  pctVencida: -2.0, // entre más % del saldo vencido, menos probable
  cumplidos: 0.8,   // cada promesa CUMPLIDA sube
  incumplidos: -1.2, // cada promesa INCUMPLIDA baja (señal fuerte)
};

// Señal según el RESULTADO de la última gestión.
// Un "No contesta" o "Número errado" BAJA la probabilidad (no sube).
const SENAL_RESULTADO = {
  "Pago total": 1.0,
  "Pago parcial": 0.6,
  "Compromiso de pago": 0.4,
  "Contactado": 0.2,
  "Requiere seguimiento": 0.0,
  "No contesta": -0.3,
  "Número errado": -0.5,
};

export function calcularProbabilidad({ diasMora, pctVencida, cumplidos, incumplidos, ultimoResultado }) {
  const dn = Math.min((diasMora || 0) / 365, 1);
  const pv = Math.min(Math.max(pctVencida || 0, 0), 1);
  const cum = Math.min(cumplidos || 0, 3);
  const inc = Math.min(incumplidos || 0, 3);
  const senal = SENAL_RESULTADO[ultimoResultado] ?? 0;

  const z = M.base + M.diasMora * dn + M.pctVencida * pv + M.cumplidos * cum + M.incumplidos * inc + senal;
  const prob = Math.round(sigmoid(z) * 100);

  // Desglose para mostrar al usuario POR QUÉ salió ese número.
  const ef = (v) => (v > 0 ? "sube" : v < 0 ? "baja" : "neutro");
  const factores = [
    { nombre: "Días de mora", valor: (diasMora || 0) + " días", efecto: dn > 0 ? "baja" : "neutro" },
    { nombre: "% del saldo vencido", valor: Math.round(pv * 100) + "%", efecto: pv > 0 ? "baja" : "neutro" },
    { nombre: "Promesas cumplidas", valor: cum, efecto: cum > 0 ? "sube" : "neutro" },
    { nombre: "Promesas incumplidas", valor: inc, efecto: inc > 0 ? "baja" : "neutro" },
    { nombre: "Última gestión", valor: ultimoResultado || "sin gestión", efecto: ef(senal) },
  ];

  return { prob, factores, ...clasificar(prob) };
}

export function clasificar(prob) {
  if (prob >= 70) return { nivel: "Bajo", color: "var(--verde)", recomendacion: "Seguimiento estándar y monitoreo de cumplimiento." };
  if (prob >= 45) return { nivel: "Medio", color: "var(--azul)", recomendacion: "Contactar en los próximos días y registrar un compromiso de pago." };
  if (prob >= 25) return { nivel: "Alto", color: "var(--amarillo)", recomendacion: "Gestión telefónica esta semana y acuerdo formal de pago." };
  return { nivel: "Crítico", color: "var(--rojo)", recomendacion: "Gestión inmediata y seguimiento diario; evaluar acciones de cobro." };
}
