// src/pages/ServiceDetail/Banner.jsx  (or wherever Banner.jsx lives)
import React, { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  Stethoscope,
  Phone,
  Star,
  Users,
  Ribbon,
  ShieldUser,
} from "lucide-react";
import banner from "../../assets/BannerImg.png";
import { useNavigate } from "react-router-dom";

/* ─── Injected styles ───────────────────────────────────────────────── */
const STYLES = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes starPop {
    0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
    70%  { transform: scale(1.2) rotate(5deg);  opacity: 1; }
    100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
  }
  @keyframes pulseRing {
    0%   { transform: scale(1);   opacity: .5; }
    100% { transform: scale(1.6); opacity: 0;  }
  }
  @keyframes floatY {
    0%, 100% { transform: translateY(0px);  }
    50%       { transform: translateY(-8px); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .med-reveal {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity .6s ease, transform .6s ease;
  }
  .med-reveal.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .med-feature-card {
    transition: transform .25s ease, box-shadow .25s ease, background .25s ease, color .25s ease;
    cursor: default;
  }
  .med-feature-card:hover {
    transform: translateY(-4px) scale(1.04);
    box-shadow: 0 12px 28px rgba(13,148,136,.25);
    background: linear-gradient(135deg, #0d9488, #0f766e) !important;
  }
  .med-feature-card:hover .med-feat-icon { color: white !important; }
  .med-feature-card:hover .med-feat-text { color: white !important; }

  .med-book-btn {
    position: relative;
    overflow: hidden;
    transition: transform .22s ease, box-shadow .22s ease;
  }
  .med-book-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.3) 50%, transparent 70%);
    background-size: 200% 100%;
    opacity: 0;
    transition: opacity .2s;
  }
  .med-book-btn:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(13,148,136,.4); }
  .med-book-btn:hover::after { opacity: 1; animation: shimmer .75s linear; }
  .med-book-btn:active { transform: translateY(0); }

  .med-emergency-btn {
    transition: transform .22s ease, box-shadow .22s ease, background .22s ease;
    position: relative;
    overflow: hidden;
  }
  .med-emergency-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(239,68,68,.35); background: #dc2626 !important; }
  .med-emergency-btn:active { transform: translateY(0); }

  .med-pulse-wrap { position: relative; }
  .med-pulse-wrap::before,
  .med-pulse-wrap::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 2px solid #5eead4;
    animation: pulseRing 2s ease-out infinite;
  }
  .med-pulse-wrap::after { animation-delay: 1s; }

  .med-float { animation: floatY 5s ease-in-out infinite; }

  .med-stat-card {
    animation: countUp .5s ease forwards;
    opacity: 0;
  }
`;

/* ─── Counter hook ──────────────────────────────────────────────────── */
function useCounter(target, duration = 1600, started = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!started) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(p * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);
  return val;
}

/* ─── Stat pill ─────────────────────────────────────────────────────── */
function StatPill({ target, suffix, label, delay, started }) {
  const val = useCounter(target, 1600, started);
  return (
    <div
      className="med-stat-card"
      style={{
        animationDelay: delay,
        background: "rgba(255,255,255,0.9)",
        borderRadius: "14px",
        padding: "14px 18px",
        textAlign: "center",
        boxShadow: "0 4px 18px rgba(13,148,136,.12)",
        border: "1.5px solid #99f6e4",
        minWidth: 90,
      }}
    >
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f766e", lineHeight: 1 }}>
        {val}{suffix}
      </div>
      <div style={{ fontSize: ".72rem", color: "#4b5563", marginTop: 3, fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Banner ────────────────────────────────────────────────────────── */
const Banner = () => {
  const navigate       = useNavigate();
  const imageRef       = useRef(null);
  const statsRef       = useRef(null);
  const [statsStarted, setStatsStarted] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (!imageRef.current) return;
      imageRef.current.style.transform = `translateY(${window.scrollY * 0.1}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".med-reveal");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.12 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStatsStarted(true); obs.disconnect(); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const features = [
    { icon: <Ribbon     size={17} />, label: "Certified Specialists", border: "#99f6e4" },
    { icon: <Clock      size={17} />, label: "24/7 Availability",     border: "#5eead4" },
    { icon: <ShieldUser size={17} />, label: "Safe & Secure",         border: "#2dd4bf" },
    { icon: <Users      size={17} />, label: "500+ Doctors",          border: "#a78bfa" },
  ];

  return (
    <>
      <style>{STYLES}</style>

      <section
        style={{
          /* ✅ Teal/mint gradient matching screenshot */
          background: "linear-gradient(135deg, #ccfbf1 0%, #f0fdfa 50%, #ccfbf1 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "60px 24px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Soft teal blobs */}
        <div style={{ position:"absolute", top:"-100px", right:"-80px", width:"420px", height:"420px", borderRadius:"50%", background:"radial-gradient(circle, rgba(94,234,212,.22) 0%, transparent 70%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:"-80px", left:"-60px", width:"340px", height:"340px", borderRadius:"50%", background:"radial-gradient(circle, rgba(45,212,191,.14) 0%, transparent 70%)", pointerEvents:"none" }} />

        <div style={{ maxWidth: "1180px", margin: "0 auto", width: "100%" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"48px", flexWrap:"wrap" }}>

            {/* ── LEFT ── */}
            <div style={{ flex:"1 1 360px", minWidth:"260px" }}>

              {/* Logo row */}
              <div className="med-reveal" style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"18px" }}>
                <div
                  className="med-pulse-wrap"
                  style={{
                    width:"58px", height:"58px",
                    borderRadius:"50%",
                    background:"linear-gradient(135deg, #0d9488, #0f766e)", /* ✅ teal */
                    display:"flex", alignItems:"center", justifyContent:"center",
                    boxShadow:"0 8px 24px rgba(13,148,136,.35)",
                    flexShrink:0,
                  }}
                >
                  <Stethoscope size={26} color="white" />
                </div>

                <div>
                  <h1 style={{ margin:0, fontSize:"clamp(2rem,5vw,2.9rem)", fontWeight:900, lineHeight:1.05, color:"#134e4a", letterSpacing:"-1px" }}>
                    Prime<span style={{ color:"#0d9488" }}>Care+</span>
                  </h1>
                  <div style={{ display:"flex", gap:"3px", marginTop:"4px" }}>
                    {[1,2,3,4,5].map((s,i) => (
                      <Star key={s} size={14} fill="#f59e0b" color="#f59e0b"
                        style={{ animation:"starPop .4s ease forwards", animationDelay:`${i*0.08}s`, opacity:0 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tagline */}
              <div className="med-reveal" style={{ marginBottom:"28px", transitionDelay:".1s" }}>
                <p style={{ margin:0, fontSize:"clamp(1.5rem,3.5vw,2.2rem)", fontWeight:700, color:"#134e4a", lineHeight:1.2 }}>
                  Premium Healthcare
                </p>
                <p style={{ margin:0, fontSize:"clamp(1.5rem,3.5vw,2.2rem)", fontWeight:700, color:"#0d9488", lineHeight:1.2 }}>
                  At Your Fingertips
                </p>
              </div>

              {/* Feature cards */}
              <div className="med-reveal" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"28px", transitionDelay:".15s" }}>
                {features.map(f => (
                  <div
                    key={f.label}
                    className="med-feature-card"
                    style={{
                      display:"flex", alignItems:"center", gap:"10px",
                      background:"#ccfbf1", /* ✅ teal tint */
                      border:`1.5px solid ${f.border}`,
                      borderRadius:"12px",
                      padding:"12px 14px",
                      boxShadow:"0 2px 10px rgba(13,148,136,.08)",
                    }}
                  >
                    <span className="med-feat-icon" style={{ color:"#0f766e", flexShrink:0 }}>{f.icon}</span>
                    <span className="med-feat-text" style={{ fontSize:".82rem", fontWeight:600, color:"#134e4a" }}>{f.label}</span>
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="med-reveal" style={{ display:"flex", gap:"14px", flexWrap:"wrap", transitionDelay:".2s" }}>
                <button
                  className="med-book-btn"
                  onClick={() => navigate("/doctors")}
                  aria-label="Book Appointment"
                  style={{
                    background:"linear-gradient(135deg, #0d9488, #0f766e)", /* ✅ teal */
                    color:"white",
                    border:"none",
                    borderRadius:"50px",
                    padding:"14px 26px",
                    fontSize:".93rem",
                    fontWeight:700,
                    cursor:"pointer",
                    display:"flex", alignItems:"center", gap:"8px",
                    boxShadow:"0 8px 22px rgba(13,148,136,.32)",
                    letterSpacing:".2px",
                  }}
                >
                  <Calendar size={17} />
                  Book Appointment Now
                </button>

                <button
                  className="med-emergency-btn"
                  onClick={() => (window.location.href = "tel:8299431275")}
                  aria-label="Emergency Call"
                  style={{
                    background:"#ef4444",
                    color:"white",
                    border:"none",
                    borderRadius:"50px",
                    padding:"14px 22px",
                    fontSize:".93rem",
                    fontWeight:700,
                    cursor:"pointer",
                    display:"flex", alignItems:"center", gap:"8px",
                    boxShadow:"0 8px 22px rgba(239,68,68,.25)",
                    letterSpacing:".2px",
                  }}
                >
                  <Phone size={17} />
                  Emergency Call
                </button>
              </div>

              {/* Stat counters */}
              <div ref={statsRef} className="med-reveal" style={{ display:"flex", gap:"12px", marginTop:"32px", flexWrap:"wrap", transitionDelay:".25s" }}>
                <StatPill target={500} suffix="+"  label="Doctors"      delay=".0s" started={statsStarted} />
                <StatPill target={50}  suffix="k+" label="Patients"     delay=".1s" started={statsStarted} />
                <StatPill target={98}  suffix="%"  label="Satisfaction" delay=".2s" started={statsStarted} />
                <StatPill target={24}  suffix="/7" label="Available"    delay=".3s" started={statsStarted} />
              </div>
            </div>

            {/* ── RIGHT IMAGE ── */}
            <div className="med-reveal" style={{ flex:"1 1 320px", minWidth:"240px", display:"flex", justifyContent:"center", transitionDelay:".15s" }}>
              <div style={{ position:"relative", width:"100%", maxWidth:"440px" }}>

                <div style={{
                  position:"absolute", inset:"16px",
                  borderRadius:"28px",
                  background:"linear-gradient(135deg, #2dd4bf, #0f766e)", /* ✅ teal glow */
                  filter:"blur(36px)",
                  opacity:.18,
                  zIndex:0,
                }} />

                <div
                  ref={imageRef}
                  className="med-float"
                  style={{
                    position:"relative", zIndex:1,
                    borderRadius:"28px",
                    overflow:"hidden",
                    boxShadow:"0 24px 60px rgba(13,148,136,.18)",
                    border:"3px solid rgba(255,255,255,.85)",
                    willChange:"transform",
                  }}
                >
                  <img
                    src={banner}
                    alt="Professional Healthcare Team"
                    style={{ width:"100%", height:"auto", display:"block", objectFit:"cover" }}
                  />
                  <div style={{
                    position:"absolute", inset:0,
                    background:"linear-gradient(180deg, transparent 65%, rgba(15,118,110,.10) 100%)",
                    pointerEvents:"none",
                  }} />
                </div>

                {/* Floating verified badge */}
                <div style={{
                  position:"absolute", bottom:"18px", left:"-18px",
                  background:"white",
                  borderRadius:"14px",
                  padding:"10px 16px",
                  boxShadow:"0 8px 28px rgba(13,148,136,.18)",
                  border:"1.5px solid #99f6e4",
                  zIndex:2,
                  display:"flex", alignItems:"center", gap:"10px",
                  animation:"floatY 6s ease-in-out infinite",
                  animationDelay:".6s",
                }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#0d9488,#0f766e)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <ShieldUser size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontSize:".76rem", fontWeight:700, color:"#134e4a" }}>Verified Doctors</div>
                    <div style={{ fontSize:".68rem", color:"#6b7280" }}>100% Certified</div>
                  </div>
                </div>

                {/* Floating rating badge */}
                <div style={{
                  position:"absolute", top:"18px", right:"-14px",
                  background:"linear-gradient(135deg,#0d9488,#0f766e)", /* ✅ teal */
                  borderRadius:"14px",
                  padding:"10px 16px",
                  boxShadow:"0 8px 22px rgba(13,148,136,.30)",
                  zIndex:2,
                  animation:"floatY 4.5s ease-in-out infinite",
                  animationDelay:"1s",
                }}>
                  <div style={{ fontSize:".75rem", fontWeight:700, color:"white" }}>⭐ 4.9 / 5</div>
                  <div style={{ fontSize:".65rem", color:"rgba(255,255,255,.85)" }}>Patient Rating</div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
};

export default Banner;