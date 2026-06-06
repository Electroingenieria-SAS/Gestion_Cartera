import reglas from "../business_rules/priority_rules.json";

// Calcula el Score de riesgo de cobro (0 a 100) de un cliente.
// Normaliza cada factor a 0-100 usando los "topes" y luego aplica los "pesos".
export function calcularScore({ diasMora, valorVencido, diasSinGestion, promesasIncumplidas }) {
  const { pesos, topes } = reglas;
  const n = {
    dias: Math.min(100, (diasMora / topes.dias_mora) * 100),
    valor: Math.min(100, (valorVencido / topes.valor_adeudado) * 100),
    sin: Math.min(100, (diasSinGestion / topes.dias_sin_gestion) * 100),
    prom: Math.min(100, (promesasIncumplidas / topes.promesas_incumplidas) * 100),
  };
  const sum =
    pesos.dias_mora + pesos.valor_adeudado + pesos.dias_sin_gestion + pesos.promesas_incumplidas || 1;
  const score =
    (pesos.dias_mora * n.dias +
      pesos.valor_adeudado * n.valor +
      pesos.dias_sin_gestion * n.sin +
      pesos.promesas_incumplidas * n.prom) /
    sum;
  return Math.round(score * 10) / 10;
}

// Nivel de prioridad según el Score.
export function nivelPrioridad(score) {
  if (score >= 66) return { label: "Crítica", color: "var(--rojo)" };
  if (score >= 40) return { label: "Alta", color: "var(--amarillo)" };
  if (score >= 20) return { label: "Media", color: "var(--azul)" };
  return { label: "Baja", color: "var(--verde)" };
}
