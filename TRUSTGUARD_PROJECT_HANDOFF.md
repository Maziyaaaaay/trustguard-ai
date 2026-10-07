# TrustGuard AI — Project History, Scope, and Technical Handoff

**Last updated:** 7 October 2026  
**Repository:** [swalihm744-blip/trustguard-ai](https://github.com/swalihm744-blip/trustguard-ai)  
**Working branch:** `new-trustguard-ui`  
**Production site:** [trustguard-ai-one.vercel.app](https://trustguard-ai-one.vercel.app)

## 1. What TrustGuard is

TrustGuard AI is a multimodal fraud-awareness and media-review web application. It brings together a live browser-to-browser call session, uploaded-media checks, document/identity and transaction review endpoints, and handoffs to specialist WhatsApp services.

The product should help a person pause, inspect signals, and verify through an independent channel. It must not represent a heuristic score or model output as proof that a person, call, image, recording, or video is real, fake, AI-generated, or fraudulent. Low risk means fewer signals were raised by the current checks; it is not proof of safety.

The agreed product direction is an MVP/prototype that demonstrates the intended flows honestly. The owner wants development to proceed phase by phase, prioritizing working functionality first. The interface should be approachable and polished; no unsupported detection claim should be introduced to make a demo appear stronger.

## 2. Agreed scope and product boundaries

### TrustGuard-built capabilities

- Live Guard: connect a caller browser to an analyst browser and display real-time browser-side signals.
- Media Analysis: upload image, audio, or video for backend analysis.
- Document analysis, identity review, and transaction review/fusion API routes exist in the backend. Their accuracy and end-to-end product readiness require separate validation before presenting them as reliable fraud decisions.
- Risk explanations and practical next steps should be shown with the measurements.
- A setup guide and in-product usage assistant help users understand Live Guard and media workflows. The usage assistant is scripted, not an autonomous fraud analyst.

### External services

TrustGuard only opens these WhatsApp handoffs; their specialist checks happen outside the TrustGuard application:

| Service | Intended use | WhatsApp destination |
| --- | --- | --- |
| SathyaScan | Fake-news, claim, or article checking | `+91 90748 71768` |
| CyberWall | APK, bank detail, URL, email, SMS, IP, phone, and related cyber-safety checks | `+91 94979 64163` |

No WhatsApp API integration or internal SathyaScan/CyberWall engine is claimed. No credentials for these external agents are needed by the TrustGuard backend.

### Explicit exclusions / choices

- Dessa was rejected by the owner and is not included.
- No external OpenAI, Gemini, Anthropic, or third-party inference API is required by the current AASIST and image-model paths.
- Live call analysis is browser-side signal processing; it is not an AI model running on the backend.
- No claim of perfect or universal AI-deepfake detection is supported by the current system.

## 3. Technology stack and deployment architecture

| Layer | Current implementation |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript, CSS |
| Live video landmarks | MediaPipe Tasks Vision in browser |
| WebRTC signaling / peer IDs | PeerJS / PeerJS cloud signaling configuration |
| Live audio/video transport | WebRTC between caller and analyst browsers |
| Backend API | Python, FastAPI, Uvicorn |
| Image/video operations | OpenCV, Pillow, NumPy |
| OCR | Tesseract via pytesseract where installed/available |
| PDF support | PyMuPDF |
| Media decoding | `imageio-ffmpeg` bundled for backend conversion/extraction |
| Image AI indication | Local ONNX image classifier, bundled with backend |
| Audio anti-spoofing | Local AASIST ONNX model, ONNX Runtime CPU |
| Hosting | Vercel frontend and Python backend services in one project, routed by `vercel.json` |
| Local phone demo | HTTPS tunnel (ngrok has been used) so mobile browser camera/microphone permissions work |

No persistent database is part of the documented current stack. Treat uploads as transient request inputs unless a separate implementation is added and verified. The production deployment is not an ngrok tunnel; the caller demo still needs an accessible HTTPS frontend and running services for local development. The current Vercel app contains `/caller` rewrite support.

### Repository map

- `frontend/src/App.jsx`: landing page and primary product navigation/content.
- `frontend/src/pages/LiveGuard.jsx`: Live Guard connection, stream analysis, scores, and signal details.
- `frontend/src/pages/MediaAnalysis.jsx`: upload flow and analysis results.
- `frontend/src/components/UsageHelp.jsx`: in-product help assistant.
- `frontend/src/services/api.js`: frontend-to-backend media API handling.
- `backend/main.py`: FastAPI app, media/document/identity/transaction routes, signal analysis, and response composition.
- `backend/audio_classifier.py`: AASIST audio inference and integrity guard.
- `backend/image_classifier.py`: local image model inference.
- `backend/models/`: bundled ONNX weights, provenance, and model cards/licenses.
- `vercel.json`: frontend/backend services and routing.

## 4. Product flows

### Live Guard: phone/caller to analyst

1. Start the backend and frontend locally, or open the hosted site.
2. Open the caller route `/caller` on the phone through an HTTPS origin. For a local demo, expose the frontend through a tunnel and append `/caller`.
3. Allow camera and microphone access; the caller page creates a PeerJS ID.
4. On the analyst device, open Live Guard and enter that caller ID.
5. Connect and allow WebRTC to negotiate the remote stream. Network conditions determine whether the media path is direct or relayed.
6. Review the stream and individual signals. Complete the prompted movement challenge if requested. Verify the caller separately before taking consequential action.

Both devices require internet access. Caller permissions must be granted. The HTTPS tunnel and local servers must remain active during a local demo. Browser, camera placement, lighting, bandwidth, and microphone conditions affect signals. A successful movement challenge is one cue; it is not identity proof.

### Media Analysis

1. Choose image, audio, or video and select a supported file.
2. The frontend sends the file to `POST /api/analyze/media`.
3. The backend validates, decodes, analyzes, and returns a summary, risk band where appropriate, findings, and individual signals.
4. Use the result as a review aid, not as a verdict. Confirm important claims using original files and independent sources.

The UI/API currently support JPG/PNG images, common MP4/MOV/WebM video, and WAV/MP3/M4A audio, subject to the configured upload limit and the hosted platform's request limits. The UI has a 4 MB upload cap to stay below Vercel's 4.5 MB function request-body limit. Confirm the current validation and effective deployment limits before changing it.

### Specialist WhatsApp handoffs

Select SathyaScan for a claim or article, and CyberWall for suspicious links, APKs, messages, contact details, and related checks. The user continues in WhatsApp and follows that provider's process. TrustGuard does not receive a result back unless a separate integration is built.

## 5. Risk presentation policy

The shared product bands are:

- **0–29:** lower signal / low concern.
- **30–50:** review; verify before acting.
- **51–100:** high signal; pause and verify through another channel.
- **Inconclusive/unavailable:** no numeric verdict; explain why the analysis could not assess the media.

These are presentation bands for prototype signals, not calibrated probabilities. An `AI score`, `spoof score`, or `risk score` does not equal the probability of AI generation or fraud. Metadata should not be exposed in the UI when it is only used internally; in particular, image location metadata must not be shown to the user.

## 6. Live Guard signals and limits

Live Guard runs browser-side analysis using the incoming stream and MediaPipe landmarks. Current signal families include:

- Face presence and processed-frame coverage.
- A prompted head-movement challenge estimated from facial landmarks.
- Frame freshness, low-motion/frozen-frame evidence, repeated frames, and ordered loop evidence.
- Face-landmark geometry consistency over time.
- Browser-derived audio level and acoustic features.

Project risk weighting recorded in the PRD/conversation was:

```text
score = 0.45 × liveness risk
      + 0.30 × replay risk
      + 0.15 × face consistency risk
      + 0.07 × voice risk
      + 0.03 × face presence risk
```

The implementation has been adjusted over time to reduce false high-risk results for normal moving streams, avoid labeling natural low-motion scenes as loops, and raise replay risk for sustained frozen/repeated/ordered-loop evidence. Liveness is armed automatically after the caller stream connects and one face is available; no start button is required. A missed movement prompt remains a review signal and triggers an automatic retry. Two independent missed prompts raise a high live-response warning, not a confirmed AI/fraud verdict. A successful movement challenge is only a signal and can be mimicked by a recording. Signals depend on face visibility, frame rates, lighting, camera position, and network behavior.

There is no trained deepfake video classifier in Live Guard. It cannot reliably determine whether a live stream is a genuine person, a prerecorded clip, or generated video in all cases. Frame repetition/loop indicators can flag some replay patterns but can be evaded and can also be affected by connection freezes. The live voice checks are acoustic heuristics, not trained voice-cloning detection.

## 7. Media detection modules

### Images

- Local bundled model: `ai-image-detect-distilled` ONNX artifact, loaded by `backend/image_classifier.py`.
- It returns an experimental AI-image indication. It does not detect fraud, image truth, identity, or provenance.
- The model publisher reports 74% validation accuracy; TrustGuard has not independently established that performance on a representative target test set.
- Image authenticity thresholds are conservative: model class scores in the intermediate range are inconclusive; final product risk presentation uses the shared 0–29 / 30–50 / 51–100 bands.
- EXIF, JPEG/recompression, image quality, edge, face, and OCR clues may be inspected, but metadata is not proof and can be removed or forged. Location is not surfaced to the user and metadata does not override classifier output.
- A real photo supplied during development scored 57.2 on the AI-class score and was treated as inconclusive; this demonstrates the model's uncertainty and is not a validated real-vs-AI success case.
- No per-sample overrides are used to force the supplied real photo into a preferred result.

### Audio and video audio: AASIST

- Model: AASIST, ONNX format from [SpeechAntiSpoofingBenchmarks/AASIST](https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST), derived from the original [clovaai/aasist](https://github.com/clovaai/aasist) project.
- Pinned Hugging Face revision: `16774d458d86d2a021ae31646c1bf66a5331b53e`.
- File: `backend/models/aasist.onnx`, 1,615,195 bytes.
- SHA-256: `130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1`.
- MIT license notice: `backend/models/AASIST_LICENSE.txt`.
- Runtime: `onnxruntime` CPU only; no PyTorch stack, external inference API, or runtime model download.
- Input: mono float32 at 16 kHz; model window 64,600 samples (~4.04 seconds). The app samples up to 30 seconds in up to 14 evenly spaced overlapping windows and averages raw softmax class-0 spoof scores.
- Short/quiet audio or inference failure is inconclusive/unavailable; no numeric authenticity score should be inferred in those cases.
- Video's audio track may receive this model signal, while video frames remain heuristic-only.
- AASIST's raw score is not a calibrated probability. It cannot prove a voice is real/synthetic, identify a speaker, establish intent, or confirm fraud.
- Published benchmark results vary: EER 0.83% ASVspoof2019 LA, 12.35% ASVspoof2021 LA, 17.04% ASVspoof2021 DF, and 43.01% InTheWild as reported by its model card. These are not TrustGuard test results.
- The supplied 11Labs voiceover got 48.5/100 and therefore “review,” not “high.” This is direct evidence that the current model cannot promise to flag every synthetic clip above 50.

### Video

- Backend samples frames and analyzes visual/temporal characteristics such as face presence, motion, repeated/frozen frames, and frame differences.
- If FFmpeg support is available, the backend extracts audio for the audio checks above, including AASIST.
- There is no general trained AI-video/deepfake classifier in the current deployed flow. A high video score can indicate temporal anomalies; it must not be described as a definitive AI-video determination.

### OCR and documents

- OCR uses pytesseract where the Tesseract executable is installed/available. A local installation script is provided for Apple Silicon macOS.
- PDF parsing is supported with PyMuPDF.
- Document/identity analysis may extract structural and text clues; no claim that these prove document authenticity should be made without validated benchmarks and provenance checks.

## 8. Identity and transaction combination

The owner requested adding document-identity and transaction combined-risk modules to the MVP if feasible. The repository has routes for:

- `POST /api/analyze/document`
- `POST /api/analyze/identity`
- `POST /api/analyze/transaction`
- A risk-fusion endpoint under `/api` (see `backend/main.py`, function `fuse_risk`).

These routes' presence does not establish their correctness, UI integration, or readiness for real decisions. Before presenting them in a demo, check schemas, validation, field handling, risk-weight assumptions, error paths, privacy, and whether results are clearly labeled as heuristic review signals. No rule should make an identity mismatch or transaction signal a definitive fraud finding by itself.

## 9. Design and interaction decisions recorded

- A calm but high-contrast brand direction using deep ink/navy with mint/green highlights, warm neutrals, and restrained secondary colors.
- The brand icon uses an interlocking/overlapping loop concept rather than a shield or money symbol; the owner approved the supplied loop logo and requested removing its navy background panel so it integrates with the site.
- Landing page should explain Live Guard, Media Analysis, specialist handoffs, practical scam patterns, and how to respond. Claims and statistical/news material should be linked to sources and described carefully.
- Visual work included newspaper-style sourced scam-awareness cards, readable risk cards/graphs, step-by-step motion/scroll scenes, and a usage guide. Avoid fabricated statistics or claims presented as sourced reporting.
- A roaming mascot was explicitly rejected and removed.
- A separate 30-second TrustGuard motion-graphics video was created/planned using HyperFrames with a paper/news collage art direction, brisk 1–1.5 second motion rhythm with occasional longer holds, and a voiceover. It is a marketing/demo asset and must use responsible detection language.
- Previous design feedback emphasized larger type, clearer card/background separation, fluid green gradients, smoother hover/scroll motion, more meaningful data visuals, and replacing generic visuals with media analysis plus the two WhatsApp handoffs.

## 10. Hosting and release record

- Vercel production URL: [https://trustguard-ai-one.vercel.app](https://trustguard-ai-one.vercel.app).
- Frontend and FastAPI backend are configured as Vercel services in `vercel.json`; API routes are rewritten to the backend service.
- Latest recorded deployment for AASIST integration: Vercel deployment `dpl_2EwTZM5ykFvUkhLHN72iS19WT95Y`, status `READY`.
- Reported Python bundle size was 462.29 MB, under Vercel's standard 500 MB function package limit. The 1.6 MB model did not require adding PyTorch.
- Release branch: `new-trustguard-ui`.
- AASIST integration commit: `0a301f1` (`Add local AASIST anti-spoofing signal`).
- Prior relevant commits include upload decoding/review fixes, replay-loop handling, image classifier uncertainty handling, Live Guard layout/setup help, logo integration, and landing page/demo content.
- Manual production deployment was performed. Vercel CLI indicated `vercel git connect` is required for automatic deployment on every push. Do not assume auto-deploy is configured until checked in project settings.

## 11. Checks completed and security posture

Latest AASIST integration checks recorded:

- 24 frontend tests passed after the latest Live Guard replay/liveness changes.
- Frontend lint passed.
- Frontend production build passed.
- Python syntax compilation passed.
- `git diff --check` passed.
- Local AASIST inference executed on CPU; model input/output tensor names and dimensions were inspected.
- `pip check` reported no broken requirements in the local environment.
- A generated one-second sine-wave fixture was sent to the production endpoint; it returned HTTP 200 and an inconclusive result without a numeric score, as intended for a clip shorter than 4.04 seconds.
- Vercel build and deployment reported ready; production API smoke test succeeded.

### Supplied Live Guard replay sample (7 October 2026)

- `1-yad-demo.mp4` is approximately 9.97 seconds, H.264 video with AAC audio, at about 24 fps.
- A local replay-check pass sampled 41 frames at roughly 4 fps. The current ordered-loop detector did not find a repeated sequence during the single playback; frame content changed continuously.
- Replaying the sampled sequence twice in a local algorithm simulation produced ordered-loop detections and a 78/100 replay signal after the second pass. This validates the detector logic on repeated source frames, not camera/display capture conditions.
- This explains why the clip did not trigger loop risk on a one-pass run. The old 35 score reflected a missed movement challenge, not an AI classifier result. The new flow starts movement prompts automatically and retries; two distinct missed prompts now raise a high live-response warning. Sustained ordered loops independently raise the replay score above 50.
- UI copy now says “No loop seen in sampled frames” and explicitly explains that this does not prove the caller is live.
- This sample inspection is not proof that the clip is AI-generated, and the exact physical screen-to-camera live setup has not been exercised by an automated test. Confirm using the real phone/laptop demo.

Security checks and their limits:

- The AASIST bundle checksum is verified at model-load time.
- The model is bundled and does not download code or weights during inference.
- Inference is CPU-only and constrained to small tensor inputs / a bounded sample duration.
- No `pip-audit` or equivalent vulnerability database scan was completed; the tool was unavailable in the environment at the time of the check.
- No complete static analysis, dependency supply-chain review, ONNX graph fuzzing, adversarial robustness review, privacy audit, or third-party penetration test has been completed.
- Artifact integrity and successful loading do not establish upstream model security or detection quality.

## 12. Testing/demo checklist

### Owner/operator checks

1. Open the deployed URL and verify the deployment reflects the latest branch/commit.
2. Test Live Guard with two browsers/devices: grant camera/mic access on caller, share the caller ID to the analyst page, connect, inspect video/audio, complete the movement challenge, then disconnect. Test a normal live person and a prerecorded/replayed clip separately; record expected/actual signals rather than expecting perfect fake-video detection.
3. Test real, synthetic, noisy, compressed, short, silent, and replayed audio files. Confirm short/quiet clips show inconclusive; save output scores and labels for validation.
4. Test known real photos and generator outputs from multiple sources, at several sizes and after social-media compression. Track false positives/negatives; do not judge on a single sample.
5. Test videos with moving real footage, static scenes, camera freezes, and repeated loops. Distinguish internet stalls from deliberate replay.
6. Test SathyaScan and CyberWall links on a phone with WhatsApp installed and verify each opens the intended contact. These checks are external to TrustGuard.
7. Test PDFs and documents with consented non-sensitive samples; verify OCR availability and avoid uploading real identity documents without a clear privacy need.
8. Test transaction/identity routes only with synthetic data until schema validation, privacy, security, and risk thresholds are reviewed.
9. Verify all score bands, keyboard navigation, mobile layout, errors, upload-size handling, canceled uploads, and backend-unavailable messages.
10. Check production API latency/cold start and memory with representative media; do not use live customer content as a test fixture without authorization.

### Human permissions/data still required for meaningful validation

- A labeled evaluation set: confirmed genuine and synthetic speech, genuine and AI images, genuine and manipulated/replayed video, across generators, devices, languages, codecs, and realistic conditions.
- Ground-truth labels and documented consent/provenance for test media.
- A second person/device and camera/microphone permission for a real Live Guard demo.
- Owner review of the intended thresholds, user-facing warnings, and external WhatsApp destinations before public presentation.

No provider credential is required for AASIST or the current local image model. External model APIs were intentionally avoided.

## 13. Known gaps and prioritized roadmap

### P0 — verify before relying on the demo

- Establish a repeatable labeled validation set and report false-positive and false-negative rates for each modality.
- Run dependency vulnerability scanning for Python and JavaScript lockfiles and remediate verified findings.
- Confirm Vercel automatic deployments are actually connected if the desired workflow is “deploy on push.”
- Verify the document, identity, transaction, and risk-fusion API routes end-to-end; separate “implemented” from “tested” and “validated.”
- Ensure production policy/limits and error handling are clear, especially 4 MB browser upload cap and Vercel body/runtime limits.

### P1 — improve model signal quality

- Evaluate AASIST on a target-domain test set, including current synthetic speech and replayed real speech; pick thresholds from measured calibration rather than the generic shared bands alone.
- Assess independent detector(s) only after verifying provenance, license, resource requirements, security and target-domain performance. Do not add Dessa unless the owner revises the rejection.
- Evaluate image model false positives on real phone photos and AI outputs; present ambiguous cases as inconclusive.
- Add observable model version, processing time, and structured error diagnostics without exposing sensitive media or EXIF location.

### P2 — product completeness

- Complete functional accessibility/mobile review of all buttons and routes.
- Finish/verify user guide and demo script against the actual deployed flows.
- Keep awareness articles/statistics source-linked, dated, and accurately summarized.
- Decide whether future storage/session persistence is necessary; default to minimizing retained personal media.

## 14. References

- [TrustGuard AI GitHub repository](https://github.com/swalihm744-blip/trustguard-ai)
- [AASIST original source and paper implementation](https://github.com/clovaai/aasist)
- [AASIST ONNX model card and benchmark details](https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST)
- [AASIST license](https://github.com/clovaai/aasist/blob/main/LICENSE)
- [Image model card](https://huggingface.co/onnx-community/ai-image-detect-distilled-ONNX)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- Repository-specific image provenance, classifier thresholds, and caveats: `backend/models/image_detector_MANIFEST.md` and `backend/models/image_detector_MODEL_CARD.md`.

---

**Use this as a project handoff, not a security certification or detector accuracy guarantee.** Keep claims aligned with the currently tested code and preserve uncertainty in the UI and demo narration.
