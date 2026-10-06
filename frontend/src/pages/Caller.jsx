import { useEffect, useRef, useState } from "react";
import { Peer } from "peerjs";
import "./Caller.css";

const ROOM_ID = "TG-001";

function Caller() {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const activeCallRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const outgoingStreamRef = useRef(null);
  const fileVideoRef = useRef(null);
  const fileCanvasRef = useRef(null);
  const fileCanvasStreamRef = useRef(null);
  const fileVideoTrackRef = useRef(null);
  const objectUrlRef = useRef(null);
  const animationFrameRef = useRef(null);
  const startCallerRef = useRef(null);
  const cleanupCallerRef = useRef(null);

  const [peerId, setPeerId] = useState("");
  const [connected, setConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [sourceMode, setSourceMode] = useState("camera");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedVideoName, setSelectedVideoName] = useState("");
  const [status, setStatus] = useState("Starting...");
  const [error, setError] = useState("");
  const [switchingVideo, setSwitchingVideo] = useState(false);

  startCallerRef.current = startCaller;
  cleanupCallerRef.current = cleanupCaller;

  useEffect(() => {
    startCallerRef.current?.();
    return () => cleanupCallerRef.current?.();
  }, []);

  async function startCaller() {
    try {
      setError("");
      setStatus("Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
        },
        audio: true,
      });

      cameraStreamRef.current = stream;
      outgoingStreamRef.current = stream;

      const cameraTrack = stream.getVideoTracks()[0];
      const microphoneTrack = stream.getAudioTracks()[0];

      setCameraOn(Boolean(cameraTrack));
      setMicOn(Boolean(microphoneTrack));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.removeAttribute("src");
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;

        try {
          await videoRef.current.play();
        } catch {}
      }

      createPeer();
    } catch (err) {
      console.error("Camera error:", err);
      setStatus("Camera unavailable");
      setError("TrustGuard could not access the camera or microphone.");
    }
  }

  function createPeer() {
    setStatus("Connecting to secure call service...");
    setError("");

    try {
      const peer = new Peer();
      peerRef.current = peer;

      peer.on("open", (id) => {
        console.log("✅ PeerJS connected:", id);
        setPeerId(id);
        setConnected(true);
        setStatus("Ready • Waiting for analyst");
        setError("");
      });

      peer.on("call", (call) => {
        console.log("📞 Incoming analyst call");

        const stream =
          outgoingStreamRef.current || cameraStreamRef.current;

        if (!stream) {
          setError("Local media stream is unavailable.");
          return;
        }

        try {
          activeCallRef.current = call;
          call.answer(stream);

          setStatus(
            sourceMode === "video"
              ? "Connected • Prepared video is live"
              : "Connected to TrustGuard analyst"
          );

          call.on("close", () => {
            console.log("📴 Analyst call closed");
            activeCallRef.current = null;

            setStatus(
              sourceMode === "video"
                ? "Prepared video ready • Waiting for analyst"
                : "Ready • Waiting for analyst"
            );
          });

          call.on("error", (err) => {
            console.error("Call error:", err);
            setStatus("Call error");
            setError(`WebRTC error: ${err.type || "unknown"}`);
          });
        } catch (err) {
          console.error("Answer error:", err);
          setStatus("Call error");
          setError("Could not answer the analyst call.");
        }
      });

      peer.on("disconnected", () => {
        setConnected(false);
        setStatus("Call service disconnected");
      });

      peer.on("close", () => {
        setConnected(false);
        setStatus("Call service closed");
      });

      peer.on("error", (err) => {
        console.error("PeerJS error:", err);
        setConnected(false);
        setStatus("Connection failed");
        setError(`PeerJS error: ${err.type || "unknown error"}`);
      });
    } catch (err) {
      console.error("Peer creation error:", err);
      setConnected(false);
      setStatus("Connection failed");
      setError("Could not start the TrustGuard secure call connection.");
    }
  }

  async function replaceOutgoingTrack(newVideoTrack) {
    const call = activeCallRef.current;

    if (!call) {
      return;
    }

    const pc = call.peerConnection;

    if (!pc) {
      console.warn("PeerConnection not ready yet.");
      return;
    }

    let sender = pc
      .getSenders()
      .find(
        (item) =>
          item.track &&
          item.track.kind === "video"
      );

    if (!sender) {
      const videoTransceiver = pc
        .getTransceivers()
        .find(
          (item) =>
            item.sender &&
            item.sender.track &&
            item.sender.track.kind === "video"
        );

      sender = videoTransceiver?.sender;
    }

    if (!sender) {
      throw new Error("WebRTC video sender not found.");
    }

    await sender.replaceTrack(newVideoTrack);
    console.log("✅ WebRTC outgoing video replaced");
  }

  async function waitForMetadata(video) {
    if (video.readyState >= 1) {
      return;
    }

    await new Promise((resolve, reject) => {
      const loaded = () => {
        cleanup();
        resolve();
      };

      const failed = () => {
        cleanup();
        reject(new Error("Video could not be loaded."));
      };

      const cleanup = () => {
        video.removeEventListener("loadedmetadata", loaded);
        video.removeEventListener("error", failed);
      };

      video.addEventListener("loadedmetadata", loaded, {
        once: true,
      });

      video.addEventListener("error", failed, {
        once: true,
      });
    });
  }

  async function createPreparedVideoStream(file) {
    stopPreparedVideo();

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = "auto";
    fileVideoRef.current = video;

    await waitForMetadata(video);

    /*
     * Mobile browsers normally allow this
     * because this function is triggered
     * directly from the user's button tap.
     */
    await video.play();

    /*
     * Preferred path:
     * draw the prepared video into a canvas
     * and stream the canvas.
     */
    if (HTMLCanvasElement.prototype.captureStream) {
      const canvas = document.createElement("canvas");
      const sourceWidth = video.videoWidth || 1280;
      const sourceHeight = video.videoHeight || 720;

      /*
       * Keep the original aspect ratio.
       */
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / sourceWidth);

      canvas.width = Math.max(
        320,
        Math.round(sourceWidth * scale)
      );

      canvas.height = Math.max(
        180,
        Math.round(sourceHeight * scale)
      );

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not create video canvas.");
      }

      fileCanvasRef.current = canvas;

      const canvasStream = canvas.captureStream(30);
      fileCanvasStreamRef.current = canvasStream;

      const videoTrack = canvasStream.getVideoTracks()[0];

      if (!videoTrack) {
        throw new Error("Could not create outgoing video track.");
      }

      const drawFrame = () => {
        if (!fileVideoRef.current || !fileCanvasRef.current) {
          return;
        }

        if (video.readyState >= 2) {
          ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        animationFrameRef.current =
          requestAnimationFrame(drawFrame);
      };

      drawFrame();
      fileVideoTrackRef.current = videoTrack;

      return {
        videoTrack,
        videoStream: canvasStream,
      };
    }

    /*
     * Fallback for browsers that support
     * video.captureStream but not canvas.captureStream.
     */
    let capturedStream = null;

    if (typeof video.captureStream === "function") {
      capturedStream = video.captureStream();
    } else if (typeof video.mozCaptureStream === "function") {
      capturedStream = video.mozCaptureStream();
    }

    if (!capturedStream) {
      throw new Error(
        "This mobile browser does not support prepared-video streaming."
      );
    }

    const videoTrack = capturedStream.getVideoTracks()[0];

    if (!videoTrack) {
      throw new Error("Prepared video track was not created.");
    }

    fileVideoTrackRef.current = videoTrack;

    return {
      videoTrack,
      videoStream: capturedStream,
    };
  }

  async function handleVideoFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }

    setSelectedVideo(file);
    setSelectedVideoName(file.name);
    setError("");
  }

  async function activateSelectedVideo() {
    if (!selectedVideo) {
      setError("Choose a video first.");
      return;
    }

    setSwitchingVideo(true);
    setError("");

    try {
      const { videoTrack } =
        await createPreparedVideoStream(selectedVideo);

      /*
       * Keep real microphone.
       */
      const microphoneTrack =
        cameraStreamRef.current?.getAudioTracks()[0];

      let outgoingStream;

      if (microphoneTrack) {
        outgoingStream = new MediaStream([
          videoTrack,
          microphoneTrack,
        ]);
      } else {
        outgoingStream = new MediaStream([videoTrack]);
      }

      outgoingStreamRef.current = outgoingStream;

      /*
       * Show selected video in the visible
       * phone preview.
       */
      const visibleVideo = videoRef.current;

      if (visibleVideo) {
        visibleVideo.pause();
        visibleVideo.srcObject = null;
        visibleVideo.src = objectUrlRef.current;
        visibleVideo.loop = true;
        visibleVideo.muted = true;
        visibleVideo.playsInline = true;

        try {
          await visibleVideo.play();
        } catch {}
      }

      /*
       * If a call already exists,
       * replace only the outgoing video.
       */
      if (activeCallRef.current) {
        await replaceOutgoingTrack(videoTrack);
      }

      setSourceMode("video");
      setCameraOn(false);

      setStatus(
        activeCallRef.current
          ? "Prepared video is LIVE"
          : "Prepared video ready • Waiting for analyst"
      );
    } catch (err) {
      console.error("Prepared video error:", err);

      setError(
        err.message || "Could not start the prepared video."
      );

      restoreCamera();
    } finally {
      setSwitchingVideo(false);
    }
  }

  async function switchToCamera() {
    const cameraStream = cameraStreamRef.current;
    const visibleVideo = videoRef.current;

    if (!cameraStream || !visibleVideo) {
      return;
    }

    const cameraTrack = cameraStream.getVideoTracks()[0];

    if (!cameraTrack) {
      setError("Camera video track is unavailable.");
      return;
    }

    try {
      cameraTrack.enabled = true;
      stopPreparedVideo();
      visibleVideo.pause();
      visibleVideo.removeAttribute("src");
      visibleVideo.srcObject = cameraStream;

      try {
        await visibleVideo.play();
      } catch {}

      outgoingStreamRef.current = cameraStream;

      if (activeCallRef.current) {
        await replaceOutgoingTrack(cameraTrack);
      }

      setSourceMode("camera");
      setCameraOn(true);

      setStatus(
        activeCallRef.current
          ? "Live camera is active"
          : "Camera ready • Waiting for analyst"
      );
    } catch (err) {
      console.error("Camera switch error:", err);

      setError(
        err.message || "Could not switch to camera."
      );
    }
  }

  function restoreCamera() {
    const cameraStream = cameraStreamRef.current;
    const visibleVideo = videoRef.current;

    if (!cameraStream || !visibleVideo) {
      return;
    }

    const track = cameraStream.getVideoTracks()[0];

    if (track) {
      track.enabled = true;
    }

    stopPreparedVideo();
    visibleVideo.pause();
    visibleVideo.removeAttribute("src");
    visibleVideo.srcObject = cameraStream;
    visibleVideo.play().catch(() => {});

    outgoingStreamRef.current = cameraStream;
    setSourceMode("camera");
    setCameraOn(true);
  }

  function stopPreparedVideo() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (fileVideoTrackRef.current) {
      try {
        fileVideoTrackRef.current.stop();
      } catch {}

      fileVideoTrackRef.current = null;
    }

    if (fileCanvasStreamRef.current) {
      fileCanvasStreamRef.current
        .getTracks()
        .forEach((track) => {
          try {
            track.stop();
          } catch {}
        });

      fileCanvasStreamRef.current = null;
    }

    fileVideoRef.current = null;
    fileCanvasRef.current = null;

    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {}

      objectUrlRef.current = null;
    }
  }

  function toggleCamera() {
    if (sourceMode !== "camera") {
      setError(
        "Prepared video is active. Tap Use Camera first."
      );
      return;
    }

    const track =
      cameraStreamRef.current?.getVideoTracks()[0];

    if (!track) {
      return;
    }

    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }

  function toggleMic() {
    const track =
      cameraStreamRef.current?.getAudioTracks()[0];

    if (!track) {
      return;
    }

    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  async function copyPeerId() {
    if (!peerId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(peerId);
      setStatus("Caller ID copied");

      setTimeout(() => {
        setStatus(
          activeCallRef.current
            ? sourceMode === "video"
              ? "Prepared video is LIVE"
              : "Connected to TrustGuard analyst"
            : "Ready • Waiting for analyst"
        );
      }, 1200);
    } catch {
      console.log("Caller ID:", peerId);
    }
  }

  function reconnect() {
    cleanupPeer();
    setConnected(false);
    setPeerId("");
    setError("");
    createPeer();
  }

  function cleanupPeer() {
    if (activeCallRef.current) {
      try {
        activeCallRef.current.close();
      } catch {}

      activeCallRef.current = null;
    }

    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}

      peerRef.current = null;
    }
  }

  function cleanupCaller() {
    cleanupPeer();
    stopPreparedVideo();

    if (cameraStreamRef.current) {
      cameraStreamRef.current
        .getTracks()
        .forEach((track) => {
          try {
            track.stop();
          } catch {}
        });

      cameraStreamRef.current = null;
    }

    outgoingStreamRef.current = null;
  }

  return (
    <div className="caller-page">
      <button
        type="button"
        onClick={() => {
          window.location.href = "/";
        }}
        style={{
          margin: "14px 20px 0",
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
        ← Leave call and return home
      </button>

      <header className="caller-header">
        <div className="caller-brand">
          <img className="tg-approved-logo" src="/brand/trustguard-logo.png" alt="TrustGuard AI" width="2172" height="724" />
        </div>

        <div
          className={`connection-status ${
            connected ? "connected" : "disconnected"
          }`}
        >
          <span />
          {connected ? "CALL SERVICE READY" : status.toUpperCase()}
        </div>
      </header>

      <main className="caller-content">
        <div className="caller-title">
          <div className="eyebrow">TRUSTGUARD / CALLER</div>
          <h1>Secure video call</h1>
          <p>
            Your camera is ready. The TrustGuard analyst can connect
            to this caller endpoint.
          </p>
        </div>

        {error && (
          <div className="caller-error">
            <div>
              <strong>Connection problem</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={reconnect}>
              Retry
            </button>
          </div>
        )}

        {!error && connected && (
          <div className="caller-success">
            <strong>Caller endpoint ready</strong>
            <p>Waiting for the TrustGuard analyst to join.</p>
          </div>
        )}

        <div className="caller-grid">
          <section className="video-panel">
            <div className="video-header">
              <div>
                <span>LIVE SOURCE</span>
                <strong>
                  {sourceMode === "camera"
                    ? "Caller camera"
                    : "Prepared video"}
                </strong>
              </div>

              <div
                className={
                  sourceMode === "camera"
                    ? cameraOn
                      ? "device-on"
                      : "device-off"
                    : "device-on"
                }
              >
                {sourceMode === "camera"
                  ? cameraOn
                    ? "● CAMERA ON"
                    : "● CAMERA OFF"
                  : "● VIDEO LIVE"}
              </div>
            </div>

            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
              />

              {sourceMode === "camera" && !cameraOn && (
                <div className="video-placeholder">
                  Camera is off
                </div>
              )}

              <div className="video-name">
                {sourceMode === "camera"
                  ? `Caller • ${ROOM_ID}`
                  : `Prepared • ${
                      selectedVideoName || "Video"
                    }`}
              </div>
            </div>

            <div className="controls">
              <button
                type="button"
                onClick={toggleCamera}
                disabled={sourceMode !== "camera"}
              >
                {cameraOn ? "Camera OFF" : "Camera ON"}
              </button>

              <button type="button" onClick={toggleMic}>
                {micOn ? "Mute" : "Unmute"}
              </button>
            </div>

            <div className="source-section">
              <div className="source-heading">
                <div>
                  <span>VIDEO SOURCE</span>
                  <strong>Switch the live feed</strong>
                </div>

                <div className="source-status">
                  {sourceMode === "camera" ? "CAMERA" : "FILE"}
                </div>
              </div>

              <div className="source-actions">
                <button
                  type="button"
                  className={
                    sourceMode === "camera"
                      ? "source-button active"
                      : "source-button"
                  }
                  onClick={switchToCamera}
                >
                  Use Camera
                </button>

                <label className="file-button">
                  Choose Video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) => {
                      handleVideoFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="selected-video">
                <div>
                  <span>SELECTED VIDEO</span>
                  <strong>
                    {selectedVideoName || "No video selected"}
                  </strong>
                </div>

                <button
                  type="button"
                  className="play-video-button"
                  onClick={activateSelectedVideo}
                  disabled={!selectedVideo || switchingVideo}
                >
                  {switchingVideo
                    ? "Loading..."
                    : sourceMode === "video"
                      ? "Video Active"
                      : "Play on Live Call"}
                </button>
              </div>
            </div>
          </section>

          <aside className="call-info">
            <div className="info-card">
              <span>CASE</span>
              <strong>{ROOM_ID}</strong>
            </div>

            <div className="info-card">
              <span>CALL SERVICE</span>
              <strong className={connected ? "green" : "red"}>
                {connected ? "READY" : "CONNECTING"}
              </strong>
            </div>

            <div className="peer-card">
              <span>CALLER ID</span>
              <strong>{peerId || "Generating..."}</strong>

              {peerId && (
                <button type="button" onClick={copyPeerId}>
                  Copy Caller ID
                </button>
              )}
            </div>

            <div className="info-card">
              <span>VIDEO SOURCE</span>
              <strong>
                {sourceMode === "camera"
                  ? "LIVE CAMERA"
                  : "PREPARED VIDEO"}
              </strong>
            </div>

            <div className="info-card">
              <span>CAMERA</span>
              <strong>
                {sourceMode === "video"
                  ? "REPLACED BY VIDEO"
                  : cameraOn
                    ? "ACTIVE"
                    : "OFF"}
              </strong>
            </div>

            <div className="info-card">
              <span>MICROPHONE</span>
              <strong>{micOn ? "ACTIVE" : "MUTED"}</strong>
            </div>

            <div className="demo-note">
              <strong>TrustGuard monitoring</strong>
              <p>
                The live WebRTC connection can switch between the
                phone camera and a prepared video source.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default Caller;
