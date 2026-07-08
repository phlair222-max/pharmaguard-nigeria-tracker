import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
      else setChecking(false);
    });
  }, []);

  if (checking) return null;

  return (
    <div className="pg-landing">

      {/* ── NAV ── */}
      <nav className="pg-nav">
        <div className="pg-logo">
          <img src="/logo.jpg" alt="PharmaGuard NG" className="pg-logo-img" />
          <span>PharmaGuard NG</span>
        </div>
        <div className="pg-nav-links">
          <a href="#problem">The Problem</a>
          <a href="#features">Features</a>
          <a href="#api">For Developers</a>
          <a href="#testimonial">Reviews</a>
        </div>
        <button className="pg-btn-nav" onClick={() => navigate("/login")}>Start free</button>
      </nav>

      {/* ── HERO ── */}
      <section className="pg-hero">
        <div className="pg-eyebrow">Built for Nigerian pharmacies</div>
        <h1 className="pg-headline">
          Your pharmacy is<br />bleeding money.<br />
          <span className="pg-headline-accent">We stop the leak.</span>
        </h1>
        <p className="pg-sub">
          Every expired drug on your shelf is money you already spent and will never see again.
          PharmaGuard NG catches it before it happens — automatically, every single day.
        </p>
        <button className="pg-btn-primary pg-btn-large" onClick={() => navigate("/login")}>
          Start free — no card needed
        </button>
        <div className="pg-proof-row">
          <span>✓ Free plan forever</span>
          <span>✓ Setup in under 30 minutes</span>
          <span>✓ No IT knowledge needed</span>
        </div>
      </section>

      {/* ── PAIN STAT BAND ── */}
      <section className="pg-stat-band">
        <div className="pg-stat">
          <div className="pg-stat-num">₦120,000</div>
          <div className="pg-stat-label">Average annual loss to expired stock in a mid-size Nigerian pharmacy</div>
        </div>
        <div className="pg-stat-div" />
        <div className="pg-stat">
          <div className="pg-stat-num">90 days</div>
          <div className="pg-stat-label">The window where you can still run promos and recover your money</div>
        </div>
        <div className="pg-stat-div" />
        <div className="pg-stat">
          <div className="pg-stat-num">0 alerts</div>
          <div className="pg-stat-label">What most pharmacies get before an expired batch wipes out their margin</div>
        </div>
      </section>

      {/* ── PROBLEM / AGITATE ── */}
      <section className="pg-section" id="problem">
        <div className="pg-section-label">The real problem</div>
        <h2 className="pg-section-title">
          Excel sheets don't alert you.<br />Paper records don't save you.
        </h2>
        <div className="pg-problem-grid">
          <div className="pg-problem-card">
            <div className="pg-problem-icon">😰</div>
            <h3>You find out too late</h3>
            <p>By the time you spot an expired batch, it's already a write-off. No warning. No time to run a promo. Just a loss.</p>
          </div>
          <div className="pg-problem-card">
            <div className="pg-problem-icon">📋</div>
            <h3>Manual tracking doesn't scale</h3>
            <p>One pharmacist managing 300 products in a notebook or spreadsheet will miss something. Every time. It's not a question of if — it's when.</p>
          </div>
          <div className="pg-problem-card">
            <div className="pg-problem-icon">⚖️</div>
            <h3>NAFDAC compliance is a risk</h3>
            <p>Controlled drug registers done manually are incomplete, inconsistent, and a liability during inspections. One bad audit can cost your license.</p>
          </div>
        </div>
      </section>

      {/* ── SOLUTION / HOW IT WORKS ── */}
      <section className="pg-section pg-section-alt" id="how-it-works">
        <div className="pg-section-label">How it works</div>
        <h2 className="pg-section-title">
          From chaotic stock list to<br />live expiry dashboard in one afternoon.
        </h2>
        <div className="pg-steps">
          <div className="pg-step">
            <div className="pg-step-num">1</div>
            <div className="pg-step-body">
              <h3>We load your inventory</h3>
              <p>Send us your stock list — WhatsApp photo, Excel file, handwritten notebook. We clean it, format it, and upload it for you. That's what the ₦15,000 setup covers.</p>
            </div>
          </div>
          <div className="pg-step-line" />
          <div className="pg-step">
            <div className="pg-step-num">2</div>
            <div className="pg-step-body">
              <h3>The system watches silently</h3>
              <p>Every morning your dashboard updates automatically. Products expiring in 90, 60, or 30 days are flagged by color before you open a single drawer.</p>
            </div>
          </div>
          <div className="pg-step-line" />
          <div className="pg-step">
            <div className="pg-step-num">3</div>
            <div className="pg-step-body">
              <h3>You act before it costs you</h3>
              <p>Run a promo, halt restocking, generate a NAFDAC disposal report — all from your phone. No expired drug catches you by surprise again.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section className="pg-testimonial-section" id="testimonial">
        <div className="pg-testimonial-card">
          <div className="pg-quote-mark">"</div>
          <p className="pg-quote-text">
            Before PharmaGuard, I wrote off ₦80,000 in expired stock in one quarter alone.
            I didn't even know it was happening until it was too late. I haven't lost a naira
            to expiry since I started using it. The alerts alone paid for the whole year.
          </p>
          <div className="pg-quote-author">
            <div className="pg-author-avatar">A</div>
            <div>
              <div className="pg-author-name">Adaeze O.</div>
              <div className="pg-author-role">Pharmacist-in-Charge, Lagos Island</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="pg-section" id="features">
        <div className="pg-section-label">What's included</div>
        <h2 className="pg-section-title">
          Everything your pharmacy needs.<br />Nothing it doesn't.
        </h2>
        <div className="pg-features-grid">
          {[
            { icon: "📦", title: "Live Inventory", desc: "Track every product, batch, and expiry date in real time. Import from Excel in seconds. Barcode scanning included." },
            { icon: "🔔", title: "Expiry Alerts", desc: "Automatic 90-day, 60-day, and 30-day warnings so you always have time to act before stock expires." },
            { icon: "🧾", title: "POS & Sales", desc: "Record every sale, accept Cash, POS, or Transfer. Full history with daily summaries and profit tracking." },
            { icon: "💊", title: "Poisons Register", desc: "Controlled drug dispensing log with full patient and prescriber records. Stay NAFDAC-compliant automatically." },
            { icon: "🤖", title: "AI Disposal Report", desc: "One click generates a NAFDAC-formatted disposal report for expiring products — ready to submit." },
            { icon: "👥", title: "Multi-staff Roles", desc: "Owner, Pharmacist, and Cashier roles. Each staff member sees only what they need to do their job." },
          ].map((f) => (
            <div className="pg-feature-card" key={f.title}>
              <div className="pg-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── API / B2B SECTION ── */}
      <section className="pg-section pg-api-section" id="api">
        <div className="pg-api-inner">
          <div className="pg-api-badge">For developers & institutions</div>
          <h2 className="pg-section-title pg-api-title">
            PharmaGuard NG<br />Modular API
          </h2>
          <p className="pg-api-desc">
            Hospitals, pharmacy chains, EMR platforms, and developers can connect directly to
            the PharmaGuard NG infrastructure via our Modular API. Access real-time inventory
            data, controlled drug records, and compliance reports — without building the system yourself.
          </p>
          <div className="pg-api-cards">
            <div className="pg-api-card">
              <div className="pg-api-card-icon">🏥</div>
              <h3>Hospitals & Chains</h3>
              <p>Connect multiple pharmacy branches to a single dashboard. Centralized inventory visibility across all locations.</p>
            </div>
            <div className="pg-api-card">
              <div className="pg-api-card-icon">⚕️</div>
              <h3>EMR Platforms</h3>
              <p>Integrate drug dispensing, stock deduction, and controlled substance records directly into your existing patient management system.</p>
            </div>
            <div className="pg-api-card">
              <div className="pg-api-card-icon">👨‍💻</div>
              <h3>Developers</h3>
              <p>Build on top of Nigeria's most compliance-ready pharmacy data layer. Tenant-isolated, secure, and production-ready.</p>
            </div>
          </div>
          <a
            className="pg-btn-api"
            href="https://wa.me/2348051376835?text=Hi%20Sola%2C%20I%20want%20to%20know%20more%20about%20the%20PharmaGuard%20NG%20API"
            target="_blank"
            rel="noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.57a.75.75 0 00.912.912l5.715-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 01-4.964-1.362l-.355-.212-3.685.947.966-3.684-.232-.371A9.722 9.722 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
            Talk to Sola about API access
          </a>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="pg-cta-section">
        <div className="pg-cta-eyebrow">Your next expiry loss is already counting down.</div>
        <h2 className="pg-cta-title">
          Stop managing stock<br />by memory and luck.
        </h2>
        <p className="pg-cta-sub">
          Start free today. When you're ready to upgrade, call Sola directly — we'll set everything up for you in person.
        </p>
        <button className="pg-btn-primary pg-btn-large" onClick={() => navigate("/login")}>
          Create free account
        </button>
        <div className="pg-cta-wa">
          <a
            href="https://wa.me/2348051376835?text=Hi%20Sola%2C%20I%20want%20to%20know%20more%20about%20PharmaGuard%20NG"
            target="_blank"
            rel="noreferrer"
            className="pg-wa-link"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.57a.75.75 0 00.912.912l5.715-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 01-4.964-1.362l-.355-.212-3.685.947.966-3.684-.232-.371A9.722 9.722 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
            Or WhatsApp Sola directly
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="pg-footer">
        <div className="pg-logo">
          <img src="/logo.jpg" alt="PharmaGuard NG" className="pg-logo-img" />
          <span>PharmaGuard NG</span>
        </div>
        <p className="pg-footer-copy">Built for Nigerian pharmacies. © {new Date().getFullYear()} PharmaGuard NG. All rights reserved.</p>
      </footer>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .pg-landing {
          background: #000000;
          color: #e8f0ef;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── NAV ── */
        .pg-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 3rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: sticky;
          top: 0;
          background: rgba(0,0,0,0.9);
          backdrop-filter: blur(16px);
          z-index: 50;
        }
        .pg-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 700;
          font-size: 1rem;
          color: #ffffff;
        }
        .pg-logo-img {
          width: 30px;
          height: 30px;
          object-fit: contain;
          border-radius: 6px;
        }
        .pg-nav-links {
          display: flex;
          gap: 2.5rem;
        }
        .pg-nav-links a {
          color: #888;
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
        }
        .pg-nav-links a:hover { color: #ffffff; }
        .pg-btn-nav {
          background: #ffffff;
          color: #000000;
          border: none;
          border-radius: 8px;
          padding: 0.6rem 1.25rem;
          font-weight: 700;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .pg-btn-nav:hover { background: #00C896; color: #000; }

        /* ── HERO ── */
        .pg-hero {
          max-width: 900px;
          margin: 0 auto;
          padding: 7rem 2rem 6rem;
          text-align: center;
        }
        .pg-eyebrow {
          display: inline-block;
          background: rgba(0,200,150,0.1);
          color: #00C896;
          border: 1px solid rgba(0,200,150,0.25);
          border-radius: 100px;
          padding: 0.3rem 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 2rem;
        }
        .pg-headline {
          font-size: clamp(2.75rem, 7vw, 5rem);
          font-weight: 800;
          line-height: 1.06;
          letter-spacing: -0.04em;
          color: #ffffff;
          margin-bottom: 1.75rem;
        }
        .pg-headline-accent {
          color: #00C896;
        }
        .pg-sub {
          font-size: 1.15rem;
          line-height: 1.75;
          color: #888;
          max-width: 620px;
          margin: 0 auto 2.75rem;
        }
        .pg-btn-primary {
          background: #00C896;
          color: #000000;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
          display: inline-block;
        }
        .pg-btn-large {
          padding: 1rem 2.25rem;
          font-size: 1rem;
        }
        .pg-btn-primary:hover { background: #00e0aa; transform: translateY(-1px); }
        .pg-proof-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          flex-wrap: wrap;
          font-size: 0.8rem;
          color: #555;
          margin-top: 1.75rem;
        }

        /* ── STAT BAND ── */
        .pg-stat-band {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,200,150,0.04);
          border-top: 1px solid rgba(0,200,150,0.1);
          border-bottom: 1px solid rgba(0,200,150,0.1);
          padding: 3.5rem 2rem;
          flex-wrap: wrap;
          gap: 0;
        }
        .pg-stat {
          text-align: center;
          padding: 1rem 3.5rem;
          flex: 1;
          min-width: 200px;
        }
        .pg-stat-num {
          font-size: 2.5rem;
          font-weight: 800;
          color: #00C896;
          letter-spacing: -0.04em;
          margin-bottom: 0.5rem;
        }
        .pg-stat-label {
          font-size: 0.82rem;
          color: #666;
          line-height: 1.5;
          max-width: 200px;
          margin: 0 auto;
        }
        .pg-stat-div {
          width: 1px;
          height: 64px;
          background: rgba(255,255,255,0.07);
          flex-shrink: 0;
        }

        /* ── SECTIONS ── */
        .pg-section {
          max-width: 1100px;
          margin: 0 auto;
          padding: 7rem 2rem;
        }
        .pg-section-alt {
          max-width: 100%;
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .pg-section-alt > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
        .pg-section-label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #00C896;
          margin-bottom: 1.25rem;
        }
        .pg-section-title {
          font-size: clamp(1.85rem, 3.5vw, 2.85rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #ffffff;
          line-height: 1.12;
          margin-bottom: 3rem;
        }

        /* ── PROBLEM GRID ── */
        .pg-problem-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.25rem;
        }
        .pg-problem-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 1.75rem;
          transition: border-color 0.2s;
        }
        .pg-problem-card:hover { border-color: rgba(255,80,80,0.3); }
        .pg-problem-icon { font-size: 1.75rem; margin-bottom: 1rem; }
        .pg-problem-card h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.6rem;
        }
        .pg-problem-card p { font-size: 0.875rem; color: #666; line-height: 1.65; }

        /* ── STEPS ── */
        .pg-steps {
          display: flex;
          align-items: flex-start;
          gap: 0;
          flex-wrap: wrap;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        .pg-step {
          display: flex;
          gap: 1.25rem;
          flex: 1;
          min-width: 240px;
        }
        .pg-step-num {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(0,200,150,0.12);
          border: 1px solid rgba(0,200,150,0.35);
          color: #00C896;
          font-weight: 800;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pg-step-body h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }
        .pg-step-body p { font-size: 0.875rem; color: #666; line-height: 1.65; }
        .pg-step-line {
          width: 48px;
          height: 1px;
          background: rgba(0,200,150,0.2);
          margin-top: 19px;
          flex-shrink: 0;
        }

        /* ── TESTIMONIAL ── */
        .pg-testimonial-section {
          padding: 6rem 2rem;
          display: flex;
          justify-content: center;
        }
        .pg-testimonial-card {
          max-width: 720px;
          background: rgba(0,200,150,0.04);
          border: 1px solid rgba(0,200,150,0.15);
          border-radius: 20px;
          padding: 3rem;
          position: relative;
        }
        .pg-quote-mark {
          font-size: 5rem;
          color: #00C896;
          line-height: 0.5;
          margin-bottom: 1.5rem;
          font-family: Georgia, serif;
          opacity: 0.4;
        }
        .pg-quote-text {
          font-size: 1.2rem;
          line-height: 1.75;
          color: #cccccc;
          margin-bottom: 2rem;
          font-style: italic;
        }
        .pg-quote-author {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .pg-author-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0,200,150,0.2);
          border: 1px solid rgba(0,200,150,0.4);
          color: #00C896;
          font-weight: 700;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pg-author-name { font-weight: 700; color: #ffffff; font-size: 0.95rem; }
        .pg-author-role { font-size: 0.8rem; color: #666; margin-top: 0.15rem; }

        /* ── FEATURES ── */
        .pg-features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 1.25rem;
        }
        .pg-feature-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 1.75rem;
          transition: border-color 0.2s;
        }
        .pg-feature-card:hover { border-color: rgba(0,200,150,0.3); }
        .pg-feature-icon { font-size: 1.5rem; margin-bottom: 0.85rem; }
        .pg-feature-card h3 {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }
        .pg-feature-card p { font-size: 0.85rem; color: #666; line-height: 1.65; }

        /* ── API SECTION ── */
        .pg-api-section {
          max-width: 100%;
          background: rgba(139,92,246,0.04);
          border-top: 1px solid rgba(139,92,246,0.15);
          border-bottom: 1px solid rgba(139,92,246,0.15);
          padding: 7rem 2rem;
        }
        .pg-api-inner {
          max-width: 1100px;
          margin: 0 auto;
        }
        .pg-api-badge {
          display: inline-block;
          background: rgba(139,92,246,0.12);
          color: #a78bfa;
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 100px;
          padding: 0.3rem 1rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 1.25rem;
        }
        .pg-api-title { color: #ffffff; }
        .pg-api-desc {
          font-size: 1rem;
          color: #888;
          line-height: 1.75;
          max-width: 680px;
          margin-bottom: 3rem;
        }
        .pg-api-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 1.25rem;
          margin-bottom: 2.5rem;
        }
        .pg-api-card {
          background: rgba(139,92,246,0.05);
          border: 1px solid rgba(139,92,246,0.15);
          border-radius: 14px;
          padding: 1.75rem;
          transition: border-color 0.2s;
        }
        .pg-api-card:hover { border-color: rgba(139,92,246,0.4); }
        .pg-api-card-icon { font-size: 1.5rem; margin-bottom: 0.85rem; }
        .pg-api-card h3 {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }
        .pg-api-card p { font-size: 0.85rem; color: #888; line-height: 1.65; }
        .pg-btn-api {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(139,92,246,0.15);
          color: #a78bfa;
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 10px;
          padding: 0.85rem 1.75rem;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s;
        }
        .pg-btn-api:hover {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.5);
          color: #c4b5fd;
        }

        /* ── FINAL CTA ── */
        .pg-cta-section {
          text-align: center;
          padding: 8rem 2rem;
          max-width: 700px;
          margin: 0 auto;
        }
        .pg-cta-eyebrow {
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 1.5rem;
        }
        .pg-cta-title {
          font-size: clamp(2rem, 4vw, 3.25rem);
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.04em;
          line-height: 1.1;
          margin-bottom: 1.25rem;
        }
        .pg-cta-sub {
          color: #666;
          font-size: 1rem;
          line-height: 1.75;
          margin-bottom: 2.5rem;
        }
        .pg-cta-wa {
          margin-top: 1.5rem;
        }
        .pg-wa-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #555;
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
        }
        .pg-wa-link:hover { color: #00C896; }

        /* ── FOOTER ── */
        .pg-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 2rem 3rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .pg-footer-copy { font-size: 0.78rem; color: #444; }

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
          .pg-nav { padding: 1rem 1.25rem; }
          .pg-nav-links { display: none; }
          .pg-hero { padding: 5rem 1.25rem 4rem; }
          .pg-stat-div { display: none; }
          .pg-stat-band { gap: 1.5rem; }
          .pg-step-line { display: none; }
          .pg-steps { gap: 2rem; padding: 0 0; }
          .pg-section { padding: 5rem 1.25rem; }
          .pg-api-section { padding: 5rem 1.25rem; }
          .pg-testimonial-card { padding: 2rem 1.5rem; }
          .pg-cta-section { padding: 5rem 1.25rem; }
          .pg-footer { padding: 1.5rem 1.25rem; flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
