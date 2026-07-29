"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { getAlertas } from "../../lib/alertas";
import {
  LayoutDashboard,
  Upload,
  ClipboardList,
  TrendingUp,
  Target,
  Wallet,
  Users,
  Handshake,
  Bell,
  ShieldCheck,
  History,
  Gavel,
  LogOut,
} from "lucide-react";

const ROLES = {
  auxiliar: "Auxiliar de cartera",
  supervisor: "Supervisor",
  consulta: "Consulta",
  juridico: "Cobranza jurídica",
};

// Roles "de cartera" (todo el que NO es jurídico ve el menú normal).
const CARTERA = ["auxiliar", "supervisor", "consulta"];

// Menú principal horizontal. Cada ítem define qué roles lo ven.
// El rol 'juridico' SOLO ve su bandeja de cobro jurídico.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", roles: CARTERA },
  { id: "cargar", label: "Cargar", icon: Upload, href: "/cargar", roles: CARTERA },
  { id: "plan", label: "Plan diario", icon: ClipboardList, href: "/plan", roles: CARTERA },
  { id: "prediccion", label: "Predicción", icon: TrendingUp, href: "/prediccion", roles: CARTERA },
  { id: "pronostico", label: "Pronóstico", icon: Target, href: "/pronostico", roles: CARTERA },
  { id: "cartera", label: "Cartera", icon: Wallet, href: "/cartera", roles: CARTERA },
  { id: "clientes", label: "Clientes", icon: Users, href: "/clientes", roles: CARTERA },
  { id: "acuerdos", label: "Acuerdos", icon: Handshake, href: "/acuerdos", roles: CARTERA },
  { id: "juridico", label: "Cobro jurídico", icon: Gavel, href: "/juridico", roles: ["supervisor", "juridico"] },
  { id: "alertas", label: "Alertas", icon: Bell, href: "/alertas", roles: CARTERA },
  { id: "auditoria", label: "Trazabilidad", icon: History, href: "/auditoria", roles: CARTERA },
];

// Estructura común (topbar horizontal + título de página) para todas las páginas internas.
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

  const navVisible = NAV.filter((item) => !item.roles || item.roles.includes(perfil.rol));
  const esJuridico = perfil.rol === "juridico";

  return (
    <div className="app-shell">
      {/* === TOPBAR HORIZONTAL: logo | menú centrado | usuario === */}
      <header className="topbar">
        <Link href="/dashboard" className="topbar-brand" aria-label="Inicio">
          <Image src="/simbolo-ei.png" alt="ei" width={32} height={46} priority />
          <span>Cartera</span>
        </Link>

        <nav className="topnav" aria-label="Menú principal">
          {navVisible.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`topnav-item ${active === item.id ? "on" : ""}`}
              >
                <Icon size={18} strokeWidth={2} className="topnav-ico" />
                <span className="topnav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="topbar-right">
          {!esJuridico && (
            <Link href="/alertas" className="bell" aria-label="Alertas">
              <Bell size={22} strokeWidth={2} />
              {alertas > 0 && <span className="bell-count">{alertas > 99 ? "99+" : alertas}</span>}
            </Link>
          )}
          <div className="user-chip">
            <div className="avatar">{iniciales}</div>
            <div className="user-meta">
              <strong>{perfil.nombre}</strong>
              <span>{ROLES[perfil.rol] || perfil.rol}</span>
            </div>
            <button className="logout" onClick={salir} title="Cerrar sesión">
              <LogOut size={16} strokeWidth={2} style={{ marginRight: 4 }} />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* === Cuerpo de la página === */}
      <div className="main">
        <header className="app-top">
          <div>
            <h1 className="app-title">{titulo}</h1>
            <p className="app-date">{subtitulo}</p>
          </div>
        </header>
        <div className="app-body">{children}</div>
      </div>
    </div>
  );
}
