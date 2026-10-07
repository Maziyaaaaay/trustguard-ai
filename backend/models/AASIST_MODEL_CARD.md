# AASIST anti-spoofing model

- Source implementation: https://github.com/clovaai/aasist (MIT, NAVER Corp.)
- ONNX artifact: https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST
- Pinned model revision: `16774d458d86d2a021ae31646c1bf66a5331b53e`
- SHA-256: `130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1`
- Artifact size: 1,615,195 bytes
- Input: normalized mono float32 waveform at 16 kHz; first 64,600 samples per window
- Output convention: class 0 spoof, class 1 bona fide
- Runtime: ONNX Runtime CPU, locally bundled; no inference API or runtime model download

TrustGuard samples up to 30 seconds using up to 14 evenly spaced, overlapping
windows and averages their raw softmax spoof scores. The displayed 0–100 score
is not a calibrated probability. Audio shorter than 4.04 seconds, quiet audio,
or unavailable inference receives an inconclusive result. The result is a review
signal; it does not prove synthetic speech, identity, fraud, or authenticity.

The upstream benchmark card reports EER 0.83% on ASVspoof 2019 LA, 12.35% on
ASVspoof 2021 LA, 17.04% on ASVspoof 2021 DF, and 43.01% on InTheWild. Results
vary substantially across datasets, so these published metrics are not a
performance guarantee for TrustGuard or for current speech generators.
