const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

export function getFrameFingerprint(pixels, width = 160, height = 90) {
  const columns = 12;
  const rows = 8;
  const fingerprint = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = Math.floor((column * width) / columns);
      const right = Math.floor(((column + 1) * width) / columns);
      const top = Math.floor((row * height) / rows);
      const bottom = Math.floor(((row + 1) * height) / rows);
      let luminanceTotal = 0;
      let samples = 0;

      for (let y = top; y < bottom; y += 2) {
        for (let x = left; x < right; x += 2) {
          const offset = (y * width + x) * 4;
          luminanceTotal +=
            pixels[offset] * 0.299 +
            pixels[offset + 1] * 0.587 +
            pixels[offset + 2] * 0.114;
          samples += 1;
        }
      }

      fingerprint.push(
        Math.round(luminanceTotal / Math.max(samples, 1) / 16)
      );
    }
  }

  return fingerprint;
}

export function fingerprintDistance(left, right) {
  if (!left || !right || left.length !== right.length || !left.length) {
    return 1;
  }

  const changedCells = left.reduce(
    (total, value, index) =>
      total + (Math.abs(value - right[index]) > 1 ? 1 : 0),
    0
  );

  return changedCells / left.length;
}

export function scoreTemporalSignals(
  frameDifferences,
  repeatedFrames,
  disruptions
) {
  if (!frameDifferences.length) {
    return { score: 0, freshness: 100, repeatRatio: 0, disruptionCount: 0 };
  }

  const frozenRatio =
    frameDifferences.filter((value) => value < 2.2).length /
    frameDifferences.length;
  const freshness = Math.round(clamp(100 - frozenRatio * 100));
  let score = 0;

  if (frameDifferences.length >= 10 && frozenRatio > 0.75) {
    score += 65;
  } else if (frameDifferences.length >= 8 && frozenRatio > 0.55) {
    score += 35;
  }

  const meanDifference =
    frameDifferences.reduce((sum, value) => sum + value, 0) /
    frameDifferences.length;
  if (frameDifferences.length >= 10 && meanDifference < 1.5) {
    score += 25;
  }

  const repeatWindow = repeatedFrames.slice(-16);
  const repeatRatio =
    repeatWindow.filter(Boolean).length / Math.max(repeatWindow.length, 1);
  if (repeatWindow.length >= 12 && repeatRatio >= 0.6) {
    score = Math.max(score, 78);
  } else if (repeatWindow.length >= 10 && repeatRatio >= 0.4) {
    score = Math.max(score, 52);
  }

  const disruptionWindow = disruptions.slice(-16);
  const disruptionCount = disruptionWindow.filter(Boolean).length;
  if (disruptionWindow.length >= 8 && disruptionCount >= 3) {
    score = Math.max(score, 78);
  } else if (disruptionWindow.length >= 8 && disruptionCount >= 2) {
    score = Math.max(score, 65);
  }

  return {
    score: Math.round(clamp(score)),
    freshness,
    repeatRatio,
    disruptionCount,
  };
}

export function getRiskLevel(score) {
  if (score > 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function calculateTrustGuardRisk({
  replayRisk = null,
  livenessRisk = null,
  livenessCompleted = false,
  livenessFailed = false,
  faceConsistencyRisk = null,
  voiceRisk = null,
  facePresenceRisk = null,
}) {
  const candidates = [
    { name: "Replay / temporal anomaly", value: replayRisk, weight: 0.30 },
    {
      name: "Liveness challenge",
      value: livenessCompleted ? livenessRisk : null,
      weight: 0.45,
    },
    { name: "Face consistency", value: faceConsistencyRisk, weight: 0.15 },
    { name: "Voice acoustic anomaly", value: voiceRisk, weight: 0.07 },
    { name: "Face presence", value: facePresenceRisk, weight: 0.03 },
  ];

  const signals = candidates
    .filter(
      ({ value }) =>
        typeof value === "number" && Number.isFinite(value)
    )
    .map((signal) => ({ ...signal, value: clamp(signal.value) }));

  if (!signals.length) {
    return {
      score: null,
      level: "ANALYZING",
      reasons: ["Waiting for enough analysis signals"],
    };
  }

  const totalWeight = signals.reduce(
    (sum, signal) => sum + signal.weight,
    0
  );
  const score = Math.round(
    signals.reduce(
      (sum, signal) => sum + signal.value * signal.weight,
      0
    ) / totalWeight
  );

  let adjustedScore = score;
  // Strong direct interaction or temporal anomalies must cross the project's
  // >50 HIGH threshold. This warns of risk; it does not prove deepfake content.
  if (livenessFailed) adjustedScore = Math.max(adjustedScore, 55);
  if (typeof replayRisk === "number" && replayRisk >= 65) {
    adjustedScore = Math.max(adjustedScore, 55);
  }

  const highSignals = signals.filter((signal) => signal.value >= 70);
  const reasons = highSignals.map((signal) => signal.name);
  if (typeof replayRisk === "number" && replayRisk >= 55) {
    reasons.push(
      "Strong replay, repeated-frame, or frame-disruption cues need review"
    );
  }
  if (livenessFailed) {
    reasons.push("Liveness challenge failed; retry or verify manually");
  }
  if (!reasons.length) {
    reasons.push("No immediate high-risk signal detected");
  }

  return {
    score: clamp(adjustedScore),
    level: getRiskLevel(adjustedScore),
    reasons: [...new Set(reasons)],
  };
}
