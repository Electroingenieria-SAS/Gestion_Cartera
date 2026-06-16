"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { getAlertas } from "../../lib/alertas";

const ROLES = {
  auxiliar: "Auxiliar de cartera",
  supervisor: "Supervisor",
  consulta: "Consulta",
};

// Menú lateral. "soloSupervisor" se muestra únicamente a supervisores.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { id: "cargar", label: "Cargar archivo", icon: "📤", href: "/cargar" },
  { id: "plan", label: "Plan diario", icon: "📋", href: "/plan" },
  { id: "prediccion", label: "Predicción IA", icon: "🔮", href: "/prediccion" },
  { id: "cartera", label: "Cartera", icon: "💰", href: "/cartera" },
  { id: "clientes", label: "Clientes", icon: "👥", href: "/clientes" },
  { id: "acuerdos", label: "Acuerdos", icon: "🤝", href: "/acuerdos" },
  { id: "alertas", label: "Alertas", icon: "🔔", href: "/alertas" },
  { id: "auditoria", label: "Auditoría", icon: "🔍", href: "/auditoria", soloSupervisor: true },
];

// Estructura común (menú + barra superior) para todas las páginas internas.
export default function AppShell({ active, titulo, subtitulo, children }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState(null);
  const [alertas, setAlertas] = useState(0);

  useEffect(() => {
    let activo = true;
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("nombre, rol")
        .eq("id", session.user.id)
        .single();
      if (activo) {
        setPerfil({
          nombre: data?.nombre || session.user.email,
          rol: data?.rol || "consulta",
        });
        setCargando(false);
      }
    }
    verificar();
    return () => { activo = false; };
  }, [router]);

  // Conteo de alertas para la campana (no bloquea el render).
  useEffect(() => {
    let activo = true;
    getAlertas().then((a) => { if (activo) setAlertas(a.length); }).catch(() => {});
    return () => { activo = false; };
  }, []);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (cargando) return <div className="loading">Cargando…</div>;

  const iniciales = (perfil.nombre || "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const navVisible = NAV.filter((item) => !item.soloSupervisor || perfil.rol === "supervisor");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Image src="/simbolo-ei.png" alt="ei" width={34} height={49} />
          <span>Cartera</span>
        </div>
        <nav>
          {navVisible.map((item) =>
            item.href ? (
              <Link key={item.id} href={item.href} className={`nav-item ${active === item.id ? "on" : ""}`}>
                <span className="nav-ico">{item.icon}</span>{item.label}
              </Link>
            ) : (
              <a key={item.id} className="nav-item off">
                <span className="nav-ico">{item.icon}</span>{item.label}
                <span className="nav-soon">pronto</span>
              </a>
            )
          )}
        </nav>
      </aside>

      <div className="main">
        <header className="app-top">
          <div>
            <h1 className="app-title">{titulo}</h1>
            <p className="app-date">{subtitulo}</p>
          </div>
          <div className="top-right">
            <Link href="/alertas" className="bell" aria-label="Alertas">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {alertas > 0 && <span className="bell-count">{alertas > 99 ? "99+" : alertas}</span>}
            </Link>
            <div className="user-chip">
              <div className="avatar">{iniciales}</div>
              <div className="user-meta">
                <strong>{perfil.nombre}</strong>
                <span>{ROLES[perfil.rol] || perfil.rol}</span>
              </div>
              <button className="logout" onClick={salir} title="Cerrar sesión">Salir</button>
            </div>
          </div>
        </header>
        <div className="app-body">{children}</div>
      </div>
    </div>
  );
}
