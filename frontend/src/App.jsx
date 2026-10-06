import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  Banknote,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  FileVideo2,
  Fingerprint,
  Globe2,
  Image as ImageIcon,
  LockKeyhole,
  MessageCircleWarning,
  ScanFace,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import "./App.css";

const LiveGuardPage = lazy(() => import("./pages/LiveGuard.jsx"));
const MediaAnalysisPage = lazy(() => import("./pages/MediaAnalysis.jsx"));
const MascotView = lazy(() => import("./components/MascotReact.jsx").then((module) => ({ default: module.MascotView })));

const mascotLines = [
  "Pause a moment. Check the signal.",
  "A payment request deserves a second look.",
  "I’m watching the little details.",
  "When in doubt, verify another way.",
];

function PageLoader() {
  return (
    <main className="tg-page-loader" role="status" aria-live="polite">
      Loading TrustGuard analysis tools…
    </main>
  );
}

function SafetyMascot() {
  const mascot = useRef(null);
  const hideTimer = useRef(null);
  const [line, setLine] = useState(mascotLines[0]);
  const [showLine, setShowLine] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cue = () => {
      if (reducedMotion.matches) return;
      const move = ["wave", "nod", "jump", "surprised"][Math.floor(Math.random() * 4)];
      mascot.current?.play(move)?.catch?.(() => {});
      setLine(mascotLines[Math.floor(Math.random() * mascotLines.length)]);
      setShowLine(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShowLine(false), 3200);
    };

    const interval = window.setInterval(cue, 11500);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  const wave = () => {
    mascot.current?.play("wave")?.catch?.(() => {});
    setLine("Hey there. Let’s stay one step ahead.");
    setShowLine(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowLine(false), 3600);
  };

  return (
    <aside className="tg-mascot-dock" aria-label="TrustGuard safety mascot">
      <div className={`tg-mascot-note${showLine ? " is-visible" : ""}`} aria-live="polite">
        <span className="tg-mascot-note-mark"><Sparkles size={13} /></span>
        <span>{line}</span>
      </div>
      <button className="tg-mascot-button" type="button" onClick={wave} aria-label="Wave to your TrustGuard safety mascot">
        <span className="tg-mascot-halo" />
        <img src="/trustguard-mascot.png" alt="" className="tg-mascot-fallback" />
        <Suspense fallback={null}>
          <MascotView
            ref={mascot}
            src="/trustguard-mascot.riv"
            className="tg-mascot-canvas"
            style={{ width: "100%", height: "100%" }}
            autoBlink
          />
        </Suspense>
        <span className="tg-mascot-ping" aria-hidden="true" />
      </button>
      <span className="tg-mascot-label"><LockKeyhole size={11} /> your guard buddy</span>
    </aside>
  );
}

function SafeWorldIllustration() {
  return (
    <svg className="tg-world-art" viewBox="0 0 650 500" role="img" aria-labelledby="world-title world-desc">
      <title id="world-title">TrustGuard digital safety scene</title>
      <desc id="world-desc">A friendly digital safety illustration with a protected phone, verified money transfer, video call, and suspicious message markers.</desc>
      <defs>
        <linearGradient id="world-sky" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#9de6d7" />
          <stop offset=".58" stopColor="#c7f1c5" />
          <stop offset="1" stopColor="#f5f4bd" />
        </linearGradient>
        <linearGradient id="world-hill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#66c69c" />
          <stop offset="1" stopColor="#b5e587" />
        </linearGradient>
        <linearGradient id="world-screen" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#edf8ee" />
        </linearGradient>
        <filter id="world-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="15" stdDeviation="12" floodColor="#27574a" floodOpacity=".16" />
        </filter>
      </defs>
      <rect x="5" y="5" width="640" height="480" rx="46" fill="url(#world-sky)" />
      <path d="M5 351c80-63 134-31 207-16 78 17 125-47 209-39 73 7 131 54 224 22v167H5z" fill="#b4ebbd" />
      <path d="M5 401c80-34 136-14 207-6 105 11 132-42 227-28 83 12 115 39 206 2v116H5z" fill="url(#world-hill)" />
      <g className="world-cloud cloud-a" fill="#f8fff4" opacity=".9">
        <path d="M78 105c3-14 15-23 29-23 11 0 21 6 26 15 4-4 10-7 17-7 15 0 27 12 27 27H77c-11 0-19-7-19-16s8-16 20-16" />
      </g>
      <g className="world-cloud cloud-b" fill="#f8fff4" opacity=".78">
        <path d="M484 125c3-12 13-20 26-20 10 0 18 5 22 13 4-4 9-6 15-6 13 0 23 10 23 23h-88c-9 0-16-6-16-14 0-7 7-13 18-13" />
      </g>
      <g className="world-signal-lines" fill="none" stroke="#fff" strokeWidth="2" opacity=".58">
        <path d="M60 258c41-47 76-49 111-9" strokeDasharray="4 8" />
        <path d="M494 315c21-43 59-57 96-36" strokeDasharray="4 8" />
      </g>

      <g className="world-browser" filter="url(#world-shadow)">
        <rect x="169" y="137" width="353" height="242" rx="23" fill="#243a39" />
        <rect x="180" y="148" width="331" height="215" rx="16" fill="url(#world-screen)" />
        <path d="M180 164q0-16 16-16h299q16 0 16 16v22H180z" fill="#f8fcf7" />
        <circle cx="197" cy="171" r="4" fill="#ff9589" />
        <circle cx="211" cy="171" r="4" fill="#f5c65d" />
        <circle cx="225" cy="171" r="4" fill="#80cf9e" />
        <rect x="247" y="165" width="143" height="12" rx="6" fill="#edf2ed" />
        <rect x="204" y="207" width="205" height="12" rx="6" fill="#dfeae1" />
        <rect x="204" y="229" width="111" height="8" rx="4" fill="#edf1ec" />
        <rect x="204" y="247" width="135" height="8" rx="4" fill="#edf1ec" />
        <g className="world-shield">
          <path d="M442 207l38 13v31c0 29-19 46-38 57-19-11-38-28-38-57v-31z" fill="#d6f1dc" />
          <path d="M442 218l28 10v22c0 20-13 33-28 42-15-9-28-22-28-42v-22z" fill="#438e68" />
          <path d="m430 248 8 8 16-18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <path d="M131 379h430l-39 35H170z" fill="#46615b" />
        <path d="M170 414h352l-10 8H179z" fill="#2d4741" />
        <rect x="298" y="386" width="96" height="6" rx="3" fill="#b8d6c5" />
      </g>

      <g className="world-phone" filter="url(#world-shadow)">
        <rect x="69" y="177" width="113" height="207" rx="24" fill="#26393c" />
        <rect x="76" y="188" width="99" height="184" rx="18" fill="#fcfff9" />
        <rect x="105" y="194" width="40" height="6" rx="3" fill="#dae5de" />
        <circle cx="125" cy="259" r="38" fill="#e4f5e8" />
        <circle cx="125" cy="250" r="16" fill="#f6c7a7" />
        <path d="M98 287c2-19 13-28 27-28s25 9 27 28" fill="#578e71" />
        <circle cx="153" cy="286" r="12" fill="#65bd86" stroke="#fff" strokeWidth="4" />
        <path d="m148 286 4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="92" y="316" width="66" height="7" rx="3.5" fill="#d9e5db" />
        <rect x="101" y="330" width="48" height="6" rx="3" fill="#e9eee8" />
        <circle cx="125" cy="359" r="3" fill="#bdcbbf" />
      </g>

      <g className="world-money-float" filter="url(#world-shadow)">
        <rect x="409" y="66" width="177" height="85" rx="22" fill="#fffefa" />
        <circle cx="444" cy="108" r="23" fill="#fff0cb" />
        <text x="444" y="116" textAnchor="middle" fill="#ae741d" fontSize="25" fontWeight="800">₹</text>
        <text x="478" y="101" fill="#536d60" fontSize="10" fontWeight="700">PAYMENT CHECK</text>
        <text x="478" y="121" fill="#244c39" fontSize="16" fontWeight="800">Verified first</text>
        <circle cx="571" cy="79" r="13" fill="#71c68d" />
        <path d="m566 79 4 4 7-8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g className="world-message-float" filter="url(#world-shadow)">
        <rect x="31" y="318" width="147" height="79" rx="18" fill="#fffdfa" />
        <circle cx="57" cy="345" r="13" fill="#ffe5d9" />
        <path d="M57 336v10m0 6v1" stroke="#e2774f" strokeWidth="2.5" strokeLinecap="round" />
        <text x="78" y="344" fill="#b15d43" fontSize="9" fontWeight="800">UNEXPECTED LINK</text>
        <rect x="78" y="353" width="72" height="6" rx="3" fill="#f3d9ce" />
        <rect x="78" y="365" width="51" height="6" rx="3" fill="#f3e7e0" />
        <circle cx="153" cy="376" r="10" fill="#e78a69" />
        <path d="M150 373l6 6m0-6-6 6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      </g>

      <g className="world-video-float" filter="url(#world-shadow)">
        <rect x="481" y="233" width="126" height="99" rx="19" fill="#fffefa" />
        <rect x="489" y="241" width="110" height="69" rx="13" fill="#d9ebe8" />
        <circle cx="543" cy="266" r="13" fill="#f2bd9b" />
        <path d="M519 296c2-14 11-21 24-21s22 7 24 21" fill="#627fb0" />
        <circle cx="584" cy="296" r="11" fill="#d8f5dd" />
        <path d="m580 296 3 3 6-7" fill="none" stroke="#4c9668" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="544" cy="321" r="3" fill="#a7bcb3" />
      </g>

      <g className="world-leaf leaf-left" fill="#3f9b70">
        <path d="M35 450c3-32 22-48 48-51-1 30-17 47-48 51" />
        <path d="M47 469c11-24 29-32 51-28-9 22-26 32-51 28" fill="#78bf72" />
        <path d="M39 476c15-19 28-36 39-56" fill="none" stroke="#337d5d" strokeWidth="3" />
      </g>
      <g className="world-leaf leaf-right" fill="#3e986f">
        <path d="M570 444c-3-32-22-48-48-51 1 30 17 47 48 51" />
        <path d="M558 463c-11-24-29-32-51-28 9 22 26 32 51 28" fill="#75bc72" />
        <path d="M566 470c-15-19-28-36-39-56" fill="none" stroke="#337d5d" strokeWidth="3" />
      </g>

      <g className="world-spark spark-left" fill="#fff">
        <path d="M216 72c4 14 8 18 22 22-14 4-18 8-22 22-4-14-8-18-22-22 14-4 18-8 22-22" />
      </g>
      <g className="world-spark spark-right" fill="#fef5c5">
        <path d="M601 178c3 10 6 13 16 16-10 3-13 6-16 16-3-10-6-13-16-16 10-3 13-6 16-16" />
      </g>
    </svg>
  );
}

function useRevealOnScroll(activePage) {
  useEffect(() => {
    if (activePage !== "home") return undefined;
    const items = document.querySelectorAll("[data-reveal]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -48px 0px" });

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [activePage]);
}

function tiltCard(event) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  card.style.setProperty("--tilt-x", `${(0.5 - y) * 4}deg`);
  card.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
  card.style.setProperty("--spot-x", `${x * 100}%`);
  card.style.setProperty("--spot-y", `${y * 100}%`);
}

function resetTilt(event) {
  event.currentTarget.style.setProperty("--tilt-x", "0deg");
  event.currentTarget.style.setProperty("--tilt-y", "0deg");
}

function App() {
  const [activePage, setActivePage] = useState("home");
  const [activeSignal, setActiveSignal] = useState("calls");
  useRevealOnScroll(activePage);

  const goHome = () => {
    setActivePage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (activePage === "liveguard") {
    return (
      <div className="tg-tool-shell">
        <Suspense fallback={<PageLoader />}><LiveGuardPage onBack={goHome} /></Suspense>
        <SafetyMascot />
      </div>
    );
  }

  if (activePage === "media") {
    return (
      <div className="tg-tool-shell">
        <Suspense fallback={<PageLoader />}><MediaAnalysisPage onBack={goHome} /></Suspense>
        <SafetyMascot />
      </div>
    );
  }

  const chooseSignal = (signal) => setActiveSignal(signal);

  return (
    <div className="tg-app">
      <header className="tg-header">
        <button className="tg-brand" type="button" onClick={goHome} aria-label="TrustGuard AI home">
          <span className="tg-brand-mark" aria-hidden="true"><ShieldCheck size={21} strokeWidth={2.4} /></span>
          <span className="tg-brand-copy"><strong>TRUSTGUARD AI</strong><small>PERSONAL SAFETY WORKSPACE</small></span>
        </button>

        <nav className="tg-nav" aria-label="Main navigation">
          <button className="tg-nav-item active" type="button" aria-current="page" onClick={goHome}>Overview</button>
          <button className="tg-nav-item" type="button" onClick={() => setActivePage("liveguard")}>Live Guard</button>
          <button className="tg-nav-item" type="button" onClick={() => setActivePage("media")}>Media Analysis</button>
          <a className="tg-nav-specialist" href="https://wa.me/919497964163" target="_blank" rel="noopener noreferrer">CyberWall <ArrowUpRight size={13} /></a>
        </nav>
        <span className="tg-header-status"><i /> Prototype workspace</span>
      </header>

      <main className="tg-main">
        <section className="tg-hero" onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
          event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
        }}>
          <div className="tg-hero-backdrop" aria-hidden="true" />
          <div className="tg-hero-copy" data-reveal>
            <p className="tg-eyebrow"><span /> MULTIMODAL RISK SIGNALS <span className="tg-eyebrow-separator">·</span> BUILT FOR REAL LIFE</p>
            <h1>Pause. Check.<br /><em>Then decide.</em></h1>
            <p className="tg-intro">One friendly place to check a call, a clip, or a message that does not feel quite right.</p>
            <p className="tg-note">TrustGuard highlights signals for review. It cannot prove that a caller, file, or request is genuine.</p>
            <div className="tg-hero-actions">
              <button className="tg-button-primary" type="button" onClick={() => setActivePage("media")}>
                Check a file <ArrowRight size={16} />
              </button>
              <a className="tg-button-quiet" href="#how-it-works">Explore how it works <ArrowDown size={14} /></a>
            </div>
            <div className="tg-hero-proof"><span><Check size={13} /> Calls</span><span><Check size={13} /> Images & video</span><span><Check size={13} /> Scam signals</span></div>
          </div>

          <div className="tg-hero-art-wrap" data-reveal data-reveal-delay="1">
            <div className="tg-art-caption"><span><i /> SAFETY, IN MOTION</span><span>01 / 03</span></div>
            <div className="tg-hero-art"><SafeWorldIllustration /></div>
            <div className="tg-art-footnote"><span className="tg-mini-shield"><Shield size={13} /></span> A second look can change everything <Sparkles size={13} /></div>
          </div>
          <a className="tg-scroll-cue" href="#check-signal" aria-label="Scroll down to choose a signal to check"><span /> SCROLL TO EXPLORE <ArrowDown size={13} /></a>
        </section>

        <div className="tg-motion-ribbon" aria-label="TrustGuard checks calls, media, links, and payment requests">
          <div className="tg-ribbon-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <span className="tg-ribbon-group" key={copy}>
                <span><ScanFace /> LIVE CALLS</span><i>✳</i><span><FileVideo2 /> VIDEO & AUDIO</span><i>✳</i><span><WalletCards /> PAYMENT REQUESTS</span><i>✳</i><span><Globe2 /> LINKS & MESSAGES</span><i>✳</i><span><Fingerprint /> IDENTITY SIGNALS</span><i>✳</i>
              </span>
            ))}
          </div>
        </div>

        <section className="tg-tools-section tg-section-space" id="check-signal" aria-labelledby="tools-heading">
          <div className="tg-section-heading" data-reveal>
            <div><p className="tg-eyebrow">START WITH THE SIGNAL</p><h2 id="tools-heading">What would you like to check?</h2></div>
            <span className="tg-section-caption">Pick a path. We’ll walk you through it.</span>
          </div>

          <div className="tg-tool-grid">
            <button className="tg-tool-card live-card tg-tilt-card" type="button" onClick={() => setActivePage("liveguard")} onPointerMove={tiltCard} onPointerLeave={resetTilt} data-reveal>
              <span className="tg-tool-illustration live-illustration" aria-hidden="true"><span className="live-illustration-orbit" /><span className="live-illustration-screen"><Camera size={28} /><span className="live-face" /></span><span className="live-illustration-dot dot-one" /><span className="live-illustration-dot dot-two" /></span>
              <span className="tg-card-content"><span className="tg-card-kicker">LIVE CALL · PHONE TO LAPTOP</span><strong>Live Guard</strong><span className="tg-card-description">Review face, liveness, replay, and audio cues from a connected caller.</span><span className="tg-card-link">Connect a caller <b>→</b></span></span>
              <span className="tg-card-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
            </button>

            <button className="tg-tool-card media-card tg-tilt-card" type="button" onClick={() => setActivePage("media")} onPointerMove={tiltCard} onPointerLeave={resetTilt} data-reveal data-reveal-delay="1">
              <span className="tg-tool-illustration media-illustration" aria-hidden="true"><span className="media-file file-front"><ImageIcon size={22} /><span /></span><span className="media-file file-back"><AudioLines size={23} /></span><span className="media-scan-line" /></span>
              <span className="tg-card-content"><span className="tg-card-kicker">IMAGE · AUDIO · VIDEO</span><strong>Media Analysis</strong><span className="tg-card-description">Look for media-integrity clues and signs that deserve a closer review.</span><span className="tg-card-link">Choose a file <b>→</b></span></span>
              <span className="tg-card-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
            </button>
          </div>
        </section>

        <section className="tg-signal-lab tg-section-space" aria-labelledby="signals-heading">
          <div className="tg-signal-copy" data-reveal>
            <p className="tg-eyebrow">SMALL CLUES, MORE CONTEXT</p>
            <h2 id="signals-heading">A signal is a starting point.<br /><em>Not the whole story.</em></h2>
            <p>Choose an area to see what TrustGuard’s prototype can surface. The checks are heuristic and may miss sophisticated fraud.</p>
            <div className="tg-signal-tabs" role="tablist" aria-label="Types of signals">
              <button role="tab" aria-selected={activeSignal === "calls"} className={activeSignal === "calls" ? "is-active" : ""} onClick={() => chooseSignal("calls")} type="button"><ScanFace size={16} /> Calls</button>
              <button role="tab" aria-selected={activeSignal === "media"} className={activeSignal === "media" ? "is-active" : ""} onClick={() => chooseSignal("media")} type="button"><ImageIcon size={16} /> Media</button>
              <button role="tab" aria-selected={activeSignal === "money"} className={activeSignal === "money" ? "is-active" : ""} onClick={() => chooseSignal("money")} type="button"><Banknote size={16} /> Money</button>
              <button role="tab" aria-selected={activeSignal === "links"} className={activeSignal === "links" ? "is-active" : ""} onClick={() => chooseSignal("links")} type="button"><Globe2 size={16} /> Links</button>
            </div>
          </div>
          <div className="tg-signal-panel tg-tilt-card" role="tabpanel" onPointerMove={tiltCard} onPointerLeave={resetTilt} data-reveal data-reveal-delay="1">
            <div className={`tg-signal-picture signal-${activeSignal}`} aria-hidden="true">
              {activeSignal === "calls" && <><span className="signal-orbit" /><span className="signal-phone"><ScanFace size={40} /><i /><i /></span><span className="signal-check"><BadgeCheck size={22} /></span></>}
              {activeSignal === "media" && <><span className="signal-media-card"><FileVideo2 size={34} /><span /><span /></span><span className="signal-sparkle"><Sparkles size={21} /></span><span className="signal-play">▶</span></>}
              {activeSignal === "money" && <><span className="signal-coin coin-one">₹</span><span className="signal-coin coin-two">₹</span><span className="signal-lock"><LockKeyhole size={27} /></span><span className="signal-alert"><MessageCircleWarning size={20} /></span></>}
              {activeSignal === "links" && <><span className="signal-link-window"><Globe2 size={30} /><span>https://...</span><span>CHECK BEFORE OPENING</span></span><span className="signal-shield"><ShieldAlert size={26} /></span><span className="signal-cursor">↖</span></>}
            </div>
            <div className="tg-signal-detail">
              <span className="tg-live-indicator"><i /> SIGNAL GUIDE</span>
              {activeSignal === "calls" && <><h3>Calls & live video</h3><p>Face presence, a simple movement challenge, replay cues, and browser audio features can help highlight moments for review.</p><button type="button" onClick={() => setActivePage("liveguard")}>Open Live Guard <ChevronRight size={15} /></button></>}
              {activeSignal === "media" && <><h3>Images, audio & video</h3><p>Metadata, visual patterns, movement, and acoustic properties are clues. They are not a forensic verdict or trained deepfake result.</p><button type="button" onClick={() => setActivePage("media")}>Open Media Analysis <ChevronRight size={15} /></button></>}
              {activeSignal === "money" && <><h3>Payment requests</h3><p>Slow down when a request creates urgency, changes bank details, or asks you to keep a transfer secret. Verify using a known contact method.</p><a href="https://wa.me/919497964163" target="_blank" rel="noopener noreferrer">Check with CyberWall <ChevronRight size={15} /></a></>}
              {activeSignal === "links" && <><h3>Links & messages</h3><p>Unexpected links, APKs, emails, and SMS can hide a scam. Open CyberWall to check these items with its service.</p><a href="https://wa.me/919497964163" target="_blank" rel="noopener noreferrer">Open CyberWall <ChevronRight size={15} /></a></>}
            </div>
          </div>
        </section>

        <section className="tg-how-section tg-section-space" id="how-it-works" aria-labelledby="how-heading">
          <div className="tg-section-heading" data-reveal>
            <div><p className="tg-eyebrow">A SIMPLE SAFER ROUTINE</p><h2 id="how-heading">Pause, inspect, then choose.</h2></div>
            <span className="tg-section-caption">Three small steps can protect a big moment.</span>
          </div>
          <div className="tg-flow-line" aria-hidden="true"><span /></div>
          <div className="tg-flow-grid">
            <article className="tg-flow-card" data-reveal><span className="tg-flow-number">01</span><span className="tg-flow-icon flow-capture"><Camera size={21} /></span><h3>Bring the signal</h3><p>Connect a call, choose a media file, or open the specialist service that fits.</p><span className="tg-flow-tag">CALL · FILE · MESSAGE</span></article>
            <article className="tg-flow-card" data-reveal data-reveal-delay="1"><span className="tg-flow-number">02</span><span className="tg-flow-icon flow-scan"><Sparkles size={21} /></span><h3>Look at the clues</h3><p>Review the prototype’s indicators and the reason each one was raised.</p><span className="tg-flow-tag">SIGNALS, WITH CONTEXT</span></article>
            <article className="tg-flow-card" data-reveal data-reveal-delay="2"><span className="tg-flow-number">03</span><span className="tg-flow-icon flow-decide"><ShieldCheck size={21} /></span><h3>Verify independently</h3><p>Check through a separate channel before sharing money, codes, or personal details.</p><span className="tg-flow-tag">YOU MAKE THE CALL</span></article>
          </div>
        </section>

        <section className="tg-risk-scale tg-section-space" data-reveal aria-label="How to interpret prototype risk scores">
          <div className="tg-risk-copy"><span className="tg-risk-icon"><CircleHelp size={20} /></span><div><p className="tg-eyebrow">READ THE SCORE RESPONSIBLY</p><h2>Risk indicators are not proof.</h2><p>Use the score to decide what to double-check—not whether to trust someone automatically.</p></div></div>
          <div className="tg-risk-levels">
            <div className="risk-level low"><span>0–29</span><strong>Lower signal</strong><small>Continue with normal care</small></div>
            <div className="risk-level review"><span>30–49</span><strong>Needs a closer look</strong><small>Verify before acting</small></div>
            <div className="risk-level high"><span>50–100</span><strong>High signal</strong><small>Pause and verify another way</small></div>
          </div>
        </section>

        <section className="tg-specialists tg-section-space" aria-labelledby="specialist-heading">
          <div className="tg-section-heading" data-reveal>
            <div><p className="tg-eyebrow">WHEN YOU WANT ANOTHER CHECK</p><h2 id="specialist-heading">Meet your specialist helpers.</h2></div>
            <span className="tg-section-caption">These open external WhatsApp services.</span>
          </div>
          <div className="tg-specialist-grid">
            <article className="tg-specialist-card specialist-news" data-reveal>
              <div className="tg-specialist-art" aria-hidden="true"><span className="news-paper"><span /><span /><span /><span /></span><span className="news-magnifier"><ImageIcon size={19} /></span><span className="news-star">✳</span></div>
              <div className="tg-specialist-body"><span className="tg-card-kicker">NEWS · CLAIMS · ARTICLES</span><h3>SathyaScan</h3><p>Send a news story or article for a fake-news check.</p><a href="https://wa.me/919074871768" target="_blank" rel="noopener noreferrer">Open SathyaScan <ArrowUpRight size={15} /></a></div>
            </article>
            <article className="tg-specialist-card specialist-cyber" data-reveal data-reveal-delay="1">
              <div className="tg-specialist-art" aria-hidden="true"><span className="cyber-window"><span className="cyber-window-top" /><span className="cyber-brackets">&lt;/&gt;</span><span className="cyber-terminal-line" /><span className="cyber-terminal-line short" /></span><span className="cyber-lock"><LockKeyhole size={19} /></span><span className="cyber-star">✳</span></div>
              <div className="tg-specialist-body"><span className="tg-card-kicker">APK · BANK · URL · EMAIL · SMS</span><h3>CyberWall</h3><p>Check APKs, bank details, links, emails, messages, IPs, or phone numbers.</p><a href="https://wa.me/919497964163" target="_blank" rel="noopener noreferrer">Open CyberWall <ArrowUpRight size={15} /></a></div>
            </article>
          </div>
        </section>

        <section className="tg-final-note" data-reveal>
          <div className="tg-final-icon"><ShieldCheck size={25} /></div>
          <div><p className="tg-eyebrow">TAKE YOUR TIME. TRUST YOUR CHECKS.</p><h2>Before you click, pay, or share—take one more look.</h2></div>
          <button type="button" onClick={() => setActivePage("media")}>Start a check <ArrowRight size={16} /></button>
          <div className="tg-final-spark" aria-hidden="true">✳</div>
        </section>

        <footer className="tg-footer">
          <span><span className="tg-footer-dot" /> TRUST STARTS WITH VERIFICATION</span>
          <span>TrustGuard AI · Prototype <i /> Risk signals, not a final verdict</span>
        </footer>
      </main>
      <SafetyMascot />
    </div>
  );
}

export default App;
