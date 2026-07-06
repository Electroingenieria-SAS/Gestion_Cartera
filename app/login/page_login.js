"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

/* ─── Elementos del fondo animado ────────────────────────────
   Evoca dashboards y datos financieros:
   - Orbes suaves con gradiente (2, no 5)
   - Anillos concéntricos tipo gauge de dashboard
   - Líneas curvas tipo gráfico de tendencia
   - Puntos que sugieren data points en una gráfica
   Todo con movimiento sutil, nada estridente.
──────────────────────────────────────────────────────────── */

const ORBES = [
  { s: 420, t: "-12%", l: "-10%", c: "rgba(255,255,255,.06)", d: 24 },
  { s: 320, t: "60%", l: "75%", c: "rgba(221,188,0,.10)", d: 28 },
];

const ANILLOS = [
  { s: 200, t: "10%", l: "78%", border: "rgba(255,255,255,.08)", d: 50 },
  { s: 140, t: "68%", l: "8%", border: "rgba(221,188,0,.12)", d: 42 },
  { s: 90,  t: "22%", l: "18%", border: "rgba(255,255,255,.06)", d: 56 },
];

const PUNTOS = [
  { t: "18%", l: "32%", gold: false, delay: 0 },
  { t: "36%", l: "65%", gold: true, delay: 1.2 },
  { t: "72%", l: "20%", gold: true, delay: 0.6 },
  { t: "54%", l: "42%", gold: false, delay: 1.8 },
  { t: "44%", l: "85%", gold: false, delay: 0.3 },
  { t: "84%", l: "68%", gold: true, delay: 2.1 },
  { t: "14%", l: "52%", gold: false, delay: 1.5 },
];

const CSS = `
/* ─── Contenedor ─── */
.lg-wrap{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#00378a 0%,#001d52 100%);overflow:hidden;padding:20px;font-family:'Plus Jakarta Sans',system-ui,sans-serif}

/* ─── Fondo animado ─── */
.lg-bg{position:absolute;inset:0;overflow:hidden;z-index:0}
.lg-el{position:absolute;will-change:transform}

/* ─── Líneas de tendencia (SVG) ─── */
.lg-lines{position:absolute;inset:0;z-index:0;opacity:.35}
.lg-line{fill:none;stroke-linecap:round;stroke-dasharray:600;stroke-dashoffset:600;animation:lgDraw 4s ease-in-out forwards}
.lg-line-1{animation-delay:.3s}
.lg-line-2{animation-delay:.9s}
.lg-line-3{animation-delay:1.5s}

/* ─── Grid sutil ─── */
.lg-grid{position:absolute;inset:0;background-image:
  linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:60px 60px;z-index:0}

/* ─── Card ─── */
.lg-card{position:relative;z-index:1;width:100%;max-width:400px;background:#fff;border-radius:18px;box-shadow:0 30px 60px rgba(0,0,0,.28);padding:38px 34px 24px;overflow:hidden}
.lg-accent{position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#ddbc00,#00378a)}
.lg-logo{display:flex;justify-content:center;margin-bottom:12px}
.lg-title{text-align:center;color:#00378a;font-size:24px;font-weight:800;margin:6px 0 2px}
.lg-sub{text-align:center;color:#6b7890;font-size:14px;margin:0 0 22px}

/* ─── Formulario ─── */
.lg-form{display:flex;flex-direction:column;gap:16px}
.lg-field{display:flex;flex-direction:column;gap:6px}
.lg-field>span{font-size:13px;font-weight:600;color:#1f2a44}
.lg-field input{width:100%;border:1px solid #d8deea;border-radius:10px;padding:12px 14px;font-size:15px;background:#fbfcfe;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box}
.lg-field input:focus{border-color:#00378a;box-shadow:0 0 0 3px rgba(0,55,138,.12)}
.lg-pass{position:relative}
.lg-pass input{padding-right:44px}
.lg-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#8a97ad;padding:6px;display:flex;align-items:center}
.lg-error{color:#d23b3b;font-size:13px;margin:0;background:#fdeaea;border:1px solid #f6c9c9;border-radius:8px;padding:9px 11px}
.lg-btn{margin-top:4px;width:100%;background:#00378a;color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s,transform .05s}
.lg-btn:hover{background:#00276a}
.lg-btn:active{transform:scale(.99)}
.lg-btn:disabled{opacity:.7;cursor:default}
.lg-foot{text-align:center;color:#9aa6bc;font-size:11px;margin:20px 0 0;line-height:1.5}

/* ─── Animaciones ─── */
@keyframes lgFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
@keyframes lgFloat2{0%,100%{transform:translateY(0)}50%{transform:translateY(16px)}}
@keyframes lgPulse{0%,100%{transform:scale(1);opacity:.08}50%{transform:scale(1.08);opacity:.14}}
@keyframes lgTwinkle{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:.7;transform:scale(1.1)}}
@keyframes lgDraw{to{stroke-dashoffset:0}}

/* ─── Responsive ─── */
@media(max-width:480px){.lg-card{padding:30px 22px 22px}.lg-title{font-size:21px}}
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("Correo o contraseña incorrectos. Intenta de nuevo.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="lg-wrap">
      <style>{CSS}</style>

      <div className="lg-bg" aria-hidden="true">
        {/* Grid sutil tipo cuadrícula de gráfico */}
        <div className="lg-grid" />

        {/* Orbes con gradiente (solo 2, sutiles) */}
        {ORBES.map((o, i) => (
          <div
            key={"o" + i}
            className="lg-el"
            style={{
              width: o.s, height: o.s, top: o.t, left: o.l,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${o.c}, transparent 70%)`,
              animation: `${i === 0 ? "lgFloat" : "lgFloat2"} ${o.d}s ease-in-out infinite`,
            }}
          />
        ))}

        {/* Anillos concéntricos tipo gauge de dashboard */}
        {ANILLOS.map((r, i) => (
          <div
            key={"r" + i}
            className="lg-el"
            style={{
              width: r.s, height: r.s, top: r.t, left: r.l,
              borderRadius: "50%",
              border: `1.5px solid ${r.border}`,
              animation: `lgPulse ${r.d}s ease-in-out infinite`,
              animationDelay: `${i * 2}s`,
            }}
          />
        ))}

        {/* Data points que titilan suavemente */}
        {PUNTOS.map((p, i) => (
          <div
            key={"p" + i}
            className="lg-el"
            style={{
              top: p.t, left: p.l,
              width: 6, height: 6, borderRadius: "50%",
              background: p.gold ? "rgba(221,188,0,.8)" : "rgba(255,255,255,.7)",
              animation: `lgTwinkle ${5 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        {/* Líneas curvas tipo gráfico de tendencia financiera */}
        <svg className="lg-lines" viewBox="0 0 1200 800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path
            className="lg-line lg-line-1"
            d="M0 620 C200 580, 350 520, 500 480 S750 380, 900 320 S1050 240, 1200 200"
            stroke="rgba(221,188,0,.25)" strokeWidth="1.5"
          />
          <path
            className="lg-line lg-line-2"
            d="M0 700 C180 680, 300 640, 480 560 S700 440, 850 400 S1000 340, 1200 300"
            stroke="rgba(255,255,255,.15)" strokeWidth="1"
          />
          <path
            className="lg-line lg-line-3"
            d="M0 750 C250 730, 400 680, 550 620 S780 500, 950 460 S1100 400, 1200 380"
            stroke="rgba(255,255,255,.08)" strokeWidth="1"
          />
        </svg>
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
