"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

const CSS = `
.lg-wrap{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(rgba(255,255,255,.05) 1.5px,transparent 1.5px) 0 0/26px 26px,linear-gradient(160deg,#00369C 0%,#00276f 100%);overflow:hidden;padding:20px;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
.lg-card{position:relative;z-index:1;width:100%;max-width:400px;background:#fff;border-radius:18px;box-shadow:0 30px 60px rgba(0,0,0,.28);padding:38px 34px 24px;overflow:hidden}
.lg-accent{position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#ddbc00,#00369C)}
.lg-logo{display:flex;justify-content:center;margin-bottom:12px}
.lg-title{text-align:center;color:#00369C;font-size:24px;font-weight:800;margin:6px 0 2px}
.lg-sub{text-align:center;color:#6b7890;font-size:14px;margin:0 0 22px}
.lg-form{display:flex;flex-direction:column;gap:16px}
.lg-field{display:flex;flex-direction:column;gap:6px}
.lg-field>span{font-size:13px;font-weight:600;color:#1f2a44}
.lg-field input{width:100%;border:1px solid #d8deea;border-radius:10px;padding:12px 14px;font-size:15px;background:#fbfcfe;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box}
.lg-field input:focus{border-color:#00369C;box-shadow:0 0 0 3px rgba(0,54,156,.12)}
.lg-pass{position:relative}
.lg-pass input{padding-right:44px}
.lg-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#8a97ad;padding:6px;display:flex;align-items:center}
.lg-error{color:#d23b3b;font-size:13px;margin:0;background:#fdeaea;border:1px solid #f6c9c9;border-radius:8px;padding:9px 11px}
.lg-btn{margin-top:4px;width:100%;background:#00369C;color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s,transform .05s}
.lg-btn:hover{background:#00276f}
.lg-btn:active{transform:scale(.99)}
.lg-btn:disabled{opacity:.7;cursor:default}
.lg-foot{text-align:center;color:#9aa6bc;font-size:11px;margin:20px 0 0;line-height:1.5}
@media (max-width:480px){.lg-card{padding:30px 22px 22px}.lg-title{font-size:21px}}
`;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError("Correo o contraseña incorrectos. Intenta de nuevo.");
      return;
    }
    // El rol jurídico entra directo a su bandeja; el resto al dashboard.
    let destino = "/dashboard";
    if (data?.user?.id) {
      const { data: p } = await supabase.from("profiles").select("rol").eq("id", data.user.id).single();
      if (p?.rol === "juridico") destino = "/juridico";
    }
    setLoading(false);
    router.push(destino);
  }

  return (
    <main className="lg-wrap">
      <style>{CSS}</style>

      <div className="lg-card">
        <div className="lg-accent" />
        <div className="lg-logo">
          <Image src="/logo-ei.png" alt="Electroingeniería" width={180} height={57} priority />
        </div>
        <h1 className="lg-title">Gestión de Cartera</h1>
        <p className="lg-sub">Electroingeniería S.A.S.</p>

        <form onSubmit={handleLogin} className="lg-form">
          <label className="lg-field">
            <span>Correo electrónico</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@ei.com.co" required />
          </label>

          <label className="lg-field">
            <span>Contraseña</span>
            <div className="lg-pass">
              <input type={verPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ingrese su contraseña" required />
              <button type="button" className="lg-eye" onClick={() => setVerPass(!verPass)} aria-label={verPass ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {verPass ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
          </label>

          {error && <p className="lg-error">{error}</p>}

          <button className="lg-btn" type="submit" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="lg-foot">© 2026 Electroingeniería S.A.S. — Desarrollado por Juan Camilo Montoya</p>
      </div>
    </main>
  );
}
