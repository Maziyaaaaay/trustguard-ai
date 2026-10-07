"""CPU ONNX inference for the AASIST audio anti-spoofing model."""

from functools import lru_cache
import hashlib
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16_000
WINDOW_SAMPLES = 64_600
MODEL_PATH = Path(__file__).parent / "models" / "aasist.onnx"
MODEL_SHA256 = "130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1"


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if digest != MODEL_SHA256:
        raise RuntimeError("The bundled AASIST model failed its integrity check.")
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return ort.InferenceSession(
        str(MODEL_PATH), options, providers=["CPUExecutionProvider"]
    )


def classify_audio(samples: np.ndarray, sample_rate: int) -> dict:
    """Return a review signal; class 0 is spoof, class 1 is bona fide.

    The published model uses the first 64,600 samples at 16 kHz. Short clips
    are tiled to match the official evaluation preprocessing. Scores are raw
    softmax outputs, not calibrated probabilities or proof of authenticity.
    """
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    if sample_rate != SAMPLE_RATE:
        return {
            "available": False,
            "status": "unavailable",
            "error": "AASIST input must be normalized to 16 kHz mono.",
        }
    if values.size < WINDOW_SAMPLES or not np.all(np.isfinite(values)):
        return {
            "available": True,
            "status": "inconclusive",
            "spoof_score": None,
            "reason": "At least 4.04 seconds of decodable audio is needed for AASIST analysis.",
        }
    if float(np.sqrt(np.mean(np.square(values)))) < 0.003:
        return {
            "available": True,
            "status": "inconclusive",
            "spoof_score": None,
            "reason": "The audio level is too low for a useful anti-spoofing signal.",
        }

    model = _session()
    max_samples = 30 * SAMPLE_RATE
    values = values[:max_samples]
    max_start = values.size - WINDOW_SAMPLES
    window_count = min(14, max(1, int(np.ceil(max_start / (2 * SAMPLE_RATE))) + 1))
    starts = np.linspace(0, max_start, num=window_count, dtype=np.int64)
    window_scores = []
    input_name = model.get_inputs()[0].name
    for start in starts:
        window = np.ascontiguousarray(
            values[start:start + WINDOW_SAMPLES][None, :], dtype=np.float32
        )
        logits = np.asarray(model.run(None, {input_name: window})[0], dtype=np.float32)
        if logits.shape != (1, 2) or not np.all(np.isfinite(logits)):
            raise ValueError("AASIST returned an invalid score.")
        shifted = logits[0] - np.max(logits[0])
        scores = np.exp(shifted)
        scores /= np.sum(scores)
        window_scores.append(float(scores[0] * 100.0))
    spoof_score = float(np.mean(window_scores))
    score_spread = float(np.std(window_scores))
    status = (
        "high_spoof_signal" if spoof_score > 50 else
        "review_spoof_signal" if spoof_score >= 30 else
        "low_spoof_signal"
    )
    return {
        "available": True,
        "status": status,
        "spoof_score": round(spoof_score, 1),
        "bona_fide_score": round(100.0 - spoof_score, 1),
        "window_score_spread": round(score_spread, 1),
        "windows_analyzed": window_count,
        "model": "AASIST",
        "model_revision": "16774d458d86d2a021ae31646c1bf66a5331b53e",
        "window_seconds": round(WINDOW_SAMPLES / SAMPLE_RATE, 2),
        "limitations": (
            "Experimental anti-spoofing signal trained on ASVspoof 2019. "
            "Published cross-dataset results vary substantially; scores are not "
            "calibrated probabilities and do not prove a voice is real or synthetic."
        ),
    }
