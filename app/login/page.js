"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Intenta iniciar sesión con correo y contraseña.
  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setError("Correo o contraseña incorrectos. Intenta de nuevo.");
      return;
    }
    // Si todo bien, lo llevamos al panel.
    router.push("/dashboard");
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <Image src="/logo-ei.png" alt="Electroingeniería" width={170} height={54} priority />
        </div>
        <h1 className="auth-title">Gestión de Cartera</h1>
        <p className="auth-sub">Ingresa con tu correo corporativo</p>

        <form onSubmit={handleLogin} className="auth-form">
          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@electroingenieria.com"
              required
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn btn-primary auth-btn" type="submit" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="auth-hint">
          ¿No tienes acceso? Solicítalo al administrador del sistema.
        </p>
      </div>
    </main>
  );
}
