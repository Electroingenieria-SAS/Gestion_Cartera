// Modelo explicable de PROBABILIDAD DE PAGO.
// No es una "caja negra": es una fórmula transparente que combina señales
// reales del cliente. Cuando haya suficiente historial de pagos, este modelo
// se puede reemplazar por uno entrenado (XGBoost, etc.) sin cambiar la app.

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Coeficientes del modelo (ajustables). Positivo = sube la probabilidad.
const M = {
  base: 2.0,            // probabilidad de partida (~88%)
  diasMora: -3.0,       // entre más mora, menos probable
  pctVencida: -2.0,     // entre más % vencido, menos probable
  cumplidos: 0.8,       // cada promesa cumplida sube
  incumplidos: -1.2,    // cada promesa incumplida baja (señal fuerte)
  gestionReciente: 0.5, // si hubo contacto reciente, sube un poco
};

export function calcularProbabilidad({ diasMora, pctVencida, cumplidos, incumplidos, gestionReciente }) {
  const dn = Math.min((diasMora || 0) / 365, 1);
  const pv = Math.min(Math.max(pctVencida || 0, 0), 1);
  const cum = Math.min(cumplidos || 0, 3);
  const inc = Math.min(incumplidos || 0, 3);

  const z =
    M.base +
    M.diasMora * dn +
    M.pctVencida * pv +
    M.cumplidos * cum +
    M.incumplidos * inc +
    (gestionReciente ? M.gestionReciente : 0);

  const prob = Math.round(sigmoid(z) * 100);
  return { prob, ...clasificar(prob) };
}

export function clasificar(prob) {
  if (prob >= 70) return { nivel: "Bajo", color: "var(--verde)", recomendacion: "Seguimiento estándar y monitoreo de cumplimiento." };
  if (prob >= 45) return { nivel: "Medio", color: "var(--azul)", recomendacion: "Contactar en los próximos días y registrar un compromiso de pago." };
  if (prob >= 25) return { nivel: "Alto", color: "var(--amarillo)", recomendacion: "Gestión telefónica esta semana y acuerdo formal de pago." };
  return { nivel: "Crítico", color: "var(--rojo)", recomendacion: "Gestión inmediata y seguimiento diario; evaluar acciones de cobro." };
}
