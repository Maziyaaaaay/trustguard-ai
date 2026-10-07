import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { Peer } from "peerjs";
import {
  calculateTrustGuardRisk,
  hasOrderedLoop,
  getFrameFingerprint,
  latchReplayLoopEvidence,
  scoreTemporalSignals,
} from "./liveGuardMetrics";
import "./LiveGuard.css";
import { LiveGuardGuide } from "../components/UsageHelp.jsx";

const LANDMARK_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const TRACK_POINTS = [
  1,
  33,
  263,
  61,
  291,
  199,
  10,
  152,
  234,
  454,
  127,
  356,
];

function clamp(value, min = 0, max = 100) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return (
    values.reduce(
      (a, b) => a + b,
      0
    ) / values.length
  );
}

function distance(a, b) {
  const dx =
    a.x - b.x;

  const dy =
    a.y - b.y;

  const dz =
    (a.z || 0) -
    (b.z || 0);

  return Math.sqrt(
    dx * dx +
      dy * dy +
      dz * dz
  );
}

function LiveGuard({ onBack })  {
  const localVideoRef =
    useRef(null);

  const remoteVideoRef =
    useRef(null);

  const overlayCanvasRef =
    useRef(null);

  const sampleCanvasRef =
    useRef(null);

  const peerRef =
    useRef(null);

  const analystStreamRef =
    useRef(null);

  const activeCallRef =
    useRef(null);

  const landmarkerRef =
    useRef(null);

  const faceAIStartingRef =
    useRef(false);

  const animationRef =
    useRef(null);

  const lastFrameRef =
    useRef(0);

  const lastSampleTimeRef =
    useRef(0);

  // ----------------------------------------------------------
  // Remote playback
  // ----------------------------------------------------------

  const remoteStreamRef =
    useRef(null);

  const remoteConnectedRef =
    useRef(false);

  const remoteAudioEnabledRef =
    useRef(false);

  // ----------------------------------------------------------
  // Replay
  // ----------------------------------------------------------

  const previousPixelsRef =
    useRef(null);

  const frameDiffHistoryRef =
    useRef([]);

  const frameFingerprintHistoryRef =
    useRef([]);

  const repeatedFrameHistoryRef =
    useRef([]);

  const frameDisruptionHistoryRef =
    useRef([]);

  // ----------------------------------------------------------
  // Face consistency
  // ----------------------------------------------------------

  const previousFaceSignatureRef =
    useRef(null);

  const consistencyHistoryRef =
    useRef([]);

  const facePresenceFramesRef =
    useRef(0);

  const totalFaceFramesRef =
    useRef(0);

  // ----------------------------------------------------------
  // Liveness
  // ----------------------------------------------------------

  const faceFoundAtRef =
    useRef(null);

  const challengeArmedRef = useRef(false);
  const challengeChannelRef = useRef(null);
  const challengePromptRef = useRef(null);
  const sampledVideoTimeRef = useRef(null);
  const livenessRetryTimerRef = useRef(null);

  const challengeRef =
    useRef("WAITING");

  const baselineYawRef =
    useRef(null);

  const headTurnStartRef =
    useRef(null);

  const challengeIssuedAtRef =
    useRef(null);

  const challengePausedRef =
    useRef(false);

  const challengeDirectionRef =
    useRef("LEFT");

  const livenessFailedRef =
    useRef(false);

  const livenessFailureCountRef =
    useRef(0);

  // ----------------------------------------------------------
  // Voice
  // ----------------------------------------------------------

  const audioContextRef =
    useRef(null);

  const analyserRef =
    useRef(null);

  const audioSourceRef =
    useRef(null);

  const voiceHistoryRef =
    useRef([]);

  const lastVoiceAnalysisRef =
    useRef(0);

  // ----------------------------------------------------------
  // IMPORTANT:
  // Current values used by the risk engine.
  // ----------------------------------------------------------

  const faceCountRef =
    useRef(0);

  const livenessRiskRef =
    useRef(0);

  const replayRiskRef =
    useRef(0);

  const orderedLoopDetectedRef =
    useRef(false);

  const consistencyRiskRef =
    useRef(0);

  const voiceRiskRef =
    useRef(null);

  const facePresenceRiskRef =
    useRef(0);

  const [analystPeerId, setAnalystPeerId] =
    useState("");

  const [callerId, setCallerId] =
    useState("");

  const [serviceStatus, setServiceStatus] =
    useState("STARTING");

  const [callStatus, setCallStatus] =
    useState("WAITING");

  const [remoteConnected, setRemoteConnected] =
    useState(false);

  const [remotePlaybackBlocked, setRemotePlaybackBlocked] =
    useState(false);

  const [remoteAudioAvailable, setRemoteAudioAvailable] =
    useState(false);

  const [remoteAudioEnabled, setRemoteAudioEnabled] =
    useState(false);

  const [error, setError] =
    useState("");

  // Face
  const [faceStatus, setFaceStatus] =
    useState("WAITING");

  const [faceCount, setFaceCount] =
    useState(0);

  const [analysisStatus, setAnalysisStatus] =
    useState("WAITING FOR VIDEO");

  // Liveness
  const [livenessStatus, setLivenessStatus] =
    useState("WAITING FOR FACE");

  const [livenessScore, setLivenessScore] =
    useState(null);

  // Replay
  const [replayScore, setReplayScore] =
    useState(0);

  const [frameFreshness, setFrameFreshness] =
    useState(100);

  const [videoRiskStatus, setVideoRiskStatus] =
    useState("WAITING");

  // Consistency
  const [consistencyScore, setConsistencyScore] =
    useState(100);

  const [consistencyRisk, setConsistencyRisk] =
    useState(0);

  const [facePresenceScore, setFacePresenceScore] =
    useState(100);

  const [consistencyStatus, setConsistencyStatus] =
    useState("WAITING");

  // Voice
  const voiceAnalysisSettledRef =
    useRef(false);

  const [voiceSignal, setVoiceSignal] =
    useState(0);

  const [speechActivity, setSpeechActivity] =
    useState(0);

  const [voiceAnomalyRisk, setVoiceAnomalyRisk] =
    useState(null);

  const [voiceProfileStatus, setVoiceProfileStatus] =
    useState("WAITING FOR AUDIO");

  // Risk
  const [riskScore, setRiskScore] =
    useState(null);

  const [riskLevel, setRiskLevel] =
    useState("ANALYZING");

  const [riskReasons, setRiskReasons] =
    useState([]);

  const [warningVisible, setWarningVisible] =
    useState(false);

  useEffect(() => {
    startAnalyst();

    return () => {
      cleanupEverything();
    };
  }, []);

  // ==========================================================
  // ANALYST CAMERA
  // ==========================================================

  async function startAnalyst() {
    try {
      setServiceStatus("STARTING");
      setCallStatus(
        "PREPARING CAMERA"
      );
      setError("");

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

      analystStreamRef.current =
        stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject =
          stream;

        localVideoRef.current.muted =
          true;

        localVideoRef.current.playsInline =
          true;

        try {
          await localVideoRef.current.play();
        } catch {}
      }

      createPeer();
    } catch (err) {
      console.error(
        "Analyst camera error:",
        err
      );

      setServiceStatus("ERROR");
      setCallStatus(
        "CAMERA ERROR"
      );

      setError(
        "TrustGuard could not access the analyst camera."
      );
    }
  }

  function createPeer() {
    try {
      const peer =
        new Peer();

      peerRef.current =
        peer;

      peer.on(
        "open",
        (id) => {
          console.log(
            "✅ Analyst PeerJS ID:",
            id
          );

          setAnalystPeerId(id);
          setServiceStatus("READY");
          setCallStatus("WAITING");
          setError("");
        }
      );

      peer.on(
        "disconnected",
        () => {
          setServiceStatus(
            "DISCONNECTED"
          );
        }
      );

      peer.on(
        "close",
        () => {
          setServiceStatus(
            "CLOSED"
          );
        }
      );

      peer.on(
        "error",
        (err) => {
          console.error(
            "PeerJS error:",
            err
          );

          setServiceStatus(
            "ERROR"
          );

          setError(
            `PeerJS error: ${
              err.type ||
              "unknown"
            }`
          );
        }
      );
    } catch (err) {
      console.error(
        "Peer creation error:",
        err
      );

      setServiceStatus("ERROR");

      setError(
        "Unable to start TrustGuard call service."
      );
    }
  }

  // ==========================================================
  // CONNECT TO PHONE
  // ==========================================================

  async function connectToCaller() {
    const id =
      callerId.trim();

    if (!id) {
      setError(
        "Enter the Caller ID from the phone."
      );
      return;
    }

    if (!peerRef.current) {
      setError(
        "Call service is not ready."
      );
      return;
    }

    if (!analystStreamRef.current) {
      setError(
        "Analyst camera is not ready."
      );
      return;
    }

    try {
      setError("");
      setCallStatus(
        "CONNECTING"
      );
      setAnalysisStatus(
        "CONNECTING"
      );

      resetAllAnalysis();

      const call =
        peerRef.current.call(
          id,
          analystStreamRef.current
        );

      if (!call) {
        throw new Error(
          "Call could not be created."
        );
      }

      activeCallRef.current = call;
      challengeChannelRef.current?.close();
      const channel = peerRef.current.connect(id, { reliable: true, metadata: { kind: "trustguard-challenge" } });
      challengeChannelRef.current = channel;
      channel.on("open", () => { if (challengePromptRef.current) publishChallenge(challengePromptRef.current); });
      channel.on("error", () => { /* Laptop prompt remains available if the data channel fails. */ });

      call.on(
        "stream",
        async (remoteStream) => {
          console.log(
            "✅ REMOTE STREAM RECEIVED"
          );

          remoteStreamRef.current =
            remoteStream;

          remoteConnectedRef.current =
            true;

          setRemoteConnected(true);
          setRemotePlaybackBlocked(
            false
          );

          setCallStatus(
            "CONNECTED"
          );

          setAnalysisStatus(
            "PREPARING REMOTE VIDEO"
          );

          // Arm the movement check as soon as the analyst receives the
          // caller stream. It begins after a single face is stable in frame;
          // callers do not need to find or press a separate start button.
          challengeArmedRef.current = true;
          setLivenessStatus("WAITING FOR FACE");
          publishChallenge("Live movement check is ready. Face the camera and follow the prompt when it appears.");

          const videoTracks =
            remoteStream.getVideoTracks();

          const audioTracks =
            remoteStream.getAudioTracks();

          console.log(
            "Remote video tracks:",
            videoTracks.length
          );

          console.log(
            "Remote audio tracks:",
            audioTracks.length
          );

          const updateRemoteAudioAvailability = () => {
            const hasLiveAudio = remoteStream
              .getAudioTracks()
              .some((track) => track.readyState !== "ended");
            setRemoteAudioAvailable(hasLiveAudio);
          };

          remoteAudioEnabledRef.current = false;
          setRemoteAudioEnabled(false);
          updateRemoteAudioAvailability();
          remoteStream.addEventListener(
            "addtrack",
            updateRemoteAudioAvailability
          );

          audioTracks.forEach((track) => {
            track.enabled = true;
            track.onunmute = updateRemoteAudioAvailability;
            track.onended = updateRemoteAudioAvailability;
          });

          videoTracks.forEach(
            (track) => {
              track.enabled =
                true;

              track.onunmute =
                () => {
                  console.log(
                    "✅ Remote video track unmuted"
                  );

                  forceRemotePlayback();
                  startFaceAIWhenVideoArrives();
                };
            }
          );

          remoteStream.addEventListener("addtrack", ({ track }) => {
            if (track.kind !== "video") return;
            track.enabled = true;
            track.onunmute = () => {
              forceRemotePlayback();
              startFaceAIWhenVideoArrives();
            };
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          });

          if (
            remoteVideoRef.current
          ) {
            const video =
              remoteVideoRef.current;

            /*
             * Muted is intentional here.
             * We still analyze remoteStream audio
             * separately with Web Audio.
             * Muting the element prevents browser
             * autoplay restrictions from blocking
             * the video.
             */
            video.muted = !remoteAudioEnabledRef.current;
            video.volume = 1;
            video.playsInline =
              true;
            video.autoplay = true;

            video.srcObject =
              remoteStream;

            video.onloadedmetadata =
              () => {
                console.log(
                  "Remote video metadata loaded",
                  video.videoWidth,
                  video.videoHeight
                );

                forceRemotePlayback();
                startFaceAIWhenVideoArrives();
              };

            video.oncanplay =
              () => {
                forceRemotePlayback();
                startFaceAIWhenVideoArrives();
              };

            video.onplaying = () => {
              startFaceAIWhenVideoArrives();
            };

            video.onresize = () => {
              startFaceAIWhenVideoArrives();
            };

            try {
              await video.play();

              console.log(
                "✅ Remote video playing"
              );

              setRemotePlaybackBlocked(
                false
              );
            } catch (playError) {
              console.warn(
                "Remote autoplay blocked:",
                playError
              );

              setRemotePlaybackBlocked(
                true
              );
            }
          }

          await startVoiceAnalysis(
            remoteStream
          );

          const videoReady = await waitForRemoteVideo(15000);

          if (videoReady) {
            await startFaceAI();
          } else {
            setAnalysisStatus(
              "WAITING FOR CALLER VIDEO"
            );
            setError(
              "The call connected, but no video frames arrived. Turn the caller camera on; video analysis will resume when frames arrive."
            );
          }
        }
      );

      call.on(
        "close",
        () => {
          disconnectCall();
        }
      );

      call.on(
        "error",
        (err) => {
          console.error(
            "WebRTC call error:",
            err
          );

          setCallStatus(
            "CALL ERROR"
          );

          setError(
            `Protected call failed: ${
              err.type ||
              "WebRTC error"
            }`
          );

          disconnectCall();
        }
      );
    } catch (err) {
      console.error(
        "Connection error:",
        err
      );

      setCallStatus(
        "CALL ERROR"
      );

      setError(
        err.message ||
          "Connection failed."
      );
    }
  }

  async function forceRemotePlayback() {
    const video =
      remoteVideoRef.current;

    if (!video) {
      return false;
    }

    if (
      !video.srcObject
    ) {
      return false;
    }

    try {
      video.muted =
        !remoteAudioEnabledRef.current;

      await video.play();

      setRemotePlaybackBlocked(
        false
      );

      return true;
    } catch (err) {
      console.warn(
        "Remote playback failed:",
        err
      );

      setRemotePlaybackBlocked(
        true
      );

      return false;
    }
  }

  async function toggleRemoteAudio() {
    const video = remoteVideoRef.current;
    const stream = remoteStreamRef.current;
    const audioTracks = stream?.getAudioTracks() || [];
    const liveAudioTracks = audioTracks.filter(
      (track) => track.readyState !== "ended"
    );

    if (!video || !stream || liveAudioTracks.length === 0) {
      setError(
        "No live microphone track arrived from the caller. Check the phone microphone permission and make sure the caller's microphone is unmuted."
      );
      return;
    }

    if (remoteAudioEnabledRef.current) {
      remoteAudioEnabledRef.current = false;
      setRemoteAudioEnabled(false);
      video.muted = true;
      setError("");
      return;
    }

    liveAudioTracks.forEach((track) => {
      track.enabled = true;
    });

    video.srcObject = stream;
    video.volume = 1;
    video.muted = false;
    remoteAudioEnabledRef.current = true;
    setRemoteAudioEnabled(true);
    setError("");

    try {
      // Call play directly from this button action so browsers allow audio.
      await video.play();

      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
    } catch (playError) {
      console.warn("Caller audio playback failed:", playError);
      remoteAudioEnabledRef.current = false;
      setRemoteAudioEnabled(false);
      video.muted = true;
      setError(
        "The browser blocked audio playback. Tap Enable caller audio again and check the tab/device volume."
      );
    }
  }

  async function manualPlayRemote() {
    const playing =
      await forceRemotePlayback();

    if (!playing) {
      setError(
        "The browser blocked remote video playback."
      );
    } else {
      setError("");
    }
  }

  async function waitForRemoteVideo(timeoutMs = 15000) {
    const video =
      remoteVideoRef.current;

    if (!video) {
      return false;
    }

    /*
     * Wait for up to 15 seconds for
     * actual video dimensions.
     */
    const started =
      performance.now();

    while (
      performance.now() -
        started <
        timeoutMs
    ) {
      if (
        video.videoWidth >
          0 &&
        video.videoHeight >
          0 &&
        video.readyState >= 2
      ) {
        return true;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );
    }

    return Boolean(video.videoWidth > 0 && video.readyState >= 2);
  }

  function startFaceAIWhenVideoArrives() {
    const video = remoteVideoRef.current;
    if (video?.videoWidth > 0 && video.readyState >= 2) {
      setError("");
      void startFaceAI();
    }
  }

  // ==========================================================
  // FACE AI
  // ==========================================================

  async function startFaceAI() {
    if (landmarkerRef.current || faceAIStartingRef.current) {
      return;
    }

    try {
      faceAIStartingRef.current = true;
      const video =
        remoteVideoRef.current;

      if (
        !video ||
        video.videoWidth === 0
      ) {
        setAnalysisStatus(
          "REMOTE VIDEO NOT READY"
        );

        return;
      }

      setAnalysisStatus(
        "LOADING FORENSIC AI"
      );

      const vision =
        await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

      const landmarker =
        await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                LANDMARK_MODEL,
              delegate: "CPU",
            },

            runningMode:
              "VIDEO",

            numFaces: 2,

            minFaceDetectionConfidence:
              0.45,

            minFacePresenceConfidence:
              0.45,

            minTrackingConfidence:
              0.45,
          }
        );

      landmarkerRef.current =
        landmarker;

      setAnalysisStatus(
        "CONNECTED · SIGNAL REVIEW"
      );

      startDetection();
    } catch (err) {
      console.error(
        "Face AI error:",
        err
      );

      setAnalysisStatus(
        "FACE AI ERROR"
      );

      setError(
        "Face AI model could not load."
      );
    } finally {
      faceAIStartingRef.current = false;
    }
  }

  function startDetection() {
    if (
      animationRef.current
    ) {
      cancelAnimationFrame(
        animationRef.current
      );
    }

    const loop =
      () => {
        animationRef.current =
          requestAnimationFrame(
            loop
          );

        analyzeVoiceFrame();

        const video =
          remoteVideoRef.current;

        const canvas =
          overlayCanvasRef.current;

        const landmarker =
          landmarkerRef.current;

        if (
          !video ||
          !canvas ||
          !landmarker
        ) {
          return;
        }

        if (
          video.readyState <
            2 ||
          video.videoWidth ===
            0 ||
          video.videoHeight ===
            0
        ) {
          return;
        }

        const now =
          performance.now();

        if (
          now -
            lastFrameRef.current <
          150
        ) {
          return;
        }

        lastFrameRef.current =
          now;

        // Temporal analysis applies to the stream even when no face is found.
        analyzeFrameFreshness(video);

        try {
          canvas.width =
            video.videoWidth;

          canvas.height =
            video.videoHeight;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            return;
          }

          ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          const result =
            landmarker.detectForVideo(
              video,
              now
            );

          const faces =
            result?.faceLandmarks ||
            [];

          const count =
            faces.length;

          faceCountRef.current =
            count;

          setFaceCount(
            count
          );

          totalFaceFramesRef.current +=
            1;

          if (count === 0) {
            handleNoFace(
              ctx
            );

            fuseRisk();

            return;
          }

          if (count > 1) {
            handleMultipleFaces(
              ctx,
              faces
            );

            fuseRisk();

            return;
          }

          const landmarks =
            faces[0];

          facePresenceFramesRef.current +=
            1;

          setFaceStatus(
            "FACE DETECTED"
          );

          updateFacePresence(
            true
          );

          drawFaces(
            ctx,
            faces,
            canvas
          );

          if (
            faceFoundAtRef.current ===
            null
          ) {
            faceFoundAtRef.current =
              performance.now();
          }

          setAnalysisStatus(
            "CONNECTED · SIGNAL REVIEW"
          );

          processLiveness(
            landmarks
          );

          analyzeFaceConsistency(
            landmarks
          );

          /*
           * IMPORTANT:
           * fuseRisk() reads refs, not React
           * state, so it always gets current values.
           */
          fuseRisk();
        } catch (err) {
          console.error(
            "Analysis frame error:",
            err
          );
        }
      };

    loop();
  }

  function handleNoFace(
    ctx
  ) {
    faceCountRef.current =
      0;

    setFaceStatus(
      "NO FACE"
    );

    setAnalysisStatus(
      "FACE NOT DETECTED"
    );

    faceFoundAtRef.current =
      null;

    pauseLivenessChallenge("FACE NOT VISIBLE — CENTER YOUR FACE");

    facePresenceRiskRef.current =
      Math.min(
        100,
        facePresenceRiskRef.current +
          5
      );

    drawMessage(
      ctx,
      "NO FACE DETECTED",
      "#ff4d6d"
    );

    updateFacePresence(
      false
    );
  }

  function handleMultipleFaces(
    ctx,
    faces
  ) {
    faceCountRef.current =
      faces.length;

    setFaceStatus(
      "MULTIPLE FACES"
    );

    setAnalysisStatus(
      "MULTIPLE FACES DETECTED"
    );

    drawFaces(
      ctx,
      faces,
      overlayCanvasRef.current
    );

    facePresenceRiskRef.current = 80;
    pauseLivenessChallenge("ONE FACE NEEDED — KEEP ONLY THE CALLER IN FRAME");

    updateFacePresence(
      false
    );
  }

  // ==========================================================
  // LIVENESS
  // ==========================================================

  function publishChallenge(message) {
    challengePromptRef.current = message;
    const channel = challengeChannelRef.current;
    if (channel?.open) {
      try { channel.send({ type: "trustguard-challenge", message }); } catch { /* Keep laptop prompt available. */ }
    }
  }

  function pauseLivenessChallenge(message) {
    if (challengeRef.current === "TURN") {
      challengePausedRef.current = true;
      challengeIssuedAtRef.current = performance.now();
      headTurnStartRef.current = null;
      setLivenessStatus(message);
      return;
    }

    if (challengeRef.current === "WAITING") {
      setLivenessStatus("WAITING FOR FACE");
      setLivenessScore(null);
    }
  }

  function processLiveness(
    landmarks
  ) {
    const nose =
      landmarks[1];

    const leftEye =
      landmarks[33];

    const rightEye =
      landmarks[263];

    if (
      !nose ||
      !leftEye ||
      !rightEye
    ) {
      return;
    }

    const eyeDistance =
      Math.abs(
        rightEye.x -
          leftEye.x
      );

    if (
      eyeDistance <
      0.02
    ) {
      return;
    }

    const eyeCenter =
      (leftEye.x +
        rightEye.x) /
      2;

    const normalizedYaw =
      (nose.x -
        eyeCenter) /
      eyeDistance;

    if (challengePausedRef.current) {
      challengePausedRef.current = false;
      baselineYawRef.current = normalizedYaw;
      challengeIssuedAtRef.current = performance.now();
      headTurnStartRef.current = null;
      setLivenessStatus(
        `MOVE YOUR NOSE TO SCREEN ${challengeDirectionRef.current}`
      );
      setLivenessScore(25);
    }

    const stableTime =
      performance.now() -
      (faceFoundAtRef.current ||
        performance.now());

    /*
     * Start a random liveness challenge.
     */
    if (
      challengeRef.current ===
        "WAITING" && challengeArmedRef.current &&
      stableTime >
        1200
    ) {
      challengeRef.current =
        "TURN";

      baselineYawRef.current =
        normalizedYaw;

      headTurnStartRef.current =
        null;

      challengeIssuedAtRef.current =
        performance.now();

      challengeDirectionRef.current =
        Math.random() >=
        0.5
          ? "LEFT"
          : "RIGHT";

      challengePausedRef.current = false;

      livenessFailedRef.current =
        false;

      setLivenessStatus(
        `MOVE YOUR NOSE TO SCREEN ${challengeDirectionRef.current}`
      );

      publishChallenge(`Live movement check: move your nose toward the ${challengeDirectionRef.current === "LEFT" ? "← LEFT" : "RIGHT →"} side of the screen. Turn gently and hold for half a second.`);
      setLivenessScore(25);

      /*
       * Challenge is incomplete:
       * significant risk, but not yet failed.
       */
      livenessRiskRef.current =
        55;

      setAnalysisStatus(
        "LIVENESS CHALLENGE"
      );

      return;
    }

    if (
      challengeRef.current !==
      "TURN"
    ) {
      return;
    }

    const challengeAge =
      performance.now() -
      (challengeIssuedAtRef.current ||
        performance.now());

    /*
     * Allow time for the user to understand and complete the movement.
     */
    if (
      challengeAge >
      15000
    ) {
      completeLivenessFailure();

      return;
    }

    if (
      baselineYawRef.current ===
      null
    ) {
      baselineYawRef.current =
        normalizedYaw;

      return;
    }

    const movement =
      normalizedYaw -
      baselineYawRef.current;

    const movementThreshold = 0.12;
    const releaseThreshold = 0.07;

    const correctDirection =
      challengeDirectionRef.current ===
      "LEFT"
        ? movement <= -movementThreshold
        : movement >= movementThreshold;

    const holdingCorrectDirection =
      challengeDirectionRef.current === "LEFT"
        ? movement <= -releaseThreshold
        : movement >= releaseThreshold;

    if (headTurnStartRef.current === null && correctDirection) {
      headTurnStartRef.current = performance.now();

      setLivenessScore(70);
      setLivenessStatus("GOOD MOVEMENT — HOLD POSITION");
      livenessRiskRef.current = 30;
    }

    if (
      headTurnStartRef.current !== null &&
      !holdingCorrectDirection
    ) {
      headTurnStartRef.current =
        null;

      setLivenessScore(25);
      setLivenessStatus(
        `MOVE YOUR NOSE TO SCREEN ${challengeDirectionRef.current}`
      );
      return;
    }

    if (
      headTurnStartRef.current !== null &&
      performance.now() - headTurnStartRef.current >= 500
    ) {
      completeLiveness();
    }
  }

  function completeLiveness() {
    challengeRef.current =
      "PASSED";

    livenessFailedRef.current =
      false;

    livenessFailureCountRef.current = 0;

    setLivenessStatus(
      "LIVENESS VERIFIED"
    );

    setLivenessScore(
      100
    );

    livenessRiskRef.current =
      5;

    publishChallenge("Movement challenge completed. Thank you.");
    setAnalysisStatus("CONNECTED · SIGNAL REVIEW");
  }

  function completeLivenessFailure() {
    if (
      livenessFailedRef.current
    ) {
      return;
    }

    livenessFailedRef.current =
      true;

    livenessFailureCountRef.current += 1;

    challengeRef.current =
      "FAILED";

    setLivenessStatus(
      "NOT COMPLETED — RETRY CHALLENGE"
    );

    setLivenessScore(
      0
    );

    livenessRiskRef.current = livenessFailureCountRef.current >= 2 ? 55 : 35;
    publishChallenge(
      livenessFailureCountRef.current >= 2
        ? "Two live movement prompts were not completed. Pause and verify the caller through another channel. This does not prove AI generation or fraud."
        : "The movement prompt was not completed. A second independent prompt will be tried automatically."
    );

    // Retry automatically after a short pause. A missed prompt is only a
    // review signal and must not be treated as proof of replay or fraud.
    if (livenessRetryTimerRef.current) {
      window.clearTimeout(livenessRetryTimerRef.current);
    }
    livenessRetryTimerRef.current = window.setTimeout(() => {
      livenessRetryTimerRef.current = null;
      if (!remoteConnectedRef.current) return;
      challengeRef.current = "WAITING";
      challengeArmedRef.current = true;
      faceFoundAtRef.current = performance.now() - 1201;
      baselineYawRef.current = null;
      headTurnStartRef.current = null;
      setLivenessStatus("RETRYING MOVEMENT CHECK — FOLLOW THE NEW PROMPT");
    }, 3000);

    setAnalysisStatus(
      "MOVEMENT CHALLENGE NEEDS RETRY"
    );

    setRiskReasons(
      [
        "Movement prompt not completed; the check will retry automatically",
      ]
    );
  }

  function resetLiveness() {
    if (livenessRetryTimerRef.current) {
      window.clearTimeout(livenessRetryTimerRef.current);
      livenessRetryTimerRef.current = null;
    }
    challengeArmedRef.current = true;
    challengePromptRef.current = null;
    challengeRef.current =
      "WAITING";

    challengePausedRef.current = false;

    baselineYawRef.current =
      null;

    headTurnStartRef.current =
      null;

    challengeIssuedAtRef.current =
      null;

    challengeDirectionRef.current =
      "LEFT";

    livenessFailedRef.current =
      false;

    faceFoundAtRef.current =
      null;

    livenessRiskRef.current =
      0;

    setLivenessStatus("WAITING FOR FACE");

    setLivenessScore(
      null
    );
  }

  // ==========================================================
  // REPLAY
  // ==========================================================

  function analyzeFrameFreshness(video) {
    const now = performance.now();
    if (now - lastSampleTimeRef.current < 250) return;
    lastSampleTimeRef.current = now;
    if (sampledVideoTimeRef.current === video.currentTime) {
      pauseLivenessChallenge("VIDEO PAUSED — WAITING FOR FRESH FRAMES");
    }
    sampledVideoTimeRef.current = video.currentTime;

    const canvas = sampleCanvasRef.current || document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    sampleCanvasRef.current = canvas;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 160, 90);
    const pixels = ctx.getImageData(0, 0, 160, 90).data;
    const fingerprint = getFrameFingerprint(pixels);
    const fingerprintHistory = frameFingerprintHistoryRef.current;
    fingerprintHistory.push({ signature: fingerprint, sampledAt: now });
    if (fingerprintHistory.length > 64) fingerprintHistory.shift();
    const repeatedFrame = hasOrderedLoop(fingerprintHistory);

    repeatedFrameHistoryRef.current.push(repeatedFrame);
    if (repeatedFrameHistoryRef.current.length > 16) {
      repeatedFrameHistoryRef.current.shift();
    }

    const previous = previousPixelsRef.current;
    if (previous) {
      let difference = 0;
      let disruptiveSamples = 0;
      let sampledPixels = 0;

      // Sample every fourth pixel while retaining RGB differences.
      for (let i = 0; i < pixels.length; i += 16) {
        const redDifference = Math.abs(pixels[i] - previous[i]);
        const greenDifference = Math.abs(pixels[i + 1] - previous[i + 1]);
        const blueDifference = Math.abs(pixels[i + 2] - previous[i + 2]);
        const colorDifference =
          redDifference + greenDifference + blueDifference;

        difference += colorDifference;
        sampledPixels += 1;
        if (colorDifference >= 420) disruptiveSamples += 1;
      }

      const avgDiff = difference / Math.max(sampledPixels, 1);
      frameDiffHistoryRef.current.push(avgDiff);
      if (frameDiffHistoryRef.current.length > 40) {
        frameDiffHistoryRef.current.shift();
      }

      const disruptionRatio =
        disruptiveSamples / Math.max(sampledPixels, 1);
      frameDisruptionHistoryRef.current.push(disruptionRatio >= 0.55);
      if (frameDisruptionHistoryRef.current.length > 16) {
        frameDisruptionHistoryRef.current.shift();
      }

      const temporal = scoreTemporalSignals(
        frameDiffHistoryRef.current,
        repeatedFrameHistoryRef.current,
        frameDisruptionHistoryRef.current
      );
      const replayEvidence = latchReplayLoopEvidence(
        orderedLoopDetectedRef.current,
        temporal
      );
      replayRiskRef.current = replayEvidence.score;
      orderedLoopDetectedRef.current = replayEvidence.orderedLoopDetected;
      setReplayScore(replayEvidence.score);
      setFrameFreshness(temporal.freshness);

      if (replayEvidence.orderedLoopDetected) {
        setVideoRiskStatus("REPEATING LOOP DETECTED · POSSIBLE REPLAY");
      } else if (temporal.score >= 70) {
        setVideoRiskStatus(
          temporal.disruptionCount >= 2
            ? "REPEATED FRAME DISRUPTION"
            : "HIGH REPLAY INDICATOR"
        );
      } else if (temporal.score >= 35) {
        setVideoRiskStatus("REVIEW VIDEO SIGNALS");
      } else {
        setVideoRiskStatus("NO LOOP SEEN IN SAMPLED FRAMES");
      }
    }

    previousPixelsRef.current = new Uint8ClampedArray(pixels);
  }

  function resetReplayAnalysis() {
    sampledVideoTimeRef.current = null;
    lastSampleTimeRef.current =
      0;

    previousPixelsRef.current =
      null;

    frameDiffHistoryRef.current =
      [];

    frameFingerprintHistoryRef.current = [];
    repeatedFrameHistoryRef.current = [];
    frameDisruptionHistoryRef.current = [];

    replayRiskRef.current =
      0;

    orderedLoopDetectedRef.current = false;

    setReplayScore(
      0
    );

    setFrameFreshness(
      100
    );

    setVideoRiskStatus(
      "WAITING"
    );
  }

  // ==========================================================
  // FACE CONSISTENCY
  // ==========================================================

  function createFaceSignature(
    landmarks
  ) {
    const leftEye =
      landmarks[33];

    const rightEye =
      landmarks[263];

    if (
      !leftEye ||
      !rightEye
    ) {
      return null;
    }

    const eyeDistance =
      Math.max(
        distance(
          leftEye,
          rightEye
        ),
        0.01
      );

    const centerX =
      (leftEye.x +
        rightEye.x) /
      2;

    const centerY =
      (leftEye.y +
        rightEye.y) /
      2;

    return TRACK_POINTS
      .map(
        (index) => {
          const point =
            landmarks[index];

          if (!point) {
            return null;
          }

          return {
            x:
              (point.x -
                centerX) /
              eyeDistance,

            y:
              (point.y -
                centerY) /
              eyeDistance,

            z:
              (point.z || 0) /
              eyeDistance,
          };
        }
      )
      .filter(Boolean);
  }

  function analyzeFaceConsistency(
    landmarks
  ) {
    const current =
      createFaceSignature(
        landmarks
      );

    if (!current) {
      return;
    }

    const previous =
      previousFaceSignatureRef.current;

    if (!previous) {
      previousFaceSignatureRef.current =
        current;

      setConsistencyStatus(
        "CALIBRATING"
      );

      return;
    }

    const count =
      Math.min(
        previous.length,
        current.length
      );

    if (!count) {
      return;
    }

    const changes =
      [];

    for (
      let i = 0;
      i < count;
      i++
    ) {
      changes.push(
        distance(
          current[i],
          previous[i]
        )
      );
    }

    const meanChange =
      average(changes);

    const normalizedChange =
      clamp(
        meanChange *
          140
      );

    const currentScore =
      clamp(
        100 -
          normalizedChange
      );

    consistencyHistoryRef.current.push(
      currentScore
    );

    if (
      consistencyHistoryRef.current
        .length >
      20
    ) {
      consistencyHistoryRef.current.shift();
    }

    const smoothed =
      average(
        consistencyHistoryRef.current
      );

    const risk =
      clamp(
        100 -
          smoothed
      );

    consistencyRiskRef.current =
      Math.round(
        risk
      );

    setConsistencyScore(
      Math.round(
        smoothed
      )
    );

    setConsistencyRisk(
      Math.round(
        risk
      )
    );

    if (
      risk >= 70
    ) {
      setConsistencyStatus(
        "HIGH INCONSISTENCY"
      );
    } else if (
      risk >= 35
    ) {
      setConsistencyStatus(
        "REVIEW FACE TRACK"
      );
    } else {
      setConsistencyStatus(
        "STABLE FACE TRACK"
      );
    }

    previousFaceSignatureRef.current =
      current;
  }

  function updateFacePresence(
    detected
  ) {
    const total =
      Math.max(
        totalFaceFramesRef.current,
        1
      );

    const presence =
      facePresenceFramesRef.current;

    const score =
      clamp(
        (presence /
          total) *
          100
      );

    const display =
      detected
        ? Math.max(
            Math.round(
              score
            ),
            50
          )
        : Math.round(
            score
          );

    setFacePresenceScore(
      display
    );

    facePresenceRiskRef.current =
      clamp(
        100 - display
      );
  }

  function resetConsistency() {
    previousFaceSignatureRef.current =
      null;

    consistencyHistoryRef.current =
      [];

    facePresenceFramesRef.current =
      0;

    totalFaceFramesRef.current =
      0;

    faceCountRef.current =
      0;

    consistencyRiskRef.current =
      0;

    facePresenceRiskRef.current =
      0;

    setConsistencyScore(
      100
    );

    setConsistencyRisk(
      0
    );

    setFacePresenceScore(
      100
    );

    setConsistencyStatus(
      "WAITING"
    );
  }

  // ==========================================================
  // VOICE
  // ==========================================================

  async function startVoiceAnalysis(
    remoteStream
  ) {
    voiceAnalysisSettledRef.current = false;
    try {
      const tracks =
        remoteStream.getAudioTracks();

      if (!tracks.length) {
        setVoiceProfileStatus(
          "NO AUDIO TRACK"
        );

        voiceRiskRef.current =
          null;
        voiceAnalysisSettledRef.current = true;

        return;
      }

      stopVoiceAnalysis();

      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          "Web Audio API unavailable."
        );
      }

      const audioContext =
        new AudioContextClass();

      const source =
        audioContext.createMediaStreamSource(
          remoteStream
        );

      const analyser =
        audioContext.createAnalyser();

      analyser.fftSize =
        2048;

      analyser.smoothingTimeConstant =
        0.75;

      source.connect(
        analyser
      );

      audioContextRef.current =
        audioContext;

      audioSourceRef.current =
        source;

      analyserRef.current =
        analyser;

      voiceHistoryRef.current =
        [];

      if (
        audioContext.state ===
        "suspended"
      ) {
        try {
          await audioContext.resume();
        } catch {}
      }

      setVoiceProfileStatus(
        "CALIBRATING VOICE"
      );
    } catch (err) {
      console.error(
        "Voice analysis error:",
        err
      );

      setVoiceProfileStatus(
        "VOICE ANALYSIS UNAVAILABLE"
      );

      voiceRiskRef.current =
        null;
      voiceAnalysisSettledRef.current = true;
    }
  }

  function analyzeVoiceFrame() {
    const analyser =
      analyserRef.current;

    if (!analyser) {
      return;
    }

    const now =
      performance.now();

    if (
      now -
        lastVoiceAnalysisRef.current <
      250
    ) {
      return;
    }

    lastVoiceAnalysisRef.current =
      now;

    const timeData =
      new Uint8Array(
        analyser.fftSize
      );

    const frequencyData =
      new Uint8Array(
        analyser.frequencyBinCount
      );

    analyser.getByteTimeDomainData(
      timeData
    );

    analyser.getByteFrequencyData(
      frequencyData
    );

    let sumSquares =
      0;

    for (
      let i = 0;
      i < timeData.length;
      i++
    ) {
      const normalized =
        (timeData[i] -
          128) /
        128;

      sumSquares +=
        normalized *
        normalized;
    }

    const rms =
      Math.sqrt(
        sumSquares /
          timeData.length
      );

    const db =
      20 *
      Math.log10(
        Math.max(
          rms,
          0.0001
        )
      );

    const signalLevel =
      clamp(
        ((db + 60) /
          60) *
          100
      );

    setVoiceSignal(
      Math.round(
        signalLevel
      )
    );

    const isSpeechLike =
      rms > 0.018;

    let crossings =
      0;

    for (
      let i = 1;
      i < timeData.length;
      i++
    ) {
      const prev =
        timeData[i - 1] -
        128;

      const curr =
        timeData[i] -
        128;

      if (
        (prev < 0 &&
          curr >= 0) ||
        (prev >= 0 &&
          curr < 0)
      ) {
        crossings +=
          1;
      }
    }

    const zcr =
      crossings /
      timeData.length;

    let weightedFrequency =
      0;

    let totalMagnitude =
      0;

    const sampleRate =
      audioContextRef.current
        ?.sampleRate ||
      48000;

    for (
      let i = 0;
      i <
      frequencyData.length;
      i++
    ) {
      const magnitude =
        frequencyData[i];

      const frequency =
        (i * sampleRate) /
        (2 *
          frequencyData.length);

      weightedFrequency +=
        frequency *
        magnitude;

      totalMagnitude +=
        magnitude;
    }

    const centroid =
      totalMagnitude >
      0
        ? weightedFrequency /
          totalMagnitude
        : 0;

    let lowEnergy =
      0;

    let highEnergy =
      0;

    const midpoint =
      Math.floor(
        frequencyData.length *
          0.55
      );

    for (
      let i = 0;
      i <
      frequencyData.length;
      i++
    ) {
      if (
        i < midpoint
      ) {
        lowEnergy +=
          frequencyData[i];
      } else {
        highEnergy +=
          frequencyData[i];
      }
    }

    const hfRatio =
      highEnergy /
      Math.max(
        lowEnergy +
          highEnergy,
        1
      );

    if (
      isSpeechLike
    ) {
      voiceHistoryRef.current.push(
        {
          db,
          zcr,
          centroid,
          hfRatio,
        }
      );

      if (
        voiceHistoryRef.current
          .length >
        24
      ) {
        voiceHistoryRef.current.shift();
      }
    }

    const history =
      voiceHistoryRef.current;

    setSpeechActivity(
      Math.round(
        clamp(
          (history.length /
            24) *
            100
        )
      )
    );

    if (
      history.length <
      6
    ) {
      return;
    }

    const dbValues =
      history.map(
        (item) =>
          item.db
      );

    const centroidValues =
      history.map(
        (item) =>
          item.centroid
      );

    const zcrValues =
      history.map(
        (item) =>
          item.zcr
      );

    const dbMean =
      average(
        dbValues
      );

    const centroidMean =
      average(
        centroidValues
      );

    const zcrMean =
      average(
        zcrValues
      );

    const dbVariation =
      Math.sqrt(
        average(
          dbValues.map(
            (value) =>
              Math.pow(
                value -
                  dbMean,
                2
              )
          )
        )
      );

    const centroidVariation =
      Math.sqrt(
        average(
          centroidValues.map(
            (value) =>
              Math.pow(
                value -
                  centroidMean,
                2
              )
          )
        )
      );

    const zcrVariation =
      Math.sqrt(
        average(
          zcrValues.map(
            (value) =>
              Math.pow(
                value -
                  zcrMean,
                2
              )
          )
        )
      );

    let anomaly =
      0;

    if (
      dbVariation <
      1.8
    ) {
      anomaly +=
        18;
    }

    if (
      centroidVariation <
      130
    ) {
      anomaly +=
        18;
    }

    if (
      zcrVariation <
      0.008
    ) {
      anomaly +=
        18;
    }

    if (
      centroidMean >
      4200
    ) {
      anomaly +=
        12;
    }

    const hfAverage =
      average(
        history.map(
          (item) =>
            item.hfRatio
        )
      );

    if (
      hfAverage >
      0.48
    ) {
      anomaly +=
        10;
    }

    if (
      dbVariation >
      5
    ) {
      anomaly -=
        12;
    }

    if (
      centroidVariation >
      500
    ) {
      anomaly -=
        12;
    }

    if (
      zcrVariation >
      0.03
    ) {
      anomaly -=
        8;
    }

    anomaly =
      clamp(
        anomaly
      );

    const value =
      Math.round(
        anomaly
      );

    voiceRiskRef.current =
      value;
    voiceAnalysisSettledRef.current = true;

    setVoiceAnomalyRisk(
      value
    );

    if (
      value >= 70
    ) {
      setVoiceProfileStatus(
        "REVIEW SYNTHETIC-VOICE SIGNALS"
      );
    } else if (
      value >= 35
    ) {
      setVoiceProfileStatus(
        "VOICE SIGNAL ANOMALY"
      );
    } else {
      setVoiceProfileStatus(
        "NO STRONG VOICE ANOMALY"
      );
    }
  }

  function resetVoiceAnalysis() {
    voiceHistoryRef.current =
      [];

    lastVoiceAnalysisRef.current =
      0;

    voiceRiskRef.current =
      null;
    voiceAnalysisSettledRef.current = false;

    setVoiceSignal(
      0
    );

    setSpeechActivity(
      0
    );

    setVoiceAnomalyRisk(
      null
    );

    setVoiceProfileStatus(
      "WAITING FOR AUDIO"
    );
  }

  function stopVoiceAnalysis() {
    if (
      audioSourceRef.current
    ) {
      try {
        audioSourceRef.current.disconnect();
      } catch {}

      audioSourceRef.current =
        null;
    }

    if (
      analyserRef.current
    ) {
      try {
        analyserRef.current.disconnect();
      } catch {}

      analyserRef.current =
        null;
    }

    if (
      audioContextRef.current
    ) {
      try {
        audioContextRef.current.close();
      } catch {}

      audioContextRef.current =
        null;
    }

    resetVoiceAnalysis();
  }

  // ==========================================================
  // RISK FUSION
  // ==========================================================

  function fuseRisk() {
    // The animation loop may retain an older React state closure, so read refs.
    if (!remoteConnectedRef.current) {
      return;
    }

    const challengeFinished =
      challengeRef.current === "PASSED" ||
      challengeRef.current === "FAILED";
    const enoughSignals =
      frameDiffHistoryRef.current.length >= 12 &&
      (challengeFinished || livenessFailureCountRef.current >= 2 || replayRiskRef.current >= 65);

    if (!enoughSignals) {
      setRiskScore(null);
      setRiskLevel("ANALYZING");
      setRiskReasons(["Waiting for the liveness challenge and signal samples to finish"]);
      setWarningVisible(false);
      return;
    }

    const result = calculateTrustGuardRisk({
      replayRisk:
        replayRiskRef.current,
      livenessRisk: livenessRiskRef.current,
      livenessCompleted: challengeFinished,
      livenessFailed: livenessFailedRef.current,
      livenessFailureCount: livenessFailureCountRef.current,
      faceConsistencyRisk: consistencyRiskRef.current,
      voiceRisk: voiceRiskRef.current,
      facePresenceRisk: facePresenceRiskRef.current,
    });

    const faces = faceCountRef.current;
    const reasons = [...result.reasons];

    if (orderedLoopDetectedRef.current) {
      reasons.push("A repeating visual sequence was detected; possible replay loop — pause and verify independently");
    }

    if (faces > 1) {
      reasons.push("Multiple faces detected; review the call");
    }

    const finalScore = result.score;
    const level = result.level;

    setRiskScore(finalScore);
    setRiskLevel(level);
    setRiskReasons([...new Set(reasons)]);
    setWarningVisible(level === "HIGH");

  }

  // ==========================================================
  // RESET
  // ==========================================================

  function resetAllAnalysis() {
    livenessFailureCountRef.current = 0;
    resetLiveness();
    resetReplayAnalysis();
    resetConsistency();
    resetVoiceAnalysis();

    faceCountRef.current =
      0;

    livenessRiskRef.current =
      0;

    replayRiskRef.current =
      0;

    consistencyRiskRef.current =
      0;

    voiceRiskRef.current =
      null;

    facePresenceRiskRef.current =
      0;

    setFaceStatus(
      "WAITING"
    );

    setFaceCount(
      0
    );

    setAnalysisStatus(
      "WAITING FOR VIDEO"
    );

    setRiskScore(
      null
    );

    setRiskLevel(
      "ANALYZING"
    );

    setRiskReasons(
      []
    );

    setWarningVisible(
      false
    );
  }

  function stopAnalysis() {
    if (
      animationRef.current
    ) {
      cancelAnimationFrame(
        animationRef.current
      );

      animationRef.current =
        null;
    }

    if (
      landmarkerRef.current
    ) {
      try {
        landmarkerRef.current.close();
      } catch {}

      landmarkerRef.current =
        null;
    }

    stopVoiceAnalysis();

    resetLiveness();
    resetReplayAnalysis();
    resetConsistency();

    setRiskScore(
      null
    );

    setRiskLevel(
      "ANALYZING"
    );

    setRiskReasons(
      []
    );

    setWarningVisible(
      false
    );

    if (
      overlayCanvasRef.current
    ) {
      const canvas =
        overlayCanvasRef.current;

      const ctx =
        canvas.getContext(
          "2d"
        );

      if (ctx) {
        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
      }
    }
  }

  function disconnectCall() {
    challengeChannelRef.current?.close();
    challengeChannelRef.current = null;
    if (
      activeCallRef.current
    ) {
      try {
        activeCallRef.current.close();
      } catch {}

      activeCallRef.current =
        null;
    }

    if (
      remoteVideoRef.current
    ) {
      remoteVideoRef.current.pause();

      remoteVideoRef.current.srcObject =
        null;
    }

    remoteStreamRef.current =
      null;

    remoteConnectedRef.current =
      false;

    setRemoteConnected(
      false
    );

    setRemotePlaybackBlocked(
      false
    );

    remoteAudioEnabledRef.current = false;
    setRemoteAudioEnabled(false);
    setRemoteAudioAvailable(false);

    setCallStatus(
      "WAITING"
    );

    setAnalysisStatus(
      "WAITING FOR VIDEO"
    );

    resetAllAnalysis();
  }

  function cleanupEverything() {
    challengeChannelRef.current?.close();
    challengeChannelRef.current = null;
    stopAnalysis();

    if (
      activeCallRef.current
    ) {
      try {
        activeCallRef.current.close();
      } catch {}

      activeCallRef.current =
        null;
    }

    if (
      peerRef.current
    ) {
      try {
        peerRef.current.destroy();
      } catch {}

      peerRef.current =
        null;
    }

    if (
      analystStreamRef.current
    ) {
      analystStreamRef.current
        .getTracks()
        .forEach(
          (track) => {
            try {
              track.stop();
            } catch {}
          }
        );

      analystStreamRef.current =
        null;
    }
  }

  // ==========================================================
  // DRAW
  // ==========================================================

  function drawFaces(
    ctx,
    faces,
    canvas
  ) {
    if (
      !ctx ||
      !canvas
    ) {
      return;
    }

    faces.forEach(
      (landmarks) => {
        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;

        landmarks.forEach(
          (point) => {
            minX =
              Math.min(
                minX,
                point.x
              );

            minY =
              Math.min(
                minY,
                point.y
              );

            maxX =
              Math.max(
                maxX,
                point.x
              );

            maxY =
              Math.max(
                maxY,
                point.y
              );
          }
        );

        const x =
          minX *
          canvas.width;

        const y =
          minY *
          canvas.height;

        const width =
          (maxX -
            minX) *
          canvas.width;

        const height =
          (maxY -
            minY) *
          canvas.height;

        const good =
          faces.length ===
          1;

        ctx.strokeStyle =
          good
            ? "#44ff9a"
            : "#ff4d6d";

        ctx.lineWidth = 4;

        ctx.strokeRect(
          x,
          y,
          width,
          height
        );

        ctx.fillStyle =
          good
            ? "#44ff9a"
            : "#ff4d6d";

        ctx.font =
          "bold 16px Arial";

        ctx.fillText(
          "FACE",
          x,
          Math.max(
            20,
            y - 8
          )
        );
      }
    );
  }

  function drawMessage(
    ctx,
    message,
    color
  ) {
    if (!ctx) {
      return;
    }

    ctx.fillStyle =
      color;

    ctx.font =
      "bold 18px Arial";

    ctx.fillText(
      message,
      20,
      35
    );
  }

  async function copyAnalystId() {
    if (!analystPeerId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        analystPeerId
      );

      setError(
        "Analyst ID copied."
      );

      setTimeout(
        () => setError(""),
        1500
      );
    } catch {
      setError(
        "Could not copy Analyst ID."
      );
    }
  }

  return (
    <div className="liveguard-page">

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="lg-back"
          style={{
            marginBottom: "14px",
            padding: "9px 12px",
            border: "1px solid #263240",
            borderRadius: "8px",
            background: "#121b26",
            color: "#c0cad6",
            fontSize: "11px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ← Back to Home
        </button>
      )}

      <div className="liveguard-header">

        <div>

          <div className="liveguard-eyebrow">
            <img className="tg-approved-logo" src="/brand/trustguard-logo.png" alt="TrustGuard AI" width="2172" height="724" />
          </div>

          <h1>
            Live Guard
          </h1>

          <p>
            A calmer way to review a live call. Connect, observe, then verify.
          </p>

        </div>

        <div
          className={`service-badge ${serviceStatus.toLowerCase()}`}
        >
          <span className="status-dot" />

          CALL SERVICE{" "}

          {serviceStatus}
        </div>

      </div>

      <LiveGuardGuide />

      {warningVisible && (
        <div
          style={{
            marginBottom: "18px",
            padding: "18px 20px",
            border:
              "1px solid #713142",
            borderRadius: "14px",
            background:
              "linear-gradient(135deg,#1d0d14,#140a10)",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "20px",
          }}
        >

          <div>

            <div
              style={{
                color:
                  "#ff4d6d",
                fontSize:
                  "10px",
                fontWeight: 900,
                letterSpacing:
                  "0.14em",
              }}
            >
              🚨 TRUSTGUARD WARNING
            </div>

            <div
              style={{
                marginTop: "5px",
                color:
                  "#ffffff",
                fontSize:
                  "18px",
                fontWeight:
                  900,
              }}
            >
              HIGH-RISK SIGNALS — VERIFY INDEPENDENTLY
            </div>

            <div
              style={{
                marginTop: "5px",
                color:
                  "#ac7d88",
                fontSize:
                  "11px",
              }}
            >
              Live verification signals
              indicate that additional
              verification is required.
            </div>

          </div>

          <div
            style={{
              minWidth: "90px",
              textAlign:
                "center",
            }}
          >

            <div
              style={{
                color:
                  "#ff4d6d",
                fontSize:
                  "30px",
                fontWeight:
                  900,
              }}
            >
              {riskScore == null ? "—" : riskScore}
            </div>

            <div
              style={{
                color:
                  "#9c6572",
                fontSize:
                  "9px",
                fontWeight:
                  800,
              }}
            >
              / 100 RISK
            </div>

          </div>

        </div>
      )}

          {/* CONNECTION */}

          <div className="connection-card">

            <span className="card-label">
              01 · CONNECT YOUR CALL
            </span>

            <label className="input-label" htmlFor="live-caller-id">
              Caller ID
            </label>

            <input
              className="caller-input"
              id="live-caller-id"
              value={callerId}
              onChange={(e) =>
                setCallerId(
                  e.target.value
                )
              }
              placeholder="Paste phone Caller ID"
            />

            <button
              className="connect-button"
              onClick={
                connectToCaller
              }
              disabled={
                !analystPeerId ||
                !callerId.trim() ||
                remoteConnected
              }
              type="button"
            >
              {remoteConnected
                ? "CALL CONNECTED"
                : "CONNECT TO CALLER"}
            </button>

            <div className="call-status">

              <span
                className={
                  callStatus ===
                  "CONNECTED"
                    ? "status-good"
                    : "status-neutral"
                }
              >
                ●
              </span>

              {callStatus}

            </div>

            <details className="lg-advanced"><summary>Connection details</summary>
            <div className="id-block">

              <span>
                Your Analyst ID
              </span>

              <div className="id-row">

                <code>
                  {analystPeerId ||
                    "Generating..."}
                </code>

                <button
                  className="small-button"
                  onClick={
                    copyAnalystId
                  }
                  disabled={
                    !analystPeerId
                  }
                  type="button"
                >
                  Copy
                </button>

              </div>

            </div>

            </details>
          </div>

      <div className="liveguard-grid">

        {/* REMOTE VIDEO */}

        <section className="video-card">

          <div className="card-header">

            <div>

              <span className="card-label">
                REMOTE CALLER
              </span>

              <h2>
                {remoteConnected
                  ? "Protected video session"
                  : "Waiting for caller"}
              </h2>

            </div>

            <div className="connection-state">
              {remoteConnected
                ? "● LIVE"
                : "○ OFFLINE"}
            </div>

          </div>

          <div className="remote-video-wrapper">

            <video
              ref={remoteVideoRef}
              className="remote-video"
              autoPlay
              muted={!remoteAudioEnabled}
              playsInline
            />

            <canvas
              ref={overlayCanvasRef}
              className="face-overlay"
            />

            {!remoteConnected && (
              <div className="video-placeholder">

                <div className="placeholder-icon">
                  ◉
                </div>

                <strong>
                  Waiting for caller
                </strong>

                <span>
                  Enter the Caller ID
                  generated on the phone.
                </span>

              </div>
            )}

            {remoteConnected &&
              remotePlaybackBlocked && (
                <div
                  style={{
                    position:
                      "absolute",
                    inset: 0,
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    flexDirection:
                      "column",
                    gap: "10px",
                    background:
                      "rgba(2,7,11,0.94)",
                    zIndex: 10,
                  }}
                >

                  <strong
                    style={{
                      color:
                        "#dce7ed",
                      fontSize:
                        "12px",
                    }}
                  >
                    Remote video ready
                  </strong>

                  <button
                    type="button"
                    onClick={
                      manualPlayRemote
                    }
                    style={{
                      border:
                        "1px solid #31556a",
                      borderRadius:
                        "8px",
                      padding:
                        "10px 14px",
                      background:
                        "#10222d",
                      color:
                        "#8fc8e4",
                      cursor:
                        "pointer",
                      fontSize:
                        "10px",
                      fontWeight:
                        800,
                    }}
                  >
                    PLAY REMOTE VIDEO
                  </button>

                </div>
              )}

            {remoteConnected && (
              <div className="video-live-tag">
                <span />
                CONNECTED · SIGNAL REVIEW
              </div>
            )}

          </div>

          <div className="video-footer">

            <span>
              02 · WATCH & COMPLETE THE CHALLENGE
            </span>

            {remoteConnected && (
              <div
                className="liveguard-call-controls"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  className="small-button"
                  onClick={toggleRemoteAudio}
                  type="button"
                  disabled={!remoteAudioAvailable}
                >
                  {remoteAudioEnabled
                    ? "Mute caller audio"
                    : remoteAudioAvailable
                      ? "Enable caller audio"
                      : "No caller audio track"}
                </button>
                <button
                  className="danger-button"
                  onClick={disconnectCall}
                  type="button"
                >
                  End Call
                </button>
              </div>
            )}

          </div>

        </section>

        {/* ANALYSIS */}

        <aside className="analysis-panel">

          <section className="analysis-card lg-live-checks" aria-live="polite">
            <div className="analysis-title-row"><div><span className="card-label">LIVE CHECKS</span><h2>Movement & replay</h2></div></div>
            <SignalBox title="LIVENESS / MOVEMENT" value={livenessScore == null ? (remoteConnected ? "Waiting for one face" : "Waiting for caller") : `${livenessScore}% challenge progress`} status={livenessStatus} good={livenessStatus === "LIVENESS VERIFIED"} />
            <p className="lg-caption">The check starts automatically when one face is visible. Follow the on-screen prompt, turn gently, and hold for half a second. If a try is missed, it retries automatically.</p>
            <SignalBox title="FREEZE / LOOP CHECK" value={videoRiskStatus === "WAITING" ? "Collecting frames" : `${replayScore}/100 indication`} status={videoRiskStatus} good={videoRiskStatus === "NO LOOP SEEN IN SAMPLED FRAMES"} />
            <p className="lg-caption">No loop seen does not prove the caller is live. Movement prompts check for a live response.</p>
          </section>
          <section className={`analysis-card lg-risk ${riskLevel.toLowerCase()}`} aria-live="polite">
            <div className="analysis-title-row"><div><span className="card-label">03 · REVIEW THE SIGNALS</span><h2>Call risk overview</h2></div><span className="lg-risk-status">{riskScore == null ? "Waiting for evidence" : riskLevel}</span></div>
            <div className="lg-risk-number">{riskScore == null ? "—" : riskScore}<small>{riskScore == null ? "No score yet" : " / 100"}</small></div>
            <div className="lg-risk-track"><span style={{ width: `${riskScore ?? 0}%` }} /></div>
            <div className="lg-bands"><span>0–29 · Low</span><span>30–50 · Review</span><span>51–100 · High</span></div>
            <p className="lg-recommendation">{riskLevel === "HIGH" ? "Pause the call and verify through an official channel." : riskLevel === "MEDIUM" ? "Review the clues and verify independently before proceeding." : riskScore == null ? "Connect a caller, keep their face visible, and complete the movement challenge." : "Fewer warning signals found. Verify independently before sharing money or personal details."}</p>
            {riskReasons.length > 0 && <ul className="lg-reasons">{riskReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            <p className="lg-caption">A signal assessment, not proof of identity, AI generation, or fraud.</p>
          </section>

          {/* MEDIA */}
          <details className="analysis-card lg-details">
            <summary>Explore signal details <span>＋</span></summary>
            <div>

            <div className="analysis-title-row">

              <div>

                <span className="card-label">
                  MEDIA SIGNALS
                </span>

                <h2>
                  Live Forensics
                </h2>
                <p className="analysis-substatus">{analysisStatus}</p>

              </div>

              <div className="analysis-pulse">
                {remoteConnected
                  ? "LIVE"
                  : "IDLE"}
              </div>

            </div>

            <div className="metric-list">

              <div className="metric">
                <span>
                  Face
                </span>

                <strong>
                  {faceStatus}
                </strong>
              </div>

              <div className="metric">
                <span>
                  Faces
                </span>

                <strong>{faceStatus === "WAITING" ? "—" : faceCount}</strong>
              </div>

              <div className="metric">
                <span>
                  Face presence
                </span>

                <strong>{faceStatus === "WAITING" ? "—" : `${facePresenceScore}%`}</strong>
              </div>

              <div className="metric">
                <span>Frame freshness</span>
                <strong>{videoRiskStatus === "WAITING" ? "—" : frameFreshness + "%"}</strong>
              </div>

              <div className="metric">
                <span>Landmark geometry consistency</span>
                <strong>{consistencyStatus === "WAITING" ? "—" : `${consistencyScore}%`}</strong>
              </div>

            </div>

            <SignalBox
              title="CHALLENGE PROGRESS"
              value={livenessScore == null ? "—" : `${livenessScore}%`}
              status={
                livenessStatus
              }
              good={livenessStatus === "LIVENESS VERIFIED"}
            />

            <SignalBox
              title="FACE CONSISTENCY"
              value={consistencyStatus === "WAITING" ? "—" : `${consistencyRisk}/100 RISK`}
              status={
                consistencyStatus
              }
              good={
                consistencyStatus === "STABLE FACE TRACK"
              }
            />

            <SignalBox
              title="REPLAY / FROZEN-FRAME CUES"
              value={videoRiskStatus === "WAITING" ? "—" : `${replayScore}% RISK`}
              status={
                videoRiskStatus
              }
              good={
                videoRiskStatus === "NO LOOP SEEN IN SAMPLED FRAMES"
              }
            />

            <SignalBox
              title="VOICE ANALYSIS"
              value={voiceAnomalyRisk == null ? "—" : `${voiceAnomalyRisk}/100 RISK`}
              status={
                voiceProfileStatus
              }
              good={
                voiceAnomalyRisk != null && voiceAnomalyRisk < 35 && voiceProfileStatus === "NO STRONG VOICE ANOMALY"
              }
            />

            <div className="metric-list voice-metrics">
              <div className="metric"><span>Audio signal level</span><strong>{voiceProfileStatus.includes("WAITING") || voiceProfileStatus.includes("UNAVAILABLE") || voiceProfileStatus.includes("NO AUDIO") ? "—" : `${voiceSignal}%`}</strong></div>
              <div className="metric"><span>Recent speech-like samples</span><strong>{voiceProfileStatus.includes("WAITING") || voiceProfileStatus.includes("UNAVAILABLE") || voiceProfileStatus.includes("NO AUDIO") ? "—" : `${speechActivity}%`}</strong></div>
            </div>

            </div>
          </details>


        </aside>

      </div>

      {error && (
        <div className="liveguard-message">
          {error}
        </div>
      )}

      <p className="lg-bottom-note">Stay in control. End the session whenever you need to; no single signal should decide for you.</p>

    </div>
  );
}

function SignalBox({ title, value, status, good }) {
  const waiting = /WAITING|UNAVAILABLE|NO AUDIO|IDLE/.test(status);
  return <div className={`lg-signal-box ${waiting ? "waiting" : good ? "good" : "review"}`}>
    <div><span>{title}</span><strong>{value}</strong></div>
    <p>{status}</p>
  </div>;
}

export default LiveGuard;
