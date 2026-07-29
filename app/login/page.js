"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

// Fondo animado: orbes suaves, anillos, cuadrados girando, triángulo y puntos.
const ORBES = [
  { s: 360, t: "-8%", l: "-6%", c: "rgba(255,255,255,.08)", a: "lgFloat", d: 22, dl: 0 },
  { s: 300, t: "55%", l: "80%", c: "rgba(221,188,0,.12)", a: "lgFloat2", d: 26, dl: 2 },
  { s: 210, t: "74%", l: "4%", c: "rgba(255,255,255,.06)", a: "lgFloat", d: 30, dl: 1 },
];
const ANILLOS = [
  { s: 240, t: "8%", l: "74%", b: "rgba(255,255,255,.10)", a: "lgSpin", d: 44 },
  { s: 150, t: "64%", l: "64%", b: "rgba(221,188,0,.18)", a: "lgSpinRev", d: 38 },
];
const CUADROS = [
  { s: 92, t: "16%", l: "12%", b: "rgba(255,255,255,.12)", a: "lgSpin", d: 34 },
  { s: 60, t: "80%", l: "46%", b: "rgba(221,188,0,.20)", a: "lgSpinRev", d: 30 },
];
const PUNTOS = [
  { t: "20%", l: "30%", g: true }, { t: "34%", l: "60%", g: false }, { t: "70%", l: "22%", g: false },
  { t: "56%", l: "38%", g: true }, { t: "42%", l: "88%", g: false }, { t: "82%", l: "70%", g: true },
  { t: "12%", l: "50%", g: false }, { t: "88%", l: "34%", g: true },
];

const CSS = `
.lg-wrap{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#00369C;overflow:hidden;padding:20px;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
.lg-bg{position:absolute;inset:0;overflow:hidden;z-index:0}
.lg-shape{position:absolute;will-change:transform}
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
@keyframes lgFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-34px)}}
@keyframes lgFloat2{0%,100%{transform:translateY(0)}50%{transform:translateY(30px)}}
@keyframes lgSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes lgSpinRev{from{transform:rotate(0)}to{transform:rotate(-360deg)}}
@keyframes lgDrift{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(36px,-26px) rotate(180deg)}100%{transform:translate(0,0) rotate(360deg)}}
@keyframes lgTwinkle{0%,100%{opacity:.18;transform:scale(.8)}50%{opacity:.8;transform:scale(1.2)}}
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

      <div className="lg-bg" aria-hidden="true">
        {ORBES.map((o, i) => (
          <div key={"o" + i} className="lg-shape" style={{ width: o.s, height: o.s, top: o.t, left: o.l, borderRadius: "50%", background: `radial-gradient(circle, ${o.c}, transparent 70%)`, animation: `${o.a} ${o.d}s ease-in-out infinite`, animationDelay: `${o.dl}s` }} />
        ))}
        {ANILLOS.map((r, i) => (
          <div key={"r" + i} className="lg-shape" style={{ width: r.s, height: r.s, top: r.t, left: r.l, borderRadius: "50%", border: `2px solid ${r.b}`, animation: `${r.a} ${r.d}s linear infinite` }} />
        ))}
        {CUADROS.map((q, i) => (
          <div key={"q" + i} className="lg-shape" style={{ width: q.s, height: q.s, top: q.t, left: q.l, border: `2px solid ${q.b}`, borderRadius: 10, animation: `${q.a} ${q.d}s linear infinite` }} />
        ))}
        <div className="lg-shape" style={{ top: "24%", left: "84%", width: 0, height: 0, borderLeft: "55px solid transparent", borderRight: "55px solid transparent", borderBottom: "95px solid rgba(221,188,0,.12)", animation: "lgDrift 32s ease-in-out infinite" }} />
        {PUNTOS.map((p, i) => (
          <div key={"p" + i} className="lg-shape" style={{ top: p.t, left: p.l, width: 9, height: 9, borderRadius: "50%", background: p.g ? "rgba(221,188,0,.9)" : "rgba(255,255,255,.85)", animation: `lgTwinkle ${4 + (i % 4)}s ease-in-out infinite`, animationDelay: `${i * 0.4}s` }} />
        ))}
      </div>

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
