// Category gesture controls — hand tracking per category

let handDetector = null;
let gestureStream = null;
let gestureDetecting = false;
let gestureModelLoading = false;
let gestureCooldownUntil = 0;
let lastGestureCategory = null;

const doubleDownDetector = {
  phase: 'idle',
  strokeCount: 0,
  lastStrokeTime: 0,
  startY: null,
  maxY: null,

  reset() {
    this.phase = 'idle';
    this.strokeCount = 0;
    this.lastStrokeTime = 0;
    this.startY = null;
    this.maxY = null;
  },

  update(hand) {
    const now = performance.now();
    if (now < gestureCooldownUntil) return false;

    const postureOk = isIndexMiddleDown(hand);
    const y = fingerAverageY(hand);

    if (!postureOk) {
      if (this.phase === 'down' && this.startY !== null) {
        const distance = this.maxY - this.startY;
        if (distance >= STROKE_MIN_DISTANCE) {
          if (now - this.lastStrokeTime > DOUBLE_STROKE_WINDOW) {
            this.strokeCount = 0;
          }
          this.strokeCount += 1;
          this.lastStrokeTime = now;

          if (this.strokeCount >= 2) {
            this.strokeCount = 0;
            this.phase = 'idle';
            this.startY = null;
            this.maxY = null;
            gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
            return true;
          }
        }
      }
      this.phase = 'idle';
      this.startY = null;
      this.maxY = null;
      return false;
    }

    if (this.phase === 'idle') {
      this.phase = 'down';
      this.startY = y;
      this.maxY = y;
      return false;
    }

    if (y > this.maxY) this.maxY = y;
    return false;
  },
};

const leftChestDetector = {
  wasActive: false,

  reset() {
    this.wasActive = false;
  },

  update(hand, frameW, frameH) {
    const now = performance.now();
    if (now < gestureCooldownUntil) {
      if (!isIndexPointLeftChest(hand, frameW, frameH)) {
        this.wasActive = false;
      }
      return false;
    }

    const active = isIndexPointLeftChest(hand, frameW, frameH);

    if (active && !this.wasActive) {
      this.wasActive = true;
      gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
      return true;
    }

    if (!active) {
      this.wasActive = false;
    }

    return false;
  },
};

const STROKE_MIN_DISTANCE = 50;
const DOUBLE_STROKE_WINDOW = 1100;
const GESTURE_COOLDOWN_MS = 900;

function setGestureStatus(text) {
  const el = document.getElementById('gesture-status');
  if (el) el.textContent = text;
}

function getActiveCategorySafe() {
  return typeof window.getActiveCategory === 'function' ? window.getActiveCategory() : null;
}

function isGestureUiActive() {
  return !document.body.classList.contains('about-open');
}

function isPortraitGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'fotografie';
}

function isPackGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'pacchetti';
}

function isIndexMiddleDown(hand) {
  const k = hand.keypoints;

  const indexTip = k[8];
  const indexPip = k[6];
  const middleTip = k[12];
  const middlePip = k[10];
  const ringTip = k[16];
  const ringPip = k[14];
  const pinkyTip = k[20];
  const pinkyPip = k[18];

  const indexDown = indexTip.y > indexPip.y + 15;
  const middleDown = middleTip.y > middlePip.y + 15;
  const ringNotDown = ringTip.y < ringPip.y + 30;
  const pinkyNotDown = pinkyTip.y < pinkyPip.y + 30;

  return indexDown && middleDown && ringNotDown && pinkyNotDown;
}

function isIndexExtended(hand) {
  const k = hand.keypoints;
  const indexTip = k[8];
  const indexPip = k[6];
  const indexMcp = k[5];

  const indexLen = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);
  const indexStraight = indexTip.y <= indexPip.y + 12;

  return indexLen > 42 && indexStraight;
}

function areOtherFingersCurled(hand) {
  const k = hand.keypoints;
  const middleTip = k[12];
  const middlePip = k[10];
  const ringTip = k[16];
  const ringPip = k[14];
  const pinkyTip = k[20];
  const pinkyPip = k[18];

  return (
    middleTip.y > middlePip.y + 4 &&
    ringTip.y > ringPip.y + 4 &&
    pinkyTip.y > pinkyPip.y + 4
  );
}

function isIndexPointLeftChest(hand, frameW, frameH) {
  const k = hand.keypoints;
  const indexTip = k[8];
  const indexMcp = k[5];
  const wrist = k[0];

  if (!isIndexExtended(hand) || !areOtherFingersCurled(hand)) {
    return false;
  }

  const chestYMin = frameH * 0.2;
  const chestYMax = frameH * 0.78;
  const inChestBand = indexTip.y >= chestYMin && indexTip.y <= chestYMax;

  // Mirror view: left chest is on the left side of the frame
  const nearLeftChest = indexTip.x <= frameW * 0.54;
  const pointingLeft = indexTip.x < indexMcp.x - 10;
  const wristLeftOfCenter = wrist.x <= frameW * 0.62;

  return inChestBand && nearLeftChest && (pointingLeft || wristLeftOfCenter);
}

function fingerAverageY(hand) {
  const k = hand.keypoints;
  return (k[8].y + k[12].y) / 2;
}

function drawHandDebug(hand, ctx, mode = 'portrait') {
  const color = '#E5E5E5';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  const highlight = mode === 'pack' ? [8, 5, 6] : [8, 12, 6, 10];

  hand.keypoints.forEach((point, index) => {
    if (highlight.includes(index)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (mode === 'pack') {
    const tip = hand.keypoints[8];
    const mcp = hand.keypoints[5];
    ctx.beginPath();
    ctx.moveTo(mcp.x, mcp.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
}

function resetAllGestureDetectors() {
  doubleDownDetector.reset();
  leftChestDetector.reset();
}

function updateIdleGestureStatus() {
  const category = getActiveCategorySafe();
  if (category === 'fotografie') {
    setGestureStatus('Portraits: 2 colpi ↓ indice + medio');
  } else if (category === 'pacchetti') {
    setGestureStatus('Packs: indice → petto sinistro');
  } else {
    setGestureStatus('Hand tracking attivo');
  }
}

async function initCategoryGestures() {
  if (handDetector || gestureModelLoading) return;

  const video = document.getElementById('gesture-webcam');
  const canvas = document.getElementById('gesture-canvas');
  if (!video || !canvas) return;

  gestureModelLoading = true;
  setGestureStatus('Loading hand model…');

  try {
    await tf.setBackend('webgl');
    await tf.ready();

    handDetector = await handPoseDetection.createDetector(
      handPoseDetection.SupportedModels.MediaPipeHands,
      {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
        modelType: 'full',
        maxHands: 1,
      }
    );

    gestureStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: 'user' },
    });

    video.srcObject = gestureStream;

    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
    });

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    gestureDetecting = true;
    updateIdleGestureStatus();
    detectCategoryGestures();
  } catch (err) {
    console.error('Gesture init failed:', err);
    setGestureStatus('Camera / hand model unavailable');
  } finally {
    gestureModelLoading = false;
  }
}

async function detectCategoryGestures() {
  if (!gestureDetecting) return;

  const video = document.getElementById('gesture-webcam');
  const canvas = document.getElementById('gesture-canvas');
  const ctx = canvas?.getContext('2d');

  if (handDetector && video && ctx && video.readyState >= 2) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const category = getActiveCategorySafe();
    if (category !== lastGestureCategory) {
      resetAllGestureDetectors();
      lastGestureCategory = category;
    }

    if (isPortraitGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });

        if (hands.length) {
          const hand = hands[0];
          drawHandDebug(hand, ctx, 'portrait');

          if (doubleDownDetector.update(hand)) {
            setGestureStatus('Gesto ↓↓ — prossimo ritratto');
            window.advancePortraitViaGesture?.();
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (isIndexMiddleDown(hand)) {
            setGestureStatus('Indice + medio ↓ — pronto per colpo');
          }
        } else {
          doubleDownDetector.reset();
          setGestureStatus('Portraits: mostra mano (indice + medio ↓)');
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isPackGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (hands.length) {
          const hand = hands[0];
          drawHandDebug(hand, ctx, 'pack');

          if (leftChestDetector.update(hand, frameW, frameH)) {
            setGestureStatus('Petto sinistro — prossimo pack');
            window.advancePackViaGesture?.();
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (isIndexPointLeftChest(hand, frameW, frameH)) {
            setGestureStatus('Indice sul petto sinistro…');
          } else if (isIndexExtended(hand)) {
            setGestureStatus('Punta l’indice verso il petto sinistro');
          }
        } else {
          leftChestDetector.reset();
          setGestureStatus('Packs: indice esteso → petto sinistro');
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else {
      resetAllGestureDetectors();
      updateIdleGestureStatus();
    }
  }

  requestAnimationFrame(detectCategoryGestures);
}

window.initCategoryGestures = initCategoryGestures;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCategoryGestures);
} else {
  initCategoryGestures();
}
