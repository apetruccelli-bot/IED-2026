// Category gesture controls — hand tracking (Portraits) + face tracking (future categories)

let handDetector = null;
let gestureStream = null;
let gestureDetecting = false;
let gestureModelLoading = false;
let gestureCooldownUntil = 0;

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

const STROKE_MIN_DISTANCE = 50;
const DOUBLE_STROKE_WINDOW = 1100;
const GESTURE_COOLDOWN_MS = 900;

function setGestureStatus(text) {
  const el = document.getElementById('gesture-status');
  if (el) el.textContent = text;
}

function isPortraitGestureActive() {
  return (
    typeof window.getActiveCategory === 'function' &&
    window.getActiveCategory() === 'fotografie' &&
    !document.body.classList.contains('about-open')
  );
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

function fingerAverageY(hand) {
  const k = hand.keypoints;
  return (k[8].y + k[12].y) / 2;
}

function drawHandDebug(hand, ctx) {
  const color = '#E5E5E5';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  hand.keypoints.forEach((point, index) => {
    if ([8, 12, 6, 10].includes(index)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
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
    setGestureStatus('Portraits: 2 colpi ↓ indice + medio');
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

    if (isPortraitGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });

        if (hands.length) {
          const hand = hands[0];
          drawHandDebug(hand, ctx);

          if (doubleDownDetector.update(hand)) {
            setGestureStatus('Gesto ↓↓ — prossimo ritratto');
            window.advancePortraitViaGesture?.();
            setTimeout(() => {
              if (isPortraitGestureActive()) {
                setGestureStatus('Portraits: 2 colpi ↓ indice + medio');
              }
            }, GESTURE_COOLDOWN_MS);
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
    } else {
      doubleDownDetector.reset();
      setGestureStatus('Hand tracking attivo');
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
