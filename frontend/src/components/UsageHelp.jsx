import { useEffect, useRef, useState } from "react";
import "./UsageHelp.css";

const topics = [
  ["Start a live check", "On your laptop, open Live Guard. On the caller’s phone, open the Caller page below. Both devices need internet. Use only a call you have permission to check.", /start|how|setup|live guard/],
  ["Camera permissions", "On the phone, allow camera and microphone access when prompted. If blocked, open the browser’s site permissions, allow both, and reload. Use the HTTPS caller link. Keep that tab in the foreground.", /camera|permission|microphone/],
  ["Connect the caller", "Copy the caller ID displayed on the phone. Paste it into Live Guard on the laptop and select Connect. Wait for the remote video to appear. Use the current ID if you reopened or refreshed the caller page.", /connect|caller|\bid\b/],
  ["Complete the challenge", "Keep your face visible in good light. Wait for the movement prompt, then turn your head in the requested direction. Follow the prompt on the caller screen. Wait for analysis to collect enough frames before reading the score.", /challenge|liveness|head|face/],
  ["Connection troubleshooting", "Check that the caller page is still open, camera access is allowed, and the ID is current. Reload the caller page and reconnect with its new ID. If video still fails, try a different network; restrictive networks can prevent the media connection.", /error|fail|offline|black|network|problem/],
  ["Understand results", "0–29 means fewer warning signals, 30–50 needs review, and above 50 is a high-risk warning. These are heuristic scores, not probabilities or proof of fraud. A low score does not establish a real person or genuine media. AI video classification is currently unavailable.", /score|risk|result|real|fake|ai|safe/],
  ["Analyze a file", "Open Media Analysis, choose an image, audio file, or video, and select Analyze file. The hosted site accepts files up to 4 MB. Review findings and unavailable checks. Images receive an experimental pretrained AI classification plus camera metadata evidence. Inconclusive results need review. Audio and video checks are still heuristics, not trained AI classification.", /upload|file|media|video/],
  ["WhatsApp checks", "SathyaScan opens an external WhatsApp service for news and article checks. CyberWall opens an external WhatsApp service for suspicious links, messages, APKs, and other cyber checks. TrustGuard does not perform those checks itself.", /whatsapp|sathya|news|cyberwall|apk|url/],
];

export function LiveGuardGuide() {
  return <details className="tg-use-guide">
    <summary>New to Live Guard? Follow the setup guide <span>↓</span></summary>
    <p>You need a laptop to review the call and a phone to provide the caller’s camera.</p>
    <ol>
      <li><strong>Open the caller page on the phone.</strong> <a href="/caller" target="_blank" rel="noopener noreferrer">Open Caller ↗</a> or visit <span className="tg-caller-address">https://trustguard-ai-one.vercel.app/caller</span>.</li>
      <li><strong>Allow camera and microphone.</strong> Keep the phone’s browser open and your face clearly visible.</li>
      <li><strong>Copy the caller ID.</strong> Send the ID shown on the phone to the person using the laptop.</li>
      <li><strong>Connect on the laptop.</strong> In Live Guard, paste the caller ID and select Connect. Wait for the video.</li>
      <li><strong>Follow the live challenge.</strong> Turn your head in the requested direction after the prompt appears. Allow time for the metrics to update.</li>
      <li><strong>Review the signals, then end the session.</strong> Read the reasons behind the warning. Use End Call on the laptop and Leave call on the phone when finished.</li>
    </ol>
    <p>Low risk does not prove authenticity. Failed checks may reflect poor lighting or connection quality. AI generation and fraud require additional evidence.</p>
  </details>;
}

export default function UsageHelp() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi! Choose a topic or ask a setup question. I answer from TrustGuard’s usage guide." }]);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const logRef = useRef(null);
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);
  useEffect(() => { if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, open]);
  const close = () => { setOpen(false); buttonRef.current?.focus(); };
  const answer = (text, topic) => {
    const match = topic || topics.find((entry) => entry[2].test(text.toLowerCase()));
    setMessages((previous) => [...previous, { role: "user", text }, { role: "assistant", text: match?.[1] || "I can help with setup, permissions, connecting, challenges, scores, file uploads, and WhatsApp checks. Choose a topic below. I cannot analyze your media or verify a caller." }].slice(-24));
    setQuery("");
  };
  return <>
    <button ref={buttonRef} className="tg-help-launch" aria-expanded={open} aria-controls="trustguard-help" onClick={() => open ? close() : setOpen(true)}> {open ? "Close help" : "Need help?"} </button>
    {open && <section id="trustguard-help" className="tg-help-panel" role="dialog" aria-label="TrustGuard usage assistant" tabIndex={-1} ref={panelRef} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <header><div><strong>TrustGuard guide</strong><small>Setup answers · No AI service or uploads</small></div><button onClick={close} aria-label="Close help">×</button></header>
      <div className="tg-help-log" role="log" aria-live="polite" ref={logRef}>{messages.map((message, index) => <p key={index} className={message.role}><strong>{message.role === "user" ? "You" : "Guide"}</strong>{message.text}</p>)}</div>
      <div className="tg-help-topics">{topics.map((topic) => <button key={topic[0]} onClick={() => answer(topic[0], topic)}>{topic[0]}</button>)}</div>
      <a className="tg-help-caller" href="/caller" target="_blank" rel="noopener noreferrer">Open phone Caller page ↗</a>
      <form onSubmit={(event) => { event.preventDefault(); if (query.trim()) answer(query.trim()); }}><label className="tg-help-label" htmlFor="tg-help-query">Ask a setup question</label><div><input id="tg-help-query" value={query} maxLength={400} onChange={(event) => setQuery(event.target.value)} placeholder="How do I connect?" /><button disabled={!query.trim()}>Send</button></div></form>
    </section>}
  </>;
}
