// procopio-ml.js — Face + Hand tracking for home.html
// Face proximity  → blur on .custom-marker (20px far → 0px close)
// Hand palm size  → map zoom (hand closer = zoom in, farther = zoom out)
// Hand position   → map center (hand moves → map moves within bounds)

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
const ZOOM_DEADZONE = 0.03;
const CENTER_DEADZONE = 0.0008;
const MAP_UPDATE_INTERVAL_MS = 120;
const HAND_RATIO_SMOOTH_ALPHA = 0.15;
const HAND_CENTER_SMOOTH_ALPHA = 0.12;

let filteredHandRatio = null;
let filteredLng = null;
let filteredLat = null;
let lastMapUpdateAt = 0;

// Map bounds (matching maxBounds in script.js)
const MAP_BOUNDS = {
  west: 12,      // min longitude
  east: 19.5,    // max longitude
  south: 36,     // min latitude
  north: 42.5    // max latitude
};

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

  // ── HAND → map zoom + center ────────────────────────────────────────────
  try {
    const hands = await procopioHandDetector.estimateHands(video, { flipHorizontal: true });
    if (hands.length > 0) {
      const kp        = hands[0].keypoints;
      // Palm width: index MCP (5) → pinky MCP (17)
      const palmWidth = dist2D(kp[5], kp[17]);
      // Hand center: wrist position (landmark 0)
      const handCenter = kp[0];

      if (handSizeSamples.length < HAND_CALIB_FRAMES) {
        handSizeSamples.push(palmWidth);
        if (handSizeSamples.length === HAND_CALIB_FRAMES) {
          handSizeBaseline = handSizeSamples.reduce((a, b) => a + b) / HAND_CALIB_FRAMES;
        }
      } else {
        // ratio > 1.5 (hand close) → zoom in; ratio < 0.5 (hand far) → zoom out
        const ratio = palmWidth / handSizeBaseline;
        if (filteredHandRatio == null) filteredHandRatio = ratio;
        filteredHandRatio += (ratio - filteredHandRatio) * HAND_RATIO_SMOOTH_ALPHA;

        const zoomT = Math.max(0, Math.min(1, (filteredHandRatio - 0.5) / (1.5 - 0.5)));
        const targetZoom = ZOOM_MIN + zoomT * (ZOOM_MAX - ZOOM_MIN);
        
        // Hand position: normalize video coordinates (0-640, 0-480) to map bounds
        // x: 0 (left) → MAP_BOUNDS.west, 640 (right) → MAP_BOUNDS.east
        // y: 0 (top) → MAP_BOUNDS.north, 480 (bottom) → MAP_BOUNDS.south
        const normalizedX = Math.max(0, Math.min(1, handCenter.x / video.videoWidth));
        const normalizedY = Math.max(0, Math.min(1, handCenter.y / video.videoHeight));

        const rawLng = MAP_BOUNDS.west + normalizedX * (MAP_BOUNDS.east - MAP_BOUNDS.west);
        const rawLat = MAP_BOUNDS.north - normalizedY * (MAP_BOUNDS.north - MAP_BOUNDS.south);

        if (filteredLng == null || filteredLat == null) {
          filteredLng = rawLng;
          filteredLat = rawLat;
        }
        filteredLng += (rawLng - filteredLng) * HAND_CENTER_SMOOTH_ALPHA;
        filteredLat += (rawLat - filteredLat) * HAND_CENTER_SMOOTH_ALPHA;
        
        if (handEl) handEl.textContent = `hand: ${filteredHandRatio.toFixed(2)}× → zoom ${targetZoom.toFixed(2)}, pos [${filteredLng.toFixed(2)}, ${filteredLat.toFixed(2)}]`;
        
        const map = window.procopioMap;
        if (map) {
          const now = performance.now();
          const currentZoom = map.getZoom();
          const currentCenter = map.getCenter();
          const zoomDelta = Math.abs(targetZoom - currentZoom);
          const centerDelta = Math.hypot(filteredLng - currentCenter.lng, filteredLat - currentCenter.lat);

          if (zoomDelta < ZOOM_DEADZONE && centerDelta < CENTER_DEADZONE) {
            // Ignore tiny fluctuations from the hand detector.
          } else if (now - lastMapUpdateAt >= MAP_UPDATE_INTERVAL_MS) {
            lastMapUpdateAt = now;
          map.easeTo({
              center: [filteredLng, filteredLat],
            zoom: targetZoom,
              duration: 220,
              essential: true
            });
          }
        }
      }
    } else {
      if (handEl) handEl.textContent = 'no hand';
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (procopioIsDetecting) requestAnimationFrame(detectLoop);
}

document.addEventListener('DOMContentLoaded', initProcopioTracking);
