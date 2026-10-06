import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMediaFile } from "../services/api.js";
import "./MediaAnalysis.css";

const ACCEPTED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png",
  "mp4", "mov", "webm",
  "wav", "mp3", "m4a",
]);
const MAX_UPLOAD_BYTES = import.meta.env.PROD
  ? 4 * 1024 * 1024
  : 50 * 1024 * 1024;
const MAX_UPLOAD_LABEL = import.meta.env.PROD ? "4 MB" : "50 MB";

const SIGNAL_LABELS = {
  synthetic_voice: "Acoustic anomaly (not a voice-clone detector)",
  face_manipulation: "Face-track instability",
  media_manipulation: "Frame and media anomalies",
  identity_consistency: "Face consistency indicator",
  replay_risk: "Replay / repeated-frame indicator",
  liveness: "Liveness indicator",
  ai_synthetic_indicator: "Combined heuristic anomaly indicator",
  metadata_risk: "Metadata indicator",
  image_integrity: "Image integrity indicator",
};

function fileKind(file) {
  if (!file) return "unknown";
  const mime = file.type || "";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png"].includes(extension)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(extension)) return "video";
  if (mime.startsWith("audio/") || ["wav", "mp3", "m4a"].includes(extension)) return "audio";
  return "unknown";
}

function riskLevel(score) {
  if (score > 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "File size unavailable";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyLabel(key) {
  return SIGNAL_LABELS[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map((finding) => {
    if (typeof finding === "string") return finding;
    return finding?.message || finding?.detail || finding?.label || JSON.stringify(finding);
  });
}

function FilePreview({ file, url, kind }) {
  if (!file || !url) return null;
  if (kind === "image") {
    return <img className="ma-preview-image" src={url} alt={`Preview of ${file.name}`} />;
  }
  if (kind === "video") {
    return <video className="ma-preview-video" src={url} controls playsInline />;
  }
  if (kind === "audio") {
    return <audio className="ma-preview-audio" src={url} controls />;
  }
  return null;
}

export default function MediaAnalysisPage({ onBack }) {
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const kind = useMemo(() => fileKind(file), [file]);
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const chooseFile = (candidate) => {
    if (!candidate) return;
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError(`Files must be ${MAX_UPLOAD_LABEL} or smaller. Choose a shorter or smaller media file.`);
      return;
    }
    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      setError("Unsupported file. Choose JPG, PNG, MP4, MOV, WebM, WAV, MP3, or M4A.");
      return;
    }
    setFile(candidate);
    setResult(null);
    setError("");
  };

  const clearFile = () => {
    abortRef.current?.abort();
    setBusy(false);
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const runAnalysis = async () => {
    if (!file || busy) return;
    abortRef.current = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await analyzeMediaFile(file, { signal: abortRef.current.signal });
      setResult(data);
    } catch (analysisError) {
      if (analysisError.name !== "AbortError") setError(analysisError.message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const scoreValue = Number(result?.risk?.score ?? result?.risk_score ?? 0);
  const score = Math.max(0, Math.min(100, Math.round(Number.isFinite(scoreValue) ? scoreValue : 0)));
  const level = riskLevel(score);
  const signals = Object.entries(result?.signals || {}).filter(
    ([, value]) => typeof value === "number" && Number.isFinite(value)
  );
  const findings = normalizeFindings(result?.findings);
  const accept = ".jpg,.jpeg,.png,.mp4,.mov,.webm,.wav,.mp3,.m4a";

  return (
    <main className="media-page">
      <header className="ma-header">
        <div className="ma-header-left">
          {onBack && (
            <button className="ma-back-button" type="button" onClick={onBack}>
              <span aria-hidden="true">←</span> Back to Home
            </button>
          )}
          <div>
            <p className="ma-brand">TRUSTGUARD AI <span>／ MEDIA LAB</span></p>
            <h1>Media Analysis</h1>
            <p className="ma-subtitle">Inspect an image, audio clip, or video for signals that may need review.</p>
          </div>
        </div>
        <span className="ma-api-badge"><i /> TrustGuard analysis</span>
      </header>

      <section className="ma-layout">
        <div className="ma-panel ma-upload-panel">
          <div className="ma-panel-heading">
            <div>
              <p className="ma-kicker">STEP 1</p>
              <h2>Select a media file</h2>
            </div>
            <span className="ma-step-number">01</span>
          </div>

          <input
            ref={inputRef}
            className="ma-hidden-input"
            type="file"
            accept={accept}
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          {!file ? (
            <div
              className={`ma-dropzone${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files?.[0]);
              }}
            >
              <div className="ma-upload-icon" aria-hidden="true">↑</div>
              <strong>Drop a file here</strong>
              <span>or choose one from your device</span>
              <button className="ma-secondary-button" type="button" onClick={() => inputRef.current?.click()}>
                Browse files
              </button>
              <small>JPG · PNG · MP4 · MOV · WebM · WAV · MP3 · M4A</small>
            </div>
          ) : (
            <div className="ma-selected-file">
              <div className="ma-file-row">
                <div className="ma-file-type" aria-hidden="true">{kind === "image" ? "▧" : kind === "video" ? "▷" : "♫"}</div>
                <div className="ma-file-info">
                  <strong title={file.name}>{file.name}</strong>
                  <span>{kind.toUpperCase()} · {formatBytes(file.size)}</span>
                </div>
                <button className="ma-remove-button" type="button" onClick={clearFile} aria-label="Remove selected file">×</button>
              </div>
              <div className="ma-preview-box">
                <FilePreview file={file} url={previewUrl} kind={kind} />
              </div>
              <div className="ma-actions">
                <button className="ma-primary-button" type="button" onClick={runAnalysis} disabled={busy}>
                  {busy ? <><span className="ma-spinner" /> Analyzing…</> : <>Analyze file <span>→</span></>}
                </button>
                <button className="ma-text-button" type="button" onClick={clearFile} disabled={busy}>Choose another</button>
              </div>
            </div>
          )}
          <p className="ma-private-note"><span>⌑</span> Analysis runs through your TrustGuard backend; no third-party API credentials are needed.</p>
        </div>

        <div className="ma-panel ma-result-panel" aria-live="polite">
          <div className="ma-panel-heading">
            <div>
              <p className="ma-kicker">STEP 2</p>
              <h2>Analysis result</h2>
            </div>
            <span className="ma-step-number">02</span>
          </div>

          {busy ? (
            <div className="ma-empty-state">
              <span className="ma-large-spinner" />
              <strong>Inspecting the file</strong>
              <p>The backend is extracting available media signals. This may take a moment.</p>
            </div>
          ) : error ? (
            <div className="ma-error-state" role="alert">
              <span className="ma-state-icon">!</span>
              <strong>Analysis could not finish</strong>
              <p>{error}</p>
              <button className="ma-secondary-button" type="button" onClick={runAnalysis} disabled={!file}>Try again</button>
            </div>
          ) : result ? (
            <div className="ma-result-content">
              <div className={`ma-score-card ${level.toLowerCase()}`}>
                <div className="ma-score-ring" style={{ "--score": `${score}%` }}>
                  <span>{score}<small>/100</small></span>
                </div>
                <div className="ma-score-copy">
                  <span className="ma-kicker">{result.media_type || kind.toUpperCase()} RISK INDICATOR</span>
                  <strong>{level} {level === "HIGH" ? "RISK" : level === "MEDIUM" ? "REVIEW" : "RISK"}</strong>
                  <p>{result.summary || "Review the signals below with the original file."}</p>
                </div>
              </div>

              {kind === "video" && result.video_forensics && (
                <section className="ma-video-checks" aria-label="Video analysis details">
                  <h3>Video checks performed</h3>
                  <div className="ma-video-check-grid">
                    <div><span>Duration</span><strong>{Number(result.video_forensics.duration_seconds || 0).toFixed(1)} sec</strong></div>
                    <div><span>Frames sampled</span><strong>{result.video_forensics.sampled_frames || 0}</strong></div>
                    <div><span>Near-identical frames</span><strong>{Number(result.video_forensics.duplicate_frame_ratio || 0).toFixed(1)}%</strong></div>
                    <div><span>Average frame change</span><strong>{Number(result.video_forensics.average_frame_motion || 0).toFixed(2)}</strong></div>
                    <div><span>Face detected in frames</span><strong>{Number(result.video_forensics.face_metrics?.face_presence || 0).toFixed(0)}%</strong></div>
                    <div><span>Audio analysis</span><strong>{result.video_forensics.audio?.success ? "Heuristic audio check" : "Unavailable"}</strong></div>
                  </div>
                  <p>These are explainable frame and signal heuristics. This prototype does not run a trained AI deepfake classifier.</p>
                </section>
              )}

              {signals.length > 0 && (
                <section className="ma-signals">
                  <h3>Signals</h3>
                  {signals.map(([name, rawValue]) => {
                    const value = Math.max(0, Math.min(100, Math.round(rawValue)));
                    return (
                      <div className="ma-signal" key={name}>
                        <div className="ma-signal-label"><span>{prettyLabel(name)}</span><strong>{value}/100</strong></div>
                        <div className="ma-signal-track"><span style={{ width: `${value}%` }} /></div>
                      </div>
                    );
                  })}
                </section>
              )}

              {findings.length > 0 && (
                <section className="ma-findings">
                  <h3>What the analysis found</h3>
                  <ul>{findings.map((finding, index) => <li key={`${index}-${finding}`}>{finding}</li>)}</ul>
                </section>
              )}

              {result.recommendation && (
                <div className="ma-recommendation"><span>Next step</span><p>{result.recommendation}</p></div>
              )}
              {result.analysis_note && <p className="ma-disclaimer">{result.analysis_note}</p>}
              <button className="ma-secondary-button ma-again-button" type="button" onClick={clearFile}>Analyze another file</button>
            </div>
          ) : (
            <div className="ma-empty-state">
              <span className="ma-empty-symbol" aria-hidden="true">⌕</span>
              <strong>Your results will appear here</strong>
              <p>Choose a supported file, preview it, then select <b>Analyze file</b>.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="ma-footer">
        <span>TRUSTGUARD AI <i /> MEDIA ANALYSIS</span>
        <span>Scores are heuristic indicators, not proof that media is authentic or manipulated.</span>
      </footer>
    </main>
  );
}
