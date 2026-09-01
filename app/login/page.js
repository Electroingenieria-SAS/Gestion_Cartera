"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

const CSS = `
.lg-wrap{min-height:100vh;display:grid;place-items:center;background:#f4f6f9;padding:32px;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
.lg-card{position:relative;display:grid;grid-template-columns:minmax(260px,.9fr) minmax(360px,1.1fr);width:min(940px,100%);min-height:560px;background:#fff;border:1px solid #e3e7ee;border-radius:4px;box-shadow:0 18px 45px rgba(15,27,51,.1);overflow:hidden}
.lg-accent{position:absolute;left:0;top:0;bottom:0;width:5px;background:#ddbc00;z-index:2}
.lg-brand{display:flex;flex-direction:column;justify-content:space-between;background:#082a62;color:#fff;padding:54px 48px 42px}
.lg-brand-mark{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d9b900;font-weight:700}
.lg-brand h2{max-width:9ch;font-size:38px;line-height:1.08;letter-spacing:-.04em;margin:0}
.lg-brand p{max-width:26ch;color:rgba(255,255,255,.68);font-size:13px;line-height:1.7;margin:0}
.lg-content{display:flex;flex-direction:column;justify-content:center;padding:54px 72px}
.lg-logo{display:flex;justify-content:flex-start;margin-bottom:34px}
.lg-logo img{width:180px;height:auto}
.lg-title{color:#10254a;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.03em;margin:0 0 8px}
.lg-sub{color:#6b7890;font-size:14px;margin:0 0 32px}
.lg-form{display:flex;flex-direction:column;gap:19px}
.lg-field{display:flex;flex-direction:column;gap:8px}
.lg-field>span{font-size:12px;font-weight:700;letter-spacing:.02em;color:#243957}
.lg-field input{width:100%;border:1px solid #cfd7e3;border-radius:3px;padding:13px 14px;font-size:14px;color:#10254a;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box}
.lg-field input::placeholder{color:#9aa6b7}
.lg-field input:focus{border-color:#174d9b;box-shadow:0 0 0 3px rgba(23,77,155,.11)}
.lg-pass{position:relative}
.lg-pass input{padding-right:44px}
.lg-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#7d8ba0;padding:6px;display:flex;align-items:center}
.lg-error{color:#ad2f36;font-size:12px;margin:0;background:#fff5f5;border:1px solid #efcfd1;border-radius:3px;padding:10px 11px}
.lg-btn{margin-top:5px;width:100%;background:#0b3679;color:#fff;border:none;border-radius:3px;padding:14px;font-size:13px;letter-spacing:.02em;font-weight:700;cursor:pointer;transition:background .15s,transform .05s}
.lg-btn:hover{background:#082a62}
.lg-btn:active{transform:translateY(1px)}
.lg-btn:disabled{opacity:.7;cursor:default}
.lg-foot{color:#9aa6b7;font-size:11px;margin:30px 0 0;line-height:1.5}
@media (max-width:700px){.lg-wrap{padding:16px}.lg-card{display:block;min-height:0}.lg-brand{gap:28px;padding:34px 34px 30px}.lg-brand h2{font-size:30px}.lg-brand p{display:none}.lg-content{padding:36px 34px 34px}.lg-logo{margin-bottom:28px}.lg-title{font-size:24px}}
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
        <section className="lg-brand" aria-label="Información de la plataforma">
          <span className="lg-brand-mark">Electroingeniería S.A.S.</span>
          <h2>Decisiones claras para una gestión eficiente.</h2>
          <p>Plataforma interna para el seguimiento y control de la cartera.</p>
        </section>
        <section className="lg-content">
          <div className="lg-logo">
            <Image src="/logo-ei.png" alt="Electroingeniería" width={180} height={57} priority />
          </div>
          <h1 className="lg-title">Gestión de Cartera</h1>
          <p className="lg-sub">Ingresa con tus credenciales corporativas</p>

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
        </section>
      </div>
    </main>
  );
}
