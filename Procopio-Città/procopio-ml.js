// procopio-ml.js — Face + Hand tracking for home.html
// Face proximity  → blur on .custom-marker (20px far → 0px close)
// Hand palm size  → map zoom (hand closer = zoom in, farther = zoom out)
// Hand position   → map center (hand moves → map moves within bounds)

let procopioFaceDetector = null;
let procopioHandDetector = null;
let procopioIsDetecting  = false;
let procopioDetectionAllowed = false; // Only start detection after loading overlay completes
let procopioStream       = null;
let procopioFadeLastTickAt = null;
let procopioLastNavigationActivityAt = 0;
let procopioFadeLoopRunning = false;
let procopioFadeStepIndex = 0;
let procopioFadeStepElapsedMs = 0;

// Face calibration
let faceSizeSamples  = [];
let faceSizeBaseline = null;
const FACE_CALIB_FRAMES = 50;
const FACE_TOO_FAR_RATIO = 0.60;
const FACE_RETURN_RATIO = 0.68;
const FACE_DEBOUNCE_FRAMES = 3; // consecutive frames required to change state
const NO_FACE_DEBOUNCE_FRAMES = 3; // wait before clearing the overlay when face disappears

let faceTooFar = false;
let faceTooFarCounter = 0;
let faceNearCounter = 0;
let noFaceCounter = 0;

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
const HAND_RATIO_SMOOTH_ALPHA = 0.10;
const HAND_CENTER_SMOOTH_ALPHA = 0.12;

let filteredHandRatio = null;
let filteredLng = null;
let filteredLat = null;
let filteredBlur = null; // Smooth blur interpolation
let lastMapUpdateAt = 0;

// Initial blur phase - gradual fade in from full blur to clear
let blurInitialPhaseActive = false;
let initialBlurStartTime = null;

// Map bounds (matching maxBounds in script.js)
const MAP_BOUNDS = {
  west: 12,      // min longitude
  east: 19.5,    // max longitude
  south: 36,     // min latitude
  north: 42.5    // max latitude
};

const MARKER_FADE_DURATION_MS = 8 * 1000;
const NAVIGATION_SLOWDOWN_WINDOW_MS = 8000;
const NAVIGATION_SLOWDOWN_FACTOR = 0.25;
const BLUR_SMOOTH_ALPHA = 0.08; // ~4-5 sec smooth fade





const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let detector = null;
let isDetecting = false;
let showNumbers = true;

// Colors for different hands
const handColors = [
  "#FF0000", // Red
  "#00FF00", // Green
  "#0088FF", // Blue
  "#FF00FF", // Magenta
  "#FFFF00", // Yellow
  "#00FFFF", // Cyan
];

// Hand landmark connections (finger bones)
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

// Finger names for each landmark
const LANDMARK_NAMES = [
  "Wrist",
  "Thumb CMC",
  "Thumb MCP",
  "Thumb IP",
  "Thumb Tip",
  "Index MCP",
  "Index PIP",
  "Index DIP",
  "Index Tip",
  "Middle MCP",
  "Middle PIP",
  "Middle DIP",
  "Middle Tip",
  "Ring MCP",
  "Ring PIP",
  "Ring DIP",
  "Ring Tip",
  "Pinky MCP",
  "Pinky PIP",
  "Pinky DIP",
  "Pinky Tip",
];
// Draw hand landmarks
function drawHandLandmarks(keypoints, color, handedness) {
  // Draw all keypoints with numbers
  keypoints.forEach((point, index) => {
    // Draw the point
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw the number next to the point (if enabled)
    if (showNumbers) {
      ctx.fillStyle = color;
      ctx.font = "10px Arial";
      ctx.fillText(index, point.x + 8, point.y - 8);
    }
  });

  // Draw hand skeleton connections
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  HAND_CONNECTIONS.forEach(([start, end]) => {
    const startPoint = keypoints[start];
    const endPoint = keypoints[end];

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();
  });
}

// Draw bounding box around hand
function drawBoundingBox(keypoints, color, handedness) {
  console.log('drawBoundingBox', keypoints, color, handedness);
  const xs = keypoints.map((p) => p.x);
  const ys = keypoints.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);

  // Draw hand label
  ctx.fillStyle = color;
  ctx.font = "bold 16px Arial";
  ctx.fillText(handedness, minX - 10, minY - 15);

  console.log('testtttt');
}




function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function setFaceFarOverlayVisible(visible) {
  const overlayEl = document.getElementById('face-far-overlay');
  if (!overlayEl) return;
  overlayEl.classList.toggle('open', visible);
  overlayEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
  overlayEl.style.opacity = visible ? '1' : '0';
  overlayEl.style.pointerEvents = visible ? 'auto' : 'none';
  overlayEl.style.visibility = visible ? 'visible' : 'hidden';
}

function markProcopioNavigationActivity() {
  procopioLastNavigationActivityAt = performance.now();
}

function isProcopioTimerPaused() {
  const lightboxOpen = document.body.classList.contains('lightbox-open') || !!document.querySelector('.lightbox.open');
  const markerModalOpen = !!document.querySelector('#marker-modal.open');
  return lightboxOpen || markerModalOpen;
}

function getProcopioTimerSpeed(now) {
  if (isProcopioTimerPaused()) return 0;
  if (!procopioLastNavigationActivityAt) return 1;
  return now - procopioLastNavigationActivityAt < NAVIGATION_SLOWDOWN_WINDOW_MS
    ? NAVIGATION_SLOWDOWN_FACTOR
    : 1;
}

function updateProcopioMarkerFade(now) {
  if (!procopioFadeLoopRunning) return;

  const markerEls = document.querySelectorAll('.custom-marker');
  if (!markerEls.length) {
    procopioFadeLastTickAt = now;
    requestAnimationFrame(updateProcopioMarkerFade);
    return;
  }

  if (procopioFadeLastTickAt == null) {
    procopioFadeLastTickAt = now;
  }

  const deltaMs = now - procopioFadeLastTickAt;
  procopioFadeLastTickAt = now;

  const speed = getProcopioTimerSpeed(now);
  if (speed > 0) {
    procopioFadeStepElapsedMs += deltaMs * speed;
  }

  if (procopioFadeStepIndex >= markerEls.length) {
    return;
  }

  markerEls.forEach((markerEl, index) => {
    if (index < procopioFadeStepIndex) {
      markerEl.style.opacity = '0';
      return;
    }

    if (index > procopioFadeStepIndex) {
      markerEl.style.opacity = '1';
      return;
    }

    const markerProgress = Math.max(0, Math.min(1, procopioFadeStepElapsedMs / MARKER_FADE_DURATION_MS));
    const opacity = Math.max(0, 1 - markerProgress);
    markerEl.style.opacity = opacity.toFixed(4);
  });

  if (procopioFadeStepElapsedMs >= MARKER_FADE_DURATION_MS) {
    procopioFadeStepIndex += 1;
    procopioFadeStepElapsedMs = 0;
    if (procopioFadeStepIndex < markerEls.length) {
      markerEls[procopioFadeStepIndex].style.opacity = '1';
    }
  }

  if (procopioFadeStepIndex < markerEls.length) {
    requestAnimationFrame(updateProcopioMarkerFade);
  }
}

function startProcopioMarkerFadeTimer() {
  if (procopioFadeLoopRunning) return;
  procopioFadeLoopRunning = true;
  procopioFadeLastTickAt = null;
  procopioFadeStepIndex = 0;
  procopioFadeStepElapsedMs = 0;
  requestAnimationFrame(updateProcopioMarkerFade);
}

// Animate initial blur phase - keep blur at 20px for duration, then enable face control
function animateInitialBlur() {
  if (!blurInitialPhaseActive || initialBlurStartTime === null) return;
  
  const now = performance.now();
  const elapsedMs = now - initialBlurStartTime;
  const durationMs = 3500; // 3.5 second hold at 20px blur
  const progress = Math.min(1, elapsedMs / durationMs);
  
  // Keep blur constant at 20px during the initial phase
  filteredBlur = 9;
  
  document.querySelectorAll('.custom-marker').forEach(m => {
    m.style.filter = `blur(${filteredBlur.toFixed(1)}px)`;
  });
  
  if (progress < 1) {
    requestAnimationFrame(animateInitialBlur);
  } else {
    // Phase complete - reset filteredBlur so face detection can take over
    blurInitialPhaseActive = false;
    filteredBlur = null; // Reset so face detection initializes properly
  }
}

async function initProcopioTracking() {
  const statusEl = document.getElementById('face-status-label');
  if (statusEl) statusEl.textContent = 'loading models…';
  setFaceFarOverlayVisible(false);
  
  // Start initial blur phase - gradual fade from full blur to clear
  blurInitialPhaseActive = true;
  initialBlurStartTime = performance.now();
  filteredBlur = 20; // Start with maximum blur
  animateInitialBlur();
  
  try {
    // Try WebGL first, fallback to CPU if not available
    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch (webglErr) {
      console.warn('WebGL backend failed, falling back to CPU:', webglErr);
      await tf.setBackend('cpu');
      await tf.ready();
      if (statusEl) statusEl.textContent = 'loading models… (CPU mode)';
    }

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
    procopioDetectionAllowed = true; // Enable detection now that models are loaded
    await startProcopioCamera();
  } catch (err) {
    if (statusEl) statusEl.textContent = 'error: ' + err.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const recordActivity = () => markProcopioNavigationActivity();
  document.addEventListener('pointerdown', recordActivity, true);
  document.addEventListener('wheel', recordActivity, { passive: true, capture: true });
  document.addEventListener('keydown', recordActivity, true);
  window.addEventListener('scroll', recordActivity, { passive: true });
  startProcopioMarkerFadeTimer();
  // Note: Camera initialization is deferred until loading overlay completes
});

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
   video.addEventListener("loadedmetadata", () => {
  syncCanvasToVideo();

  if (!procopioIsDetecting) {
    procopioIsDetecting = true;
    detectLoop();
  }
}, { once: true });
  } catch (err) {
    if (statusEl) statusEl.textContent = 'cam error: ' + err.message;
    setFaceFarOverlayVisible(false);
  }
}

function syncCanvasToVideo() {
  const video = document.getElementById("face-webcam");
  const canvas = document.getElementById("canvas");

  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

async function detectLoop() {
  if (!procopioIsDetecting || !procopioDetectionAllowed) {
    if (procopioIsDetecting) requestAnimationFrame(detectLoop);
    return;
  }
  const video    = document.getElementById('face-webcam');
  const statusEl = document.getElementById('face-status-label');
  const proxEl   = document.getElementById('face-prox-label');
  const calibEl  = document.getElementById('face-calib-label');
  const handEl   = document.getElementById('hand-size-label');

  // ── FACE → .custom-marker blur ───────────────────────────────────────────
  try {
    // Check if video is ready before processing
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (procopioIsDetecting) requestAnimationFrame(detectLoop);
      return;
    }
    const faces = await procopioFaceDetector.estimateFaces(video, { flipHorizontal: true });
    if (faces.length > 0) {
      if (statusEl) statusEl.textContent = '✓ face';
      const kp        = faces[0].keypoints;
      const faceWidth = Math.abs(kp[454].x - kp[234].x);

      if (faceSizeSamples.length < FACE_CALIB_FRAMES) {
        faceSizeSamples.push(faceWidth);
        setFaceFarOverlayVisible(false);
        faceTooFar = false;
        if (calibEl) calibEl.textContent = `calib: ${faceSizeSamples.length}/${FACE_CALIB_FRAMES}`;
        if (faceSizeSamples.length === FACE_CALIB_FRAMES) {
          faceSizeBaseline = faceSizeSamples.reduce((a, b) => a + b) / FACE_CALIB_FRAMES;
          if (calibEl) calibEl.textContent = `base: ${faceSizeBaseline.toFixed(0)}px`;
        }
      } else {
        const ratio = faceWidth / faceSizeBaseline;
        if (proxEl) proxEl.textContent = `${ratio.toFixed(2)}×`;

        // reset no-face counter when we detect a face
        noFaceCounter = 0;

        // Debounced far/near detection to avoid flicker
        if (ratio < FACE_TOO_FAR_RATIO) {
          faceTooFarCounter += 1;
          faceNearCounter = 0;
        } else if (ratio > FACE_RETURN_RATIO) {
          faceNearCounter += 1;
          faceTooFarCounter = 0;
        } else {
          // between thresholds: slowly converge to near
          faceNearCounter = Math.min(faceNearCounter + 1, FACE_DEBOUNCE_FRAMES);
          faceTooFarCounter = Math.max(faceTooFarCounter - 1, 0);
        }

        // Apply debounced decisions
        if (!faceTooFar && faceTooFarCounter >= FACE_DEBOUNCE_FRAMES) {
          faceTooFar = true;
        }
        if (faceTooFar && faceNearCounter >= FACE_DEBOUNCE_FRAMES) {
          faceTooFar = false;
        }

        setFaceFarOverlayVisible(faceTooFar);

        // Only apply face-based blur control if initial blur phase is complete
        if (!blurInitialPhaseActive) {
          // ratio 1.4+ (very close) → 0px blur; ratio 0.4 (very far) → 20px blur
          const blurT   = Math.max(0, Math.min(1, (ratio - 0.4) / (1.4 - 0.4)));
          const targetBlur = 20 * (1 - blurT);
          
          // Apply exponential smoothing for gradual blur transition
          if (filteredBlur == null) filteredBlur = targetBlur;
          filteredBlur += (targetBlur - filteredBlur) * BLUR_SMOOTH_ALPHA;
          
          document.querySelectorAll('.custom-marker').forEach(m => {
            m.style.filter = `blur(${filteredBlur.toFixed(1)}px)`;
          });
        }
      }
    } else {
      if (statusEl) statusEl.textContent = 'no face';
      if (proxEl) proxEl.textContent = `—`;
      // Increment no-face counter; after debounce, clear any previous far state.
      noFaceCounter += 1;
      faceTooFarCounter = 0; // reset face-based counter
      faceNearCounter = 0;
      if (noFaceCounter >= NO_FACE_DEBOUNCE_FRAMES) {
        faceTooFar = false;
      }
      setFaceFarOverlayVisible(faceTooFar);
    }
  } catch (e) { 
    if (e.message && e.message.includes('WebGL')) {
      console.error('WebGL error during face detection:', e);
      if (statusEl) statusEl.textContent = 'WebGL error - see console';
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── HAND → map zoom + center ────────────────────────────────────────────
  try {
    // Check if video is ready before processing
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (procopioIsDetecting) requestAnimationFrame(detectLoop);
      return;
    }
    const hands = await procopioHandDetector.estimateHands(video, { flipHorizontal: false });
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
        

          let hand = hands[0];
          let color = handColors[0];
          let handedness = hand.handedness || "Unknown";
          //console.log('hand', hand.keypoints, color, handedness);
          //console.log('hand');
          // Draw bounding box
          drawBoundingBox(hand.keypoints, color, handedness);
          // Draw hand landmarks
          drawHandLandmarks(hand.keypoints, color, handedness);


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
  } catch (e) { 
    if (e.message && e.message.includes('WebGL')) {
      console.error('WebGL error during hand detection:', e);
    }
  }

  if (procopioIsDetecting) requestAnimationFrame(detectLoop);
}
