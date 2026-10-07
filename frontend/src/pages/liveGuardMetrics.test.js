import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrustGuardRisk,
  hasOrderedLoop,
  getRiskLevel,
  latchReplayLoopEvidence,
  scoreTemporalSignals,
} from "./liveGuardMetrics.js";

test("a responsive live stream stays below the high-risk threshold after liveness passes", () => {
  const result = calculateTrustGuardRisk({
    replayRisk: 0,
    livenessRisk: 5,
    livenessCompleted: true,
    faceConsistencyRisk: 8,
    voiceRisk: null,
    facePresenceRisk: 0,
  });

  assert.equal(result.level, "LOW");
  assert.ok(result.score < 30);
});

test("a missed challenge requests review rather than a high fraud warning", () => {
  const result = calculateTrustGuardRisk({
    replayRisk: 0,
    livenessRisk: 100,
    livenessCompleted: true,
    livenessFailed: true,
    faceConsistencyRisk: 0,
    voiceRisk: null,
    facePresenceRisk: 0,
  });

  assert.equal(result.level, "MEDIUM");
  assert.ok(result.score >= 30 && result.score <= 50);
});

test("two missed independent prompts raise a high live-response warning", () => {
  const result = calculateTrustGuardRisk({
    replayRisk: 0,
    livenessRisk: 100,
    livenessCompleted: true,
    livenessFailed: true,
    livenessFailureCount: 2,
    faceConsistencyRisk: 0,
    facePresenceRisk: 0,
  });

  assert.equal(result.level, "HIGH");
  assert.ok(result.score > 50);
  assert.ok(result.reasons.some((reason) => reason.includes("Two independent movement prompts")));
});

test("strong replay evidence crosses the high-risk threshold even if liveness passes", () => {
  const result = calculateTrustGuardRisk({
    replayRisk: 78,
    livenessRisk: 5,
    livenessCompleted: true,
    faceConsistencyRisk: 5,
    voiceRisk: null,
    facePresenceRisk: 0,
  });

  assert.equal(result.level, "HIGH");
  assert.ok(result.score > 50);
  assert.ok(result.reasons.some((reason) => reason.includes("repeated-frame")));
});

test("the configured 30 and 50 boundaries remain medium and high", () => {
  assert.equal(getRiskLevel(29), "LOW");
  assert.equal(getRiskLevel(30), "MEDIUM");
  assert.equal(getRiskLevel(50), "MEDIUM");
  assert.equal(getRiskLevel(51), "HIGH");
});

test("ordinary changing frames with no repeated frames or disruptions stay low", () => {
  const result = scoreTemporalSignals(
    Array(20).fill(18),
    Array(16).fill(false),
    Array(16).fill(false)
  );

  assert.equal(result.score, 0);
  assert.equal(result.freshness, 100);
});

test("frozen and repeated-loop frames produce strong temporal risk", () => {
  const frozen = scoreTemporalSignals(
    Array(12).fill(0),
    Array(12).fill(true),
    Array(12).fill(false)
  );
  const loop = scoreTemporalSignals(
    Array(20).fill(12),
    Array(12).fill(true),
    Array(12).fill(false)
  );

  assert.ok(frozen.score >= 70);
  assert.ok(loop.score >= 70);
});

test("two abrupt disruptions request review without proving replay", () => {
  const result = scoreTemporalSignals(
    Array(12).fill(18),
    Array(12).fill(false),
    [false, false, true, false, true, false, false, false]
  );

  assert.ok(result.score >= 30 && result.score <= 50);
  assert.equal(result.disruptionCount, 2);
});


test("natural low-motion frames are not treated as frozen", () => {
  assert.equal(scoreTemporalSignals(Array(24).fill(0.9), Array(16).fill(false), Array(16).fill(false)).score, 0);
});
test("a stationary scene is not an ordered loop", () => {
  assert.equal(hasOrderedLoop(Array.from({ length: 40 }, (_, i) => ({ signature: Array(96).fill(30 + i % 2), sampledAt: i * 250 }))), false);
});
test("a changing sequence repeated in order is a loop", () => {
  assert.equal(hasOrderedLoop(Array.from({ length: 32 }, (_, i) => ({ signature: Array(96).fill((i % 8) * 4), sampledAt: i * 250 }))), true);
});
test("different changing sequences are not loops", () => {
  assert.equal(hasOrderedLoop(Array.from({ length: 40 }, (_, i) => ({ signature: Array(96).fill(i * 3), sampledAt: i * 250 }))), false);
});
test("sustained loop evidence flags high before a challenge completes", () => {
  const result = calculateTrustGuardRisk({ replayRisk: 78, livenessCompleted: false, faceConsistencyRisk: 0, facePresenceRisk: 0 });
  assert.equal(result.level, "HIGH");
  assert.ok(result.score > 50);
});

test("sustained ordered-loop matches alone raise replay risk above 50", () => {
  const loopSignals = scoreTemporalSignals(
    Array(20).fill(12),
    [...Array(6).fill(false), ...Array(6).fill(true)],
    Array(12).fill(false)
  );
  const fused = calculateTrustGuardRisk({
    replayRisk: loopSignals.score,
    livenessCompleted: false,
    faceConsistencyRisk: 0,
    facePresenceRisk: 0,
  });

  assert.ok(loopSignals.score >= 70);
  assert.equal(loopSignals.orderedLoopDetected, true);
  assert.ok(fused.score > 50);
  assert.equal(fused.level, "HIGH");
  assert.ok(fused.reasons.some((reason) => reason.includes("Strong replay")));
});

test("a detected playback loop stays high after the rolling window advances", () => {
  const loop = scoreTemporalSignals(
    Array(20).fill(12),
    [...Array(6).fill(false), ...Array(6).fill(true)],
    Array(12).fill(false)
  );
  const latched = latchReplayLoopEvidence(false, loop);
  const laterCleanWindow = scoreTemporalSignals(
    Array(20).fill(18),
    Array(16).fill(false),
    Array(16).fill(false)
  );
  const afterLoop = latchReplayLoopEvidence(
    latched.orderedLoopDetected,
    laterCleanWindow
  );
  const combined = calculateTrustGuardRisk({ replayRisk: afterLoop.score });

  assert.equal(latched.orderedLoopDetected, true);
  assert.equal(afterLoop.orderedLoopDetected, true);
  assert.equal(afterLoop.score, 78);
  assert.equal(combined.level, "HIGH");
  assert.ok(combined.score > 50);
});

test("ordered loops tolerate minor capture noise but stationary frames are not loops", () => {
  const repeated = Array.from({ length: 40 }, (_, i) => {
    const signature = Array(96).fill((i % 8) * 4);
    if (i % 8 === 3) signature[0] += 4;
    return { signature, sampledAt: i * 250 };
  });
  const stationary = Array.from({ length: 40 }, (_, i) => ({
    signature: Array(96).fill(40),
    sampledAt: i * 250,
  }));

  assert.equal(hasOrderedLoop(repeated), true);
  assert.equal(hasOrderedLoop(stationary), false);
});
