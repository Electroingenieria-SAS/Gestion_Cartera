"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

const ROLES = {
  auxiliar: "Auxiliar de cartera",
  supervisor: "Supervisor",
  consulta: "Consulta",
};

// Menú lateral. Los que tienen "href" ya están activos.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▣", href: "/dashboard" },
  { id: "cargar", label: "Cargar archivo", icon: "⬆", href: "/cargar" },
  { id: "cartera", label: "Cartera", icon: "▤", href: "/cartera" },
  { id: "clientes", label: "Clientes", icon: "◍", href: null },
  { id: "gestiones", label: "Gestiones", icon: "✎", href: null },
  { id: "acuerdos", label: "Acuerdos", icon: "✓", href: null },
  { id: "alertas", label: "Alertas", icon: "◔", href: null },
];

// Estructura común (menú + barra superior) para todas las páginas internas.
// Verifica que el usuario tenga sesión; si no, lo manda al login.
export default function AppShell({ active, titulo, subtitulo, children }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState(null);

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

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (cargando) return <div className="loading">Cargando…</div>;

  const iniciales = (perfil.nombre || "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Image src="/simbolo-ei.png" alt="ei" width={34} height={49} />
          <span>Cartera</span>
        </div>
        <nav>
          {NAV.map((item) =>
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
          <div className="user-chip">
            <div className="avatar">{iniciales}</div>
            <div className="user-meta">
              <strong>{perfil.nombre}</strong>
              <span>{ROLES[perfil.rol] || perfil.rol}</span>
            </div>
            <button className="logout" onClick={salir} title="Cerrar sesión">Salir</button>
          </div>
        </header>
        <div className="app-body">{children}</div>
      </div>
    </div>
  );
}
