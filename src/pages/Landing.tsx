import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  // Redirect logged-in users straight to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
      else setChecking(false);
    });
  }, []);

  if (checking) return null;

  return (
    <div className="landing">
      {/* ── NAV ── */}
      <nav className="landing-nav">
        <div className="landing-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#00C896"/>
            <path d="M9 14h10M14 9v10" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span>PharmaGuard NG</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#how-it-works">How it works</a>
        </div>
        <button className="btn-outline" onClick={() => navigate("/login")}>Sign in</button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-eyebrow">Built for Nigerian pharmacies</div>
        <h1 className="hero-headline">
          Stop losing money<br />to expired stock.
        </h1>
        <p className="hero-sub">
          Every day a drug sits past its expiry date is money you can never recover.
          PharmaGuard NG watches your shelves 24/7 and alerts you before it's too late —
          for less than the price of a cold Pepsi.
        </p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => navigate("/login")}>
            Start free — no card needed
          </button>
          <a
            className="btn-ghost"
            href="https://wa.me/2348000000000?text=Hi%20Sola%2C%20I%20want%20a%20demo%20of%20PharmaGuard%20NG"
            target="_blank"
            rel="noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.57a.75.75 0 00.912.912l5.715-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 01-4.964-1.362l-.355-.212-3.685.947.966-3.684-.232-.371A9.722 9.722 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
            Book a demo
          </a>
        </div>
        <div className="hero-proof">
          <span>✓ Free plan forever</span>
          <span>✓ Setup in under 30 minutes</span>
          <span>✓ No IT knowledge needed</span>
        </div>
      </section>

      {/* ── PAIN STAT ── */}
      <section className="stat-band">
        <div className="stat-item">
          <div className="stat-number">₦120,000</div>
          <div className="stat-label">Average annual loss to expired stock in a mid-size pharmacy</div>
        </div>
        <div className="stat-divider"/>
        <div className="stat-item">
          <div className="stat-number">90 days</div>
          <div className="stat-label">The window where you can still run promos and recover your money</div>
        </div>
        <div className="stat-divider"/>
        <div className="stat-item">
          <div className="stat-number">₦500/day</div>
          <div className="stat-label">All it costs to make sure you never miss that window again</div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section" id="how-it-works">
        <div className="section-label">How it works</div>
        <h2 className="section-title">From messy Excel sheet to<br/>live expiry dashboard in one afternoon</h2>
        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <div className="step-body">
              <h3>We load your inventory</h3>
              <p>Send us your stock list — WhatsApp message, Excel sheet, handwritten notebook photo. We clean it, format it, and upload it for you. That's what the ₦15,000 setup covers.</p>
            </div>
          </div>
          <div className="step-connector"/>
          <div className="step">
            <div className="step-num">2</div>
            <div className="step-body">
              <h3>The system watches silently</h3>
              <p>Every morning your dashboard updates automatically. Products expiring in 90, 60, or 30 days are flagged by colour before you open a single drawer.</p>
            </div>
          </div>
          <div className="step-connector"/>
          <div className="step">
            <div className="step-num">3</div>
            <div className="step-body">
              <h3>You act before it costs you</h3>
              <p>Run a promo, halt restocking, generate a NAFDAC disposal report — all from your phone. No expired drug catches you by surprise again.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section section-alt" id="features">
        <div className="section-label">What's included</div>
        <h2 className="section-title">Everything a pharmacy needs.<br/>Nothing it doesn't.</h2>
        <div className="features-grid">
          {[
            { icon: "📦", title: "Live Inventory", desc: "Track every product, batch, and expiry date in one place. Import from Excel in seconds." },
            { icon: "🔔", title: "Expiry Alerts", desc: "90-day, 60-day, and 30-day warnings so you always have time to act on expiring stock." },
            { icon: "🧾", title: "POS & Sales", desc: "Record sales, accept Cash, POS, or Transfer. Full sales history with daily and monthly reports." },
            { icon: "💊", title: "Poisons Register", desc: "Controlled drug dispensing log with pharmacist PIN authorization. Stay NAFDAC-compliant automatically." },
            { icon: "🤖", title: "AI Disposal Report", desc: "One click generates a NAFDAC-formatted disposal report for expiring products. Pro feature." },
            { icon: "👥", title: "Multi-staff Roles", desc: "Owner, Pharmacist, and Cashier roles. Each sees only what they need to." },
          ].map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="section" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-title">Less than you spend on<br/>one expired batch.</h2>
        <p className="section-sub">All plans include a ₦15,000 one-time setup fee — we load your inventory and train your staff in person.</p>
        <div className="pricing-grid">
          {/* FREE */}
          <div className="pricing-card">
            <div className="plan-name">Free</div>
            <div className="plan-price">₦0<span>/day</span></div>
            <div className="plan-desc">Get started, no commitment.</div>
            <ul className="plan-features">
              <li>✓ Up to 50 products</li>
              <li>✓ 1 staff account</li>
              <li>✓ POS & sales recording</li>
              <li>✓ Basic expiry tracking</li>
              <li className="muted">✗ Expiry alerts</li>
              <li className="muted">✗ Reports & exports</li>
              <li className="muted">✗ Poisons Register</li>
            </ul>
            <button className="btn-outline-full" onClick={() => navigate("/login")}>Start free</button>
          </div>

          {/* BASIC */}
          <div className="pricing-card pricing-card-featured">
            <div className="plan-badge">Most popular</div>
            <div className="plan-name">Basic</div>
            <div className="plan-price">₦500<span>/day</span></div>
            <div className="plan-price-sub">₦15,000/month</div>
            <div className="plan-desc">For busy independent pharmacies.</div>
            <ul className="plan-features">
              <li>✓ Up to 500 products</li>
              <li>✓ 3 staff accounts</li>
              <li>✓ Everything in Free</li>
              <li>✓ 90/60/30-day expiry alerts</li>
              <li>✓ Reports & CSV exports</li>
              <li>✓ Suppliers module</li>
              <li>✓ Poisons Register</li>
              <li>✓ Audit trail</li>
            </ul>
            <button className="btn-primary-full" onClick={() => navigate("/login")}>Get started</button>
          </div>

          {/* PRO */}
          <div className="pricing-card pricing-card-pro">
            <div className="plan-name">Pro</div>
            <div className="plan-price">₦700<span>/day</span></div>
            <div className="plan-price-sub">₦21,000/month</div>
            <div className="plan-desc">For high-volume pharmacies and growing chains.</div>
            <ul className="plan-features">
              <li>✓ Unlimited products</li>
              <li>✓ Unlimited staff</li>
              <li>✓ Everything in Basic</li>
              <li>✓ AI Disposal Report (NAFDAC)</li>
              <li>✓ WhatsApp & SMS alerts</li>
              <li>✓ Priority support</li>
              <li>✓ Barcode scanning (coming soon)</li>
            </ul>
            <button className="btn-outline-full" onClick={() => navigate("/login")}>Get started</button>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="cta-section">
        <h2>Your next expiry loss is already counting down.</h2>
        <p>Start free today. When you're ready to upgrade, call Sola directly — we'll set everything up for you.</p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => navigate("/login")}>Create free account</button>
          <a
            className="btn-ghost"
            href="https://wa.me/2348051376835?text=Hi%20Sola%2C%20I%20want%20to%20know%20more%20about%20PharmaGuard%20NG"
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp Sola
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="landing-logo">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#00C896"/>
            <path d="M9 14h10M14 9v10" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span>PharmaGuard NG</span>
        </div>
        <p className="footer-copy">Built for Nigerian pharmacies. © {new Date().getFullYear()} PharmaGuard NG.</p>
      </footer>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .landing {
          background: #080f0f;
          color: #e8f0ef;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* NAV */
        .landing-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: sticky;
          top: 0;
          background: rgba(8,15,15,0.92);
          backdrop-filter: blur(12px);
          z-index: 50;
        }
        .landing-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 700;
          font-size: 1rem;
          color: #e8f0ef;
          text-decoration: none;
        }
        .landing-nav-links {
          display: flex;
          gap: 2rem;
        }
        .landing-nav-links a {
          color: #9ab0ad;
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
        }
        .landing-nav-links a:hover { color: #00C896; }

        /* BUTTONS */
        .btn-primary {
          background: #00C896;
          color: #080f0f;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
        }
        .btn-primary:hover { background: #00e0aa; transform: translateY(-1px); }
        .btn-outline {
          background: transparent;
          color: #e8f0ef;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          padding: 0.6rem 1.2rem;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .btn-outline:hover { border-color: #00C896; color: #00C896; }
        .btn-ghost {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          color: #9ab0ad;
          border: none;
          padding: 0.75rem 1rem;
          font-size: 0.95rem;
          cursor: pointer;
          text-decoration: none;
          transition: color 0.2s;
        }
        .btn-ghost:hover { color: #e8f0ef; }
        .btn-primary-full {
          width: 100%;
          background: #00C896;
          color: #080f0f;
          border: none;
          border-radius: 8px;
          padding: 0.85rem;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: background 0.2s;
          margin-top: auto;
        }
        .btn-primary-full:hover { background: #00e0aa; }
        .btn-outline-full {
          width: 100%;
          background: transparent;
          color: #e8f0ef;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          padding: 0.85rem;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: border-color 0.2s;
          margin-top: auto;
        }
        .btn-outline-full:hover { border-color: #00C896; color: #00C896; }

        /* HERO */
        .hero {
          max-width: 800px;
          margin: 0 auto;
          padding: 6rem 2rem 5rem;
          text-align: center;
        }
        .hero-eyebrow {
          display: inline-block;
          background: rgba(0,200,150,0.12);
          color: #00C896;
          border: 1px solid rgba(0,200,150,0.3);
          border-radius: 100px;
          padding: 0.3rem 1rem;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 1.75rem;
        }
        .hero-headline {
          font-size: clamp(2.5rem, 6vw, 4.25rem);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.03em;
          color: #ffffff;
          margin-bottom: 1.5rem;
        }
        .hero-sub {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #9ab0ad;
          max-width: 600px;
          margin: 0 auto 2.5rem;
        }
        .hero-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }
        .hero-proof {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          flex-wrap: wrap;
          font-size: 0.8rem;
          color: #5a7a76;
        }

        /* STAT BAND */
        .stat-band {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: rgba(0,200,150,0.05);
          border-top: 1px solid rgba(0,200,150,0.12);
          border-bottom: 1px solid rgba(0,200,150,0.12);
          padding: 3rem 2rem;
          flex-wrap: wrap;
        }
        .stat-item {
          text-align: center;
          padding: 1rem 3rem;
          flex: 1;
          min-width: 200px;
        }
        .stat-number {
          font-size: 2.25rem;
          font-weight: 800;
          color: #00C896;
          letter-spacing: -0.03em;
          margin-bottom: 0.5rem;
        }
        .stat-label {
          font-size: 0.82rem;
          color: #7a9a96;
          line-height: 1.5;
          max-width: 200px;
          margin: 0 auto;
        }
        .stat-divider {
          width: 1px;
          height: 60px;
          background: rgba(255,255,255,0.08);
          flex-shrink: 0;
        }

        /* SECTIONS */
        .section {
          max-width: 1100px;
          margin: 0 auto;
          padding: 6rem 2rem;
        }
        .section-alt {
          max-width: 100%;
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .section-alt > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
        .section-alt .features-grid { max-width: 1100px; margin: 0 auto; }
        .section-label {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #00C896;
          margin-bottom: 1rem;
        }
        .section-title {
          font-size: clamp(1.75rem, 3.5vw, 2.75rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #ffffff;
          line-height: 1.15;
          margin-bottom: 1rem;
        }
        .section-sub {
          color: #7a9a96;
          font-size: 0.95rem;
          margin-bottom: 3rem;
          max-width: 560px;
        }

        /* STEPS */
        .steps {
          display: flex;
          align-items: flex-start;
          gap: 0;
          margin-top: 3rem;
          flex-wrap: wrap;
        }
        .step {
          display: flex;
          gap: 1.25rem;
          flex: 1;
          min-width: 220px;
        }
        .step-num {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(0,200,150,0.15);
          border: 1px solid rgba(0,200,150,0.4);
          color: #00C896;
          font-weight: 800;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .step-body h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }
        .step-body p {
          font-size: 0.875rem;
          color: #7a9a96;
          line-height: 1.6;
        }
        .step-connector {
          width: 40px;
          height: 1px;
          background: rgba(0,200,150,0.2);
          margin-top: 18px;
          flex-shrink: 0;
        }

        /* FEATURES */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.25rem;
          margin-top: 3rem;
          padding: 0 2rem;
        }
        .feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 1.5rem;
          transition: border-color 0.2s;
        }
        .feature-card:hover { border-color: rgba(0,200,150,0.3); }
        .feature-icon { font-size: 1.5rem; margin-bottom: 0.75rem; }
        .feature-card h3 {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }
        .feature-card p { font-size: 0.85rem; color: #7a9a96; line-height: 1.6; }

        /* PRICING */
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
          margin-top: 3rem;
        }
        .pricing-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: relative;
        }
        .pricing-card-featured {
          border-color: rgba(0,200,150,0.4);
          background: rgba(0,200,150,0.05);
        }
        .pricing-card-pro {
          border-color: rgba(139,92,246,0.4);
          background: rgba(139,92,246,0.04);
        }
        .plan-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: #00C896;
          color: #080f0f;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 0.25rem 0.75rem;
          border-radius: 100px;
          white-space: nowrap;
        }
        .plan-name { font-size: 0.85rem; font-weight: 700; color: #9ab0ad; text-transform: uppercase; letter-spacing: 0.08em; }
        .plan-price { font-size: 2.5rem; font-weight: 800; color: #ffffff; letter-spacing: -0.04em; }
        .plan-price span { font-size: 1rem; font-weight: 400; color: #7a9a96; }
        .plan-price-sub { font-size: 0.8rem; color: #5a7a76; margin-top: -0.75rem; }
        .plan-desc { font-size: 0.85rem; color: #7a9a96; }
        .plan-features { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; flex: 1; }
        .plan-features li { font-size: 0.85rem; color: #9ab0ad; }
        .plan-features li.muted { color: #3a5a56; }

        /* FINAL CTA */
        .cta-section {
          text-align: center;
          padding: 6rem 2rem;
          max-width: 680px;
          margin: 0 auto;
        }
        .cta-section h2 {
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.03em;
          margin-bottom: 1rem;
          line-height: 1.2;
        }
        .cta-section p { color: #7a9a96; margin-bottom: 2.5rem; line-height: 1.7; }

        /* FOOTER */
        .landing-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .footer-copy { font-size: 0.8rem; color: #3a5a56; }

        /* RESPONSIVE */
        @media (max-width: 768px) {
          .landing-nav-links { display: none; }
          .stat-divider { display: none; }
          .stat-band { gap: 1rem; }
          .step-connector { display: none; }
          .steps { gap: 2rem; }
          .section-alt .features-grid { padding: 0 1rem; }
        }
      `}</style>
    </div>
  );
}
