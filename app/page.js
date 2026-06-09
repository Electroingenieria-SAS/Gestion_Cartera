import Image from "next/image";
import Link from "next/link";

// Página de inicio (vista previa de la herramienta).
// Los números mostrados son una VISTA PREVIEW basada en tu archivo real de Siesa.
// En las próximas fases estos datos se calcularán solos al cargar el Excel.

const kpis = [
  { label: "Cartera Total", value: "$3.713 M", delta: "+1,2% vs ayer", up: true, pct: 100, color: "var(--azul)" },
  { label: "Cartera Vencida", value: "$1.509 M", delta: "40,7% del total", up: false, pct: 41, color: "var(--rojo)" },
  { label: "Clientes Totales", value: "135", delta: "8 vendedores", up: true, pct: 70, color: "var(--azul)" },
  { label: "Clientes en Riesgo", value: "41", delta: "Mora +90 días", up: false, pct: 30, color: "var(--amarillo)" },
];

const modulos = [
  { ico: "1", t: "Carga del archivo Siesa", d: "Sube el Excel diario, el sistema valida la estructura y guarda el histórico automáticamente." },
  { ico: "2", t: "Dashboard de indicadores", d: "Cartera total, vencida, % de mora, clientes en riesgo y más, en tarjetas tipo KPI con semáforo." },
  { ico: "3", t: "Plan diario priorizado", d: "Score de riesgo que ordena a quién cobrar primero según mora, valor y promesas incumplidas." },
  { ico: "4", t: "Gestión de cobranzas", d: "Ficha por cliente con historial completo de llamadas, correos, visitas y compromisos de pago." },
  { ico: "5", t: "Acuerdos y alertas", d: "Registro de promesas de pago y alertas automáticas al dashboard y al correo electrónico." },
  { ico: "6", t: "IA predictiva", d: "Modelo que estima la probabilidad de pago de cada cliente y recomienda la mejor acción." },
];

export default function Home() {
  return (
    <>
      {/* Barra superior con el logo */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <Image src="/logo-ei.png" alt="Electroingeniería" width={120} height={38} priority />
          </div>
          <span className="badge">Gestión de Cartera</span>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <span className="eyebrow"></span>
          <h1>
            De un Excel diario a una <span>plataforma inteligente</span> de cartera
          </h1>
          <p>
            Analiza, prioriza, gestiona y haz seguimiento a toda tu cartera desde un solo lugar.
            Reemplaza el Excel por indicadores en tiempo real, un plan diario de cobro y alertas
            automáticas.
          </p>
          <div className="cta-row">
            <Link href="/login" className="btn btn-primary">Ingresar a la plataforma</Link>
            <a href="#modulos" className="btn btn-ghost">Ver cómo funciona</a>
          </div>
        </div>
      </section>

      {/* KPIs preview */}
      <section className="section">
        <div className="container">
          <h2>Tus indicadores, de un vistazo</h2>
          <p className="lead">Vista previa con datos reales de tu última cartera de Siesa.</p>
          <div className="kpi-grid">
            {kpis.map((k) => (
              <div className="kpi" key={k.label}>
                <div className="label">{k.label}</div>
                <div className="value">{k.value}</div>
                <div className={`delta ${k.up ? "up" : "down"}`}>{k.delta}</div>
                <div className="bar">
                  <i style={{ width: `${k.pct}%`, background: k.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section className="section" id="modulos" style={{ background: "var(--blanco)", borderTop: "1px solid var(--borde)" }}>
        <div className="container">
          <h2>Todo lo que tendrás</h2>
          <p className="lead">El proyecto se construye por fases. Esto es lo que viene.</p>
          <div className="cards">
            {modulos.map((m) => (
              <div className="card" key={m.t}>
                <div className="ico">{m.ico}</div>
                <h3>{m.t}</h3>
                <p>{m.d}</p>
                <span className="soon"></span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
