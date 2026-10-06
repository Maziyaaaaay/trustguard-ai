import { lazy, Suspense, useState } from "react";
import "./App.css";

const LiveGuardPage = lazy(() => import("./pages/LiveGuard.jsx"));
const MediaAnalysisPage = lazy(() => import("./pages/MediaAnalysis.jsx"));

function PageLoader() {
  return (
    <main className="tg-page-loader" role="status" aria-live="polite">
      Loading TrustGuard analysis tools…
    </main>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("home");

  const goHome = () => setActivePage("home");

  if (activePage === "liveguard") {
    return (
      <Suspense fallback={<PageLoader />}>
        <LiveGuardPage onBack={goHome} />
      </Suspense>
    );
  }

  if (activePage === "media") {
    return (
      <Suspense fallback={<PageLoader />}>
        <MediaAnalysisPage onBack={goHome} />
      </Suspense>
    );
  }

  return (
    <div className="tg-app">
      <header className="tg-header">
        <button
          className="tg-brand"
          type="button"
          onClick={goHome}
          aria-label="TrustGuard AI home"
        >
          <span className="tg-brand-mark" aria-hidden="true">TG</span>
          <span className="tg-brand-copy">
            <strong>TRUSTGUARD AI</strong>
            <small>PERSONAL SAFETY WORKSPACE</small>
          </span>
        </button>

        <nav className="tg-nav" aria-label="Main navigation">
          <button className="tg-nav-item active" type="button" aria-current="page">
            Overview
          </button>
          <button
            className="tg-nav-item"
            type="button"
            onClick={() => setActivePage("liveguard")}
          >
            Live Guard
          </button>
          <button
            className="tg-nav-item"
            type="button"
            onClick={() => setActivePage("media")}
          >
            Media Analysis
          </button>
        </nav>
      </header>

      <main className="tg-main">
        <section className="tg-hero">
          <div className="tg-hero-copy">
            <p className="tg-eyebrow"><span /> YOUR DIGITAL SAFETY, IN FOCUS</p>
            <h1>Pause. Check.<br /><em>Then decide.</em></h1>
            <p className="tg-intro">
              Review a live call or inspect an image, audio clip, or video for
              signals that may need a closer look.
            </p>
            <p className="tg-note">
              TrustGuard provides risk indicators to support your judgment. It
              cannot guarantee that a call or file is genuine.
            </p>
          </div>
          <div className="tg-hero-symbol" aria-hidden="true">
            <div className="tg-orbit orbit-one" />
            <div className="tg-orbit orbit-two" />
            <div className="tg-shield">✓</div>
            <span className="tg-spark spark-one">✦</span>
            <span className="tg-spark spark-two">✧</span>
          </div>
        </section>

        <section className="tg-tools-section" aria-labelledby="tools-heading">
          <div className="tg-section-heading">
            <div>
              <p className="tg-eyebrow">CHECK A SIGNAL</p>
              <h2 id="tools-heading">What would you like to check?</h2>
            </div>
            <span className="tg-section-caption">Choose a tool to begin</span>
          </div>

          <div className="tg-tool-grid">
            <button
              className="tg-tool-card live-card"
              type="button"
              onClick={() => setActivePage("liveguard")}
            >
              <span className="tg-card-icon live-icon" aria-hidden="true">◉</span>
              <span className="tg-card-content">
                <span className="tg-card-kicker">LIVE SIGNALS</span>
                <strong>Live Guard</strong>
                <span className="tg-card-description">
                  Connect a phone caller and review face, liveness, replay, and
                  audio indicators.
                </span>
                <span className="tg-card-link">Open Live Guard <b>→</b></span>
              </span>
              <span className="tg-card-arrow" aria-hidden="true">↗</span>
            </button>

            <button
              className="tg-tool-card media-card"
              type="button"
              onClick={() => setActivePage("media")}
            >
              <span className="tg-card-icon media-icon" aria-hidden="true">▧</span>
              <span className="tg-card-content">
                <span className="tg-card-kicker">FILE INSPECTION</span>
                <strong>Media Analysis</strong>
                <span className="tg-card-description">
                  Upload an image, audio clip, or video and review the analysis
                  findings.
                </span>
                <span className="tg-card-link">Analyze media <b>→</b></span>
              </span>
              <span className="tg-card-arrow" aria-hidden="true">↗</span>
            </button>
          </div>

          <section className="tg-handoff-section" aria-labelledby="handoff-heading">
            <div className="tg-section-heading">
              <div>
                <p className="tg-eyebrow">SPECIALIST CHECKS</p>
                <h2 id="handoff-heading">Continue with a specialist</h2>
              </div>
              <span className="tg-section-caption">Opens the service in WhatsApp</span>
            </div>
            <div className="tg-handoff-grid">
              <article className="tg-handoff-card">
                <div>
                  <span className="tg-card-kicker">NEWS & CLAIMS</span>
                  <h3>SathyaScan</h3>
                  <p>Send a news story or article for a fake-news check.</p>
                </div>
                <a href="https://wa.me/919074871768" target="_blank" rel="noopener noreferrer">
                  Open SathyaScan <span aria-hidden="true">↗</span>
                </a>
              </article>
              <article className="tg-handoff-card">
                <div>
                  <span className="tg-card-kicker">SCAM & CYBER CHECKS</span>
                  <h3>CyberWall</h3>
                  <p>Check APKs, bank details, links, emails, SMS, IPs, or phone numbers.</p>
                </div>
                <a href="https://wa.me/919497964163" target="_blank" rel="noopener noreferrer">
                  Open CyberWall <span aria-hidden="true">↗</span>
                </a>
              </article>
            </div>
          </section>
        </section>

        <footer className="tg-footer">
          <span><span className="tg-footer-dot" /> TRUST STARTS WITH VERIFICATION</span>
          <span>TrustGuard AI · Prototype</span>
        </footer>
      </main>
    </div>
  );
}
