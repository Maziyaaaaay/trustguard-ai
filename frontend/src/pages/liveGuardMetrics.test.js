import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrustGuardRisk,
  getRiskLevel,
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

test("a failed liveness challenge produces a high-risk warning above 50", () => {
  const result = calculateTrustGuardRisk({
    replayRisk: 0,
    livenessRisk: 100,
    livenessCompleted: true,
    livenessFailed: true,
    faceConsistencyRisk: 0,
    voiceRisk: null,
    facePresenceRisk: 0,
  });

  assert.equal(result.level, "HIGH");
  assert.ok(result.score > 50);
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

test("repeated full-frame disruptions produce a strong visual risk signal", () => {
  const result = scoreTemporalSignals(
    Array(12).fill(18),
    Array(12).fill(false),
    [false, false, true, false, true, false, false, false]
  );

  assert.ok(result.score >= 65);
  assert.equal(result.disruptionCount, 2);
});
