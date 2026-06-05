"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

// Etiquetas legibles para cada rol.
const ROLES = {
  auxiliar: "Auxiliar de cartera",
  supervisor: "Supervisor",
  consulta: "Consulta",
};

// Menú lateral. Por ahora solo el Dashboard está activo;
// los demás se irán activando fase por fase.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▣", active: true },
  { id: "cartera", label: "Cartera", icon: "▤", active: false },
  { id: "clientes", label: "Clientes", icon: "◍", active: false },
  { id: "gestiones", label: "Gestiones", icon: "✎", active: false },
  { id: "acuerdos", label: "Acuerdos", icon: "✓", active: false },
  { id: "alertas", label: "Alertas", icon: "◔", active: false },
];

const kpis = [
  { label: "Cartera Total", value: "$3.713 M", delta: "vista previa", up: true, pct: 100, color: "var(--azul)" },
  { label: "Cartera Vencida", value: "$1.509 M", delta: "40,7% del total", up: false, pct: 41, color: "var(--rojo)" },
  { label: "Clientes Totales", value: "135", delta: "8 vendedores", up: true, pct: 70, color: "var(--azul)" },
  { label: "Clientes en Riesgo", value: "41", delta: "Mora +90 días", up: false, pct: 30, color: "var(--amarillo)" },
];

export default function Dashboard() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    let activo = true;

    async function verificar() {
      // 1. ¿Hay sesión iniciada?
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      // 2. Traemos el perfil (nombre y rol) del usuario.
      const { data } = await supabase
        .from("profiles")
        .select("nombre, rol")
        .eq("id", session.user.id)
        .single();

      if (activo) {
        setPerfil({
          nombre: data?.nombre || session.user.email,
          rol: data?.rol || "consulta",
          email: session.user.email,
        });
        setCargando(false);
      }
    }

    verificar();
    return () => { activo = false; };
  }, [router]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (cargando) {
    return <div className="loading">Cargando…</div>;
  }

  const iniciales = (perfil.nombre || "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="app-shell">
      {/* Menú lateral */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Image src="/simbolo-ei.png" alt="ei" width={34} height={49} />
          <span>Cartera</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <a key={item.id} className={`nav-item ${item.active ? "on" : "off"}`}>
              <span className="nav-ico">{item.icon}</span>
              {item.label}
              {!item.active && <span className="nav-soon">pronto</span>}
            </a>
          ))}
        </nav>
      </aside>

      {/* Área principal */}
      <div className="main">
        <header className="app-top">
          <div>
            <h1 className="app-title">Dashboard</h1>
            <p className="app-date">Bienvenido de nuevo</p>
          </div>
          <div className="user-chip">
            <div className="avatar">{iniciales}</div>
            <div className="user-meta">
              <strong>{perfil.nombre}</strong>
              <span>{ROLES[perfil.rol] || perfil.rol}</span>
            </div>
            <button className="logout" onClick={salir} title="Cerrar sesión">Salir</button>
          </div>
        </header>

        <div className="app-body">
          <div className="kpi-grid">
            {kpis.map((k) => (
              <div className="kpi" key={k.label}>
                <div className="label">{k.label}</div>
                <div className="value">{k.value}</div>
                <div className={`delta ${k.up ? "up" : "down"}`}>{k.delta}</div>
                <div className="bar"><i style={{ width: `${k.pct}%`, background: k.color }} /></div>
              </div>
            ))}
          </div>

          <div className="notice">
            <strong>✅ Login y roles funcionando.</strong>
            <p>
              Los datos que ves son una vista previa. En la <b>Fase 3</b> conectaremos la base de
              datos y la carga del archivo de Siesa para que estos números sean reales.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
