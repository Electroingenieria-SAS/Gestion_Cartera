"use client";

import { usePathname } from "next/navigation";

// Pie de página obligatorio. Se oculta en el login (y en la raíz, que redirige al login).
export default function Footer() {
  const path = usePathname();
  if (path === "/login" || path === "/") return null;

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span className="credit">
          Construido para <strong>Electroingeniería S.A.S.</strong> — Desarrollado por{" "}
          <strong>Juan Camilo Montoya</strong>
        </span>
        <span className="credit">© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
