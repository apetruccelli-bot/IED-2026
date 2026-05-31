// Get DOM elements (may be absent on pages that don't embed the overlay)
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const status = document.getElementById("status");
const handList = document.getElementById("handList");
const toggleNumbers = document.getElementById("toggleNumbers");

let ctx = null;
if (!video || !canvas) {
  console.warn("Webcam/canvas elements not found on this page.");
} else {
  ctx = canvas.getContext("2d");
}

let detector = null;
let isDetecting = false;
let showNumbers = true;
let modelReady = false;
let cameraStarted = false;
let cameraStartRequested = false;

let lastSelectTime = 0;
let currentGesture = "none";
let lastNavigationTime = 0;
let lastPinchTime = 0;
let lastGalleryScrollTime = 0;
let lastGalleryScrollX = null;
let lastGalleryGesture = "none";
let wasThumbIndexPinched = false;
let wasOpenPalm = false;
let galleryInteractionLockUntil = 0;

// Hand motion tracking for swipe detection
let handPositionHistory = []; // Array of { x, y, timestamp }
const MAX_HISTORY_SIZE = 5; // Keep 5 recent positions (~150ms at 30fps)
const MIN_SWIPE_DISTANCE = 0.20; // Minimum normalized distance to qualify as swipe (harsher threshold)
const MAX_SWIPE_TIME = 300; // Maximum time window for swipe (ms)

// Hand rotation tracking for gallery navigation
let handRotationHistory = []; // Array of { angle, timestamp }
const MAX_ROTATION_HISTORY = 8; // Keep 8 recent angles (~240ms at 30fps)
const MIN_ROTATION_DELTA = 25; // Minimum angle change (degrees) to trigger action
const MAX_ROTATION_TIME = 400; // Maximum time window for rotation detection (ms)
let lastRotationActionTime = 0;

// Gesture stabilization: require N consecutive frames with same gesture before triggering action
const GESTURE_STABILITY_THRESHOLD = 10; // frames (5-10 range for stable tracking)
let lastDetectedGesture = "none";
let gestureStabilityCount = 0;
let stableGesture = "none";

let lastDetectedPinch = false;
let pinchStabilityCount = 0;
let stablePinch = false;
let pinchStickyState = false; // Isteresi: resta true finché thumb-index non è completamente separato

function isFingerExtended(keypoints, tipIndex, pipIndex, mcpIndex) {
  const tip = keypoints[tipIndex];
  const pip = keypoints[pipIndex];
  const mcp = keypoints[mcpIndex];

  // For an upright hand, extended fingers usually have tip above PIP and MCP.
  return tip.y < pip.y && pip.y < mcp.y;
}

function countExtendedFingers(keypoints) {
  let count = 0;

  // Index finger: 5, 6, 7, 8
  if (isFingerExtended(keypoints, 8, 6, 5)) count++;

  // Middle finger: 9, 10, 11, 12
  if (isFingerExtended(keypoints, 12, 10, 9)) count++;

  // Ring finger: 13, 14, 15, 16
  if (isFingerExtended(keypoints, 16, 14, 13)) count++;

  // Pinky: 17, 18, 19, 20
  if (isFingerExtended(keypoints, 20, 18, 17)) count++;

  // Thumb is trickier because it moves sideways.
  // This checks whether thumb tip is far from the palm.
  const wrist = keypoints[0];
  const thumbTip = keypoints[4];
  const indexMcp = keypoints[5];

  const thumbDistance = getDistance(thumbTip, indexMcp);
  const palmSize = getDistance(wrist, indexMcp);

  if (thumbDistance > palmSize * 0.65) count++;

  return count;
}

function getGesture(keypoints) {
  const extendedFingers = countExtendedFingers(keypoints);

  if (extendedFingers >= 4) {
    return "openPalm";
  }

  if (extendedFingers <= 1) {
    return "closedFist";
  }

  return "neutral";
}

function getHandCenter(keypoints) {
  const wrist = keypoints[0];
  const middleMcp = keypoints[9];

  // raw center in video/canvas coordinates
  const x = (wrist.x + middleMcp.x) / 2;
  const y = (wrist.y + middleMcp.y) / 2;

  // determine canvas/video center (fallback to window size)
  const vw = canvas ? canvas.width : window.innerWidth;
  const vh = canvas ? canvas.height : window.innerHeight;
  const cx = vw / 2;
  const cy = vh / 2;

  // Safety check: prevent division by zero
  if (cx === 0 || cy === 0) {
    return {
      x: x || 0,
      y: y || 0,
      nx: 0,
      ny: 0,
      distance: 0,
      angle: 0,
      angleDeg: 0,
    };
  }

  // normalized vector from camera center to hand: range approximately [-1, 1]
  const nx = (x - cx) / cx;
  // invert Y so that up is positive (more intuitive for navigation vectors)
  const ny = -((y - cy) / cy);

  const distance = Math.sqrt(nx * nx + ny * ny);
  const angle = Math.atan2(ny, nx); // radians
  const angleDeg = Math.round((angle * 180) / Math.PI);

  return {
    x,
    y,
    nx,
    ny,
    distance,
    angle,
    angleDeg,
  };
}

function isThumbIndexSeparated(keypoints) {
  const thumbTip = keypoints[4];
  const indexTip = keypoints[8];
  const wrist = keypoints[0];
  const indexMcp = keypoints[5];

  const pinchDistance = getDistance(thumbTip, indexTip);
  const palmSize = getDistance(wrist, indexMcp);

  // Separation gesture when thumb-index are clearly apart relative to hand size
  return pinchDistance > palmSize * 0.92;
}

function isThumbIndexPinched(keypoints) {
  const thumbTip = keypoints[4];
  const indexTip = keypoints[8];
  const wrist = keypoints[0];
  const indexMcp = keypoints[5];

  const pinchDistance = getDistance(thumbTip, indexTip);
  const palmSize = getDistance(wrist, indexMcp);

  // Pinch gesture when thumb-index are close together (adjusted threshold)
  // Con isteresi: se già in stato "pinched", richiedi separazione maggiore per uscire
  if (pinchStickyState) {
    // Per uscire dal pinch, richiedi separazione > 0.70
    return pinchDistance < palmSize * 0.70;
  } else {
    // Per entrare nel pinch, richiedi distanza < 0.50
    return pinchDistance < palmSize * 0.50;
  }
}

function normalizeAngle(angle) {
  // Normalize angle to 0-360 range
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

function getAngleDelta(angle1, angle2) {
  // Calculate shortest angle difference between two angles
  let delta = angle2 - angle1;
  
  // Normalize to -180 to 180
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  
  return delta;
}

function handleMapGesture(hand) {
  if (!window.oceanMapControls) {
    if (status) status.textContent = "Map controls not ready";
    return;
  }

  if (!hand || !hand.keypoints || hand.keypoints.length < 21) return;

  try {
    const gesture = getGesture(hand.keypoints);
    const handCenter = getHandCenter(hand.keypoints);
    const now = Date.now();
    const thumbIndexPinched = isThumbIndexPinched(hand.keypoints);

    // Safety check: ensure handCenter has valid values
    if (!handCenter || isNaN(handCenter.nx) || isNaN(handCenter.ny)) {
      console.warn('[HAND] Invalid hand center values detected, skipping frame');
      return;
    }

    currentGesture = gesture;
    status.textContent = `Gesture: ${gesture} | stab:${gestureStabilityCount}/${GESTURE_STABILITY_THRESHOLD} | x:${Math.round(handCenter.x)} y:${Math.round(handCenter.y)} | nx:${handCenter.nx.toFixed(2)} ny:${handCenter.ny.toFixed(2)} | open:${!!window.locationIsOpen}`;

  // ═══════════════════════════════════════════════════════════════════
  // GESTURE STABILIZATION: count consecutive frames with same gesture
  // ═══════════════════════════════════════════════════════════════════
  if (gesture === lastDetectedGesture) {
    gestureStabilityCount++;
  } else {
    gestureStabilityCount = 1;
    lastDetectedGesture = gesture;
  }

  // Gesture is "stable" only after GESTURE_STABILITY_THRESHOLD consecutive frames
  if (gestureStabilityCount >= GESTURE_STABILITY_THRESHOLD) {
    stableGesture = gesture;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PINCH STABILIZATION: count consecutive frames with pinch
  // ═══════════════════════════════════════════════════════════════════
  if (thumbIndexPinched === lastDetectedPinch) {
    pinchStabilityCount++;
  } else {
    pinchStabilityCount = 1;
    lastDetectedPinch = thumbIndexPinched;
  }

  // Pinch is "stable" only after GESTURE_STABILITY_THRESHOLD consecutive frames
  if (pinchStabilityCount >= GESTURE_STABILITY_THRESHOLD) {
    stablePinch = thumbIndexPinched;
    // Aggiorna sticky state: se stablePinch è true, attiva lo sticky
    if (stablePinch) {
      pinchStickyState = true;
    }
  }

  // Se no longer pinched, disattiva sticky state
  if (!stablePinch && !thumbIndexPinched) {
    pinchStickyState = false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RULE 1: PINCH (stable thumb-index close) → CLOSE location
  // ═══════════════════════════════════════════════════════════════════
  if (stablePinch && !wasThumbIndexPinched && now - lastPinchTime > 800 && window.locationIsOpen) {
    console.debug('[HAND] PINCH STABLE detected → closeLocationDetail');
    if (window.oceanMapControls && typeof window.oceanMapControls.closeLocationDetail === "function") {
      window.oceanMapControls.closeLocationDetail();
      window.locationIsOpen = false;
    }
    lastPinchTime = now;
    galleryInteractionLockUntil = now + 420;
    // Reset pinch counter to avoid re-trigger
    pinchStabilityCount = 0;
    stablePinch = false;
    return;
  }
  wasThumbIndexPinched = stablePinch;

  // ═══════════════════════════════════════════════════════════════════
  // RULE 2: CLOSED FIST (stable) → NAVIGATE map
  // ═══════════════════════════════════════════════════════════════════
  if (stableGesture === "closedFist") {
    // If a location is already open, the fist must not close or disturb it.
    // Pinch stays the only gesture allowed to close the location.
    if (window.locationIsOpen) {
      return;
    }

    // Throttle navigation to avoid excessive updates
    if (now - lastNavigationTime < 35) return;

    console.debug('[HAND] CLOSED FIST STABLE → navigateMapWithVector', { nx: handCenter.nx.toFixed(2), ny: handCenter.ny.toFixed(2) });
    if (window.oceanMapControls && typeof window.oceanMapControls.navigateMapWithVector === "function") {
      window.oceanMapControls.navigateMapWithVector(handCenter.nx, handCenter.ny, handCenter.distance);
    } else {
      // Fallback to pixel-based handler
      window.oceanMapControls.navigateMapWithHand(
        handCenter.x,
        handCenter.y,
        canvas ? canvas.width : window.innerWidth,
        canvas ? canvas.height : window.innerHeight,
        1
      );
    }
    lastNavigationTime = now;
  }

  // If a recent open/close action happened, skip gallery gestures for a short time
  if (now < galleryInteractionLockUntil) {
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RULE 4a: HAND ROTATION (location open) → FLIP THROUGH GALLERY
  // Track hand angle rotation for clockwise/counter-clockwise navigation
  // ═══════════════════════════════════════════════════════════════════
  let rotationDetected = false;
  if (window.locationIsOpen && stableGesture === "openPalm") {
    // Add current hand angle to rotation history
    handRotationHistory.push({
      angle: handCenter.angleDeg,
      timestamp: now
    });

    // Keep only recent history (remove old entries)
    if (handRotationHistory.length > MAX_ROTATION_HISTORY) {
      handRotationHistory.shift();
    }

    // Detect rotation: check if hand has rotated significantly within time window
    if (handRotationHistory.length >= 3) {
      const oldest = handRotationHistory[0];
      const newest = handRotationHistory[handRotationHistory.length - 1];
      const timeDelta = newest.timestamp - oldest.timestamp;

      // Only consider rotations within the time window
      if (timeDelta <= MAX_ROTATION_TIME && timeDelta > 0) {
        const angleDelta = getAngleDelta(oldest.angle, newest.angle);
        const absRotation = Math.abs(angleDelta);

        // Throttle rotation actions (more conservative)
        const canRotate = now - lastRotationActionTime > 600;

        // Detect significant rotation (clockwise or counter-clockwise)
        if (canRotate && absRotation > MIN_ROTATION_DELTA) {
          // Positive = counter-clockwise rotation → next image
          // Negative = clockwise rotation → previous image
          const direction = angleDelta > 0 ? 1 : -1;
          
          console.debug('[HAND] HAND ROTATION → stepGallery', {
            direction,
            angleDelta: angleDelta.toFixed(1),
            timeDelta,
            oldAngle: oldest.angle,
            newAngle: newest.angle
          });

          if (window.oceanMapControls && typeof window.oceanMapControls.stepGallery === "function") {
            window.oceanMapControls.stepGallery(direction);
          }

          rotationDetected = true;
          lastRotationActionTime = now;

          // Clear history after rotation to prevent multiple triggers
          handRotationHistory = [];
        }
      }
    }
  } else {
    // Palm not open or location closed: reset rotation tracking
    handRotationHistory = [];
  }

  // ═══════════════════════════════════════════════════════════════════
  // RULE 4b: SIDEWAYS PALM SWIPE (location open) → SCROLL GALLERY
  // Track hand motion and detect left/right swipe gestures
  // Only fire if rotation was NOT detected (prevent simultaneous conflicts)
  // ═══════════════════════════════════════════════════════════════════
  if (window.locationIsOpen && stableGesture === "openPalm" && !rotationDetected) {
    // Add current hand position to history
    handPositionHistory.push({
      x: handCenter.nx,
      y: handCenter.ny,
      timestamp: now
    });

    // Keep only recent history (remove old entries)
    if (handPositionHistory.length > MAX_HISTORY_SIZE) {
      handPositionHistory.shift();
    }

    // Detect swipe: check if hand has moved significantly horizontally within time window
    if (handPositionHistory.length >= 2) {
      const oldest = handPositionHistory[0];
      const newest = handPositionHistory[handPositionHistory.length - 1];
      const timeDelta = newest.timestamp - oldest.timestamp;

      // Only consider swipes within the time window
      if (timeDelta <= MAX_SWIPE_TIME && timeDelta > 0) {
        const deltaX = newest.x - oldest.x;
        const absSwipeDistance = Math.abs(deltaX);

        // Throttle navigation to avoid excessive updates
        const canScroll = now - lastGalleryScrollTime > 420;

        // Detect significant horizontal movement (swipe)
        if (canScroll && absSwipeDistance > MIN_SWIPE_DISTANCE) {
          // Determine swipe direction: positive deltaX = hand moved right, negative = moved left
          const direction = deltaX > 0 ? -1 : 1; // Swipe right shows prev image (-1), swipe left shows next (+1)
          
          console.debug('[HAND] SIDEWAYS PALM SWIPE → stepGallery', {
            direction,
            deltaX: deltaX.toFixed(3),
            timeDelta,
            historySize: handPositionHistory.length
          });

          if (window.oceanMapControls && typeof window.oceanMapControls.stepGallery === "function") {
            window.oceanMapControls.stepGallery(direction);
          }

          lastGalleryScrollTime = now;

          // Clear history after swipe to prevent multiple triggers from same motion
          handPositionHistory = [];
        }
      }
    }

    // Reset gesture flag when palm is no longer detected
    if (lastGalleryGesture !== "openPalm") {
      lastGalleryGesture = "openPalm";
    }
  } else {
    // Palm not open or location closed: reset motion tracking
    handPositionHistory = [];
    lastGalleryScrollX = null;
    lastGalleryGesture = "none";
  }

  // ═══════════════════════════════════════════════════════════════════
  // RULE 3: OPEN PALM (stable transition, location closed) → SELECT nearest location
  // ═══════════════════════════════════════════════════════════════════
  if (stableGesture === "openPalm" && !wasOpenPalm && now - lastSelectTime > 700 && !window.locationIsOpen) {
    console.debug('[HAND] OPEN PALM STABLE → selectNearestLocation');
    window.oceanMapControls.selectNearestLocation();
    lastSelectTime = now;
    galleryInteractionLockUntil = now + 250;
    wasOpenPalm = true;
    return;
  }

  wasOpenPalm = stableGesture === "openPalm";
  } catch (error) {
    console.error('[HAND] Error in handleMapGesture:', error);
    // Don't crash - just log and continue
    if (status) status.textContent = 'Gesture handler error: ' + (error.message || String(error));
  }
}

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

// Load the Hand Detection model
async function loadModel() {
  try {
    status.textContent = "Loading hand detection model...";

    await tf.setBackend("webgl");
    await tf.ready();

    detector = await handPoseDetection.createDetector(
      handPoseDetection.SupportedModels.MediaPipeHands,
      {
        runtime: "mediapipe",
        solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands",
        modelType: "full",
        maxHands: 4,
      },
    );

    status.textContent = "Model loaded!";
    modelReady = true;
    console.log("Hand detection model loaded successfully!", { detector });

    if (cameraStartRequested && !cameraStarted) {
      startCamera();
    }
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    if (status) status.textContent = "Error loading model: " + msg;
    console.error("Error loading hand detection model:", error);
    modelReady = false;
  }
}

// Start the webcam
async function startCamera() {
  if (cameraStarted) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        facingMode: "user",
      },
    });
    video.srcObject = stream;
    cameraStarted = true;
    cameraStartRequested = false;

    video.addEventListener("loadeddata", () => {
      // Force canvas to match EXACT video dimensions
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      // Also update the display size
      video.width = videoWidth;
      video.height = videoHeight;

      console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);

      status.textContent = "Detecting hands...";
      if (status) status.textContent = "Detecting hands...";
      detectHands();
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const isPermissionError = error && (error.name === "NotAllowedError" || error.name === "SecurityError");

    if (status) {
      status.textContent = isPermissionError
        ? "Camera blocked. Click Start Camera and allow permissions."
        : "Error accessing camera: " + message;
    }

    cameraStarted = false;
    cameraStartRequested = false;

    if (isPermissionError) {
      console.warn("Camera permission was not granted:", error);
    } else {
      console.error(error);
    }
  }
}

// Draw hand landmarks
function drawHandLandmarks(keypoints, color, handedness) {
  if (!ctx) return;
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

function getDistance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Draw bounding box around hand
function drawBoundingBox(keypoints, color, handedness) {
  if (!ctx) return;
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
}

// Main hand detection loop
async function detectHands() {
  if (!detector) return;

  isDetecting = true;

  // ensure video is ready
  if (video && video.readyState < 2) {
    // try again shortly
    requestAnimationFrame(detectHands);
    return;
  }
  // Detect hands (wrap in try/catch to report errors)
  let hands = [];
  try {
    hands = await detector.estimateHands(video, {
      flipHorizontal: true,
    });
  } catch (err) {
    console.error('Error during estimateHands:', err);
    if (status) status.textContent = 'Detection error: ' + (err && err.message ? err.message : String(err));
    // continue loop but don't throw
    if (isDetecting) requestAnimationFrame(detectHands);
    return;
  }

  // Clear canvas
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw each hand with different color
  let infoHTML = "";

  if (hands.length > 0) {
    infoHTML = `<div style="margin-bottom: 10px;"><strong>Tracking ${hands.length} hand(s)</strong></div>`;

    hands.forEach((hand, index) => {
      const color = handColors[index % handColors.length];
     const handedness = hand.handedness || "Unknown";

      // Process only the first detected hand to avoid duplicate control signals
      if (index === 0) {
  handleMapGesture(hand);
}

      // Draw bounding box
      drawBoundingBox(hand.keypoints, color, handedness);

      // Draw hand landmarks
      drawHandLandmarks(hand.keypoints, color, handedness);

      // Add info for this hand
      const confidence = hand.score
        ? `${(hand.score * 100).toFixed(1)}%`
        : "High confidence";

      infoHTML += `<div class="hand-info" style="border-color: ${color};">`;
      infoHTML += `<strong>${handedness} Hand</strong> (${hand.keypoints.length} landmarks)<br>`;
      infoHTML += `<div style="margin: 5px 0;">`;
      infoHTML += `<span class="landmark-info">Detection: ${confidence}</span>`;
      infoHTML += `</div>`;
      infoHTML += `<div style="margin: 5px 0;">`;
      infoHTML += `<span class="landmark-info">✓ Thumb (5)</span>`;
      infoHTML += `<span class="landmark-info">✓ Index (4)</span>`;
      infoHTML += `<span class="landmark-info">✓ Middle (4)</span>`;
      infoHTML += `<span class="landmark-info">✓ Ring (4)</span>`;
      infoHTML += `<span class="landmark-info">✓ Pinky (4)</span>`;
      infoHTML += `</div>`;

      // Show key landmarks
      if (showNumbers) {
        infoHTML += `<div style="margin: 5px 0; font-size: 11px;">`;
        infoHTML += `<em>Key points:</em> `;
        [0, 4, 8, 12, 16, 20].forEach((idx) => {
          infoHTML += `<span class="landmark-info">${idx}: ${LANDMARK_NAMES[idx]}</span>`;
        });
        infoHTML += `</div>`;
      }

      infoHTML += `</div>`;
    });
  } else {
    infoHTML = "<div>No hands detected - show your hands to the camera!</div>";
  }

  if (handList) {
    handList.innerHTML = infoHTML;
  } else {
    // optionally show minimal status when no handList element
    if (status) status.textContent = infoHTML.replace(/<[^>]+>/g, '');
  }

  // Continue detection loop
  if (isDetecting) {
    requestAnimationFrame(detectHands);
  }
}

// Event listeners (only where elements exist)
function requestCameraStart() {
  if (cameraStarted || cameraStartRequested) return;
  cameraStartRequested = true;

  if (!modelReady) {
    if (status) status.textContent = "Preparing camera...";
    return;
  }

  startCamera();
}

if (video && canvas) {
  document.addEventListener(
    "pointerdown",
    () => {
      requestCameraStart();
    },
    { passive: true }
  );
}

if (toggleNumbers) {
  toggleNumbers.addEventListener("click", () => {
    showNumbers = !showNumbers;
    toggleNumbers.textContent = showNumbers ? "Hide Numbers" : "Show Numbers";
  });
}

// Load model when page loads
loadModel().then(() => {
  if (status) {
    status.textContent = "Model loaded. Touch or click the page to start camera.";
  }
});
