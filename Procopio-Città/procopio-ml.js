// procopio-ml.js — Face + Hand tracking for home.html
// Face proximity  → blur on .custom-marker (20px far → 0px close)
// Hand palm size  → map zoom (hand closer = zoom in, farther = zoom out)

let procopioFaceDetector = null;
let procopioHandDetector = null;
let procopioIsDetecting  = false;
let procopioStream       = null;

// Face calibration
let faceSizeSamples  = [];
let faceSizeBaseline = null;
const FACE_CALIB_FRAMES = 50;

// Hand calibration
let handSizeSamples  = [];
let handSizeBaseline = null;
const HAND_CALIB_FRAMES = 40;

// Map zoom range
const ZOOM_MIN = 5.0;
const ZOOM_MAX = 10.5;

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function initProcopioTracking() {
  const statusEl = document.getElementById('face-status-label');
  if (statusEl) statusEl.textContent = 'loading models…';
  try {
    await tf.setBackend('webgl');
    await tf.ready();

    // Load face detector
    procopioFaceDetector = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: false,
        maxFaces: 1,
      }
    );

    // Load hand detector
    procopioHandDetector = await handPoseDetection.createDetector(
      handPoseDetection.SupportedModels.MediaPipeHands,
      {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
        modelType: 'lite',
        maxHands: 1,
      }
    );

    if (statusEl) statusEl.textContent = 'models ready';
    await startProcopioCamera();
  } catch (err) {
    if (statusEl) statusEl.textContent = 'error: ' + err.message;
  }
}

async function startProcopioCamera() {
  const video    = document.getElementById('face-webcam');
  const statusEl = document.getElementById('face-status-label');
  try {
    procopioStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = procopioStream;
    video.addEventListener('loadeddata', () => {
      procopioIsDetecting = true;
      if (statusEl) statusEl.textContent = '✓ camera on — calibrating…';
      detectLoop();
    }, { once: true });
    video.addEventListener('loadedmetadata', () => {
      if (!procopioIsDetecting) {
        procopioIsDetecting = true;
        detectLoop();
      }
    }, { once: true });
  } catch (err) {
    if (statusEl) statusEl.textContent = 'cam error: ' + err.message;
  }
}

async function detectLoop() {
  if (!procopioIsDetecting) return;
  const video    = document.getElementById('face-webcam');
  const statusEl = document.getElementById('face-status-label');
  const proxEl   = document.getElementById('face-prox-label');
  const calibEl  = document.getElementById('face-calib-label');
  const handEl   = document.getElementById('hand-size-label');

  // ── FACE → .custom-marker blur ───────────────────────────────────────────
  try {
    const faces = await procopioFaceDetector.estimateFaces(video, { flipHorizontal: true });
    if (faces.length > 0) {
      if (statusEl) statusEl.textContent = '✓ face';
      const kp        = faces[0].keypoints;
      const faceWidth = Math.abs(kp[454].x - kp[234].x);

      if (faceSizeSamples.length < FACE_CALIB_FRAMES) {
        faceSizeSamples.push(faceWidth);
        if (calibEl) calibEl.textContent = `calib: ${faceSizeSamples.length}/${FACE_CALIB_FRAMES}`;
        if (faceSizeSamples.length === FACE_CALIB_FRAMES) {
          faceSizeBaseline = faceSizeSamples.reduce((a, b) => a + b) / FACE_CALIB_FRAMES;
          if (calibEl) calibEl.textContent = `base: ${faceSizeBaseline.toFixed(0)}px`;
        }
      } else {
        const ratio = faceWidth / faceSizeBaseline;
        if (proxEl) proxEl.textContent = `${ratio.toFixed(2)}×`;
        // ratio 1.4+ (very close) → 0px blur; ratio 0.4 (very far) → 20px blur
        const blurT   = Math.max(0, Math.min(1, (ratio - 0.4) / (1.4 - 0.4)));
        const blurAmt = 20 * (1 - blurT);
        document.querySelectorAll('.custom-marker').forEach(m => {
          m.style.filter = `blur(${blurAmt.toFixed(1)}px)`;
        });
      }
    } else {
      if (statusEl) statusEl.textContent = 'no face';
    }
  } catch (e) { /* ignore per-frame errors */ }

  // ── HAND → map zoom ──────────────────────────────────────────────────────
  try {
    const hands = await procopioHandDetector.estimateHands(video, { flipHorizontal: true });
    if (hands.length > 0) {
      const kp        = hands[0].keypoints;
      // Palm width: index MCP (5) → pinky MCP (17)
      const palmWidth = dist2D(kp[5], kp[17]);

      if (handSizeSamples.length < HAND_CALIB_FRAMES) {
        handSizeSamples.push(palmWidth);
        if (handSizeSamples.length === HAND_CALIB_FRAMES) {
          handSizeBaseline = handSizeSamples.reduce((a, b) => a + b) / HAND_CALIB_FRAMES;
        }
      } else {
        // ratio > 1.5 (hand close) → zoom in; ratio < 0.5 (hand far) → zoom out
        const ratio      = palmWidth / handSizeBaseline;
        const zoomT      = Math.max(0, Math.min(1, (ratio - 0.5) / (1.5 - 0.5)));
        const targetZoom = ZOOM_MIN + zoomT * (ZOOM_MAX - ZOOM_MIN);
        if (handEl) handEl.textContent = `hand: ${ratio.toFixed(2)}× → zoom ${targetZoom.toFixed(1)}`;
        const map = window.procopioMap;
        if (map) map.easeTo({ zoom: targetZoom, duration: 300 });
      }
    } else {
      if (handEl) handEl.textContent = 'no hand';
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (procopioIsDetecting) requestAnimationFrame(detectLoop);
}

document.addEventListener('DOMContentLoaded', initProcopioTracking);
