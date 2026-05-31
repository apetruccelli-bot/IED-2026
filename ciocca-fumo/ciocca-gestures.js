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

const adsSmokingTracker = {
  wasActive: false,

  reset() {
    this.wasActive = false;
  },

  update(hand, frameW, frameH) {
    const active = hand ? isSmokingGesture(hand, frameW, frameH) : false;

    if (active && !this.wasActive) {
      this.wasActive = true;
      window.onAdSmokingGestureStart?.();
    } else if (!active && this.wasActive) {
      this.wasActive = false;
      window.onAdSmokingGestureEnd?.();
    }

    return active;
  },
};

const STROKE_MIN_DISTANCE = 50;
const DOUBLE_STROKE_WINDOW = 1100;
const GESTURE_COOLDOWN_MS = 900;
const SCROLL_STROKE_MIN = 55;
const SCROLL_GESTURE_COOLDOWN_MS = 650;

const CATEGORY_SWIPE_COOLDOWN_MS = 900;

let scrollGestureCooldownUntil = 0;
let categoryGestureCooldownUntil = 0;

const openHandSwipeDetector = {
  inStroke: false,
  startX: null,
  startY: null,
  minX: null,
  maxX: null,
  minY: null,
  maxY: null,

  reset() {
    this.inStroke = false;
    this.startX = null;
    this.startY = null;
    this.minX = null;
    this.maxX = null;
    this.minY = null;
    this.maxY = null;
  },

  update(hand, frameW, frameH) {
    const now = performance.now();
    const openHand = hand && isOpenHand(hand, frameW, frameH);

    if (!openHand) {
      if (!this.inStroke) return null;
      return this.finishStroke(now);
    }

    if (now < scrollGestureCooldownUntil || now < categoryGestureCooldownUntil) {
      return null;
    }

    const x = handWristX(hand);
    const y = handWristY(hand);

    if (!this.inStroke) {
      this.inStroke = true;
      this.startX = x;
      this.startY = y;
      this.minX = x;
      this.maxX = x;
      this.minY = y;
      this.maxY = y;
      return null;
    }

    this.minX = Math.min(this.minX, x);
    this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y);
    this.maxY = Math.max(this.maxY, y);
    return null;
  },

  finishStroke(now) {
    const startX = this.startX;
    const startY = this.startY;
    const movedLeft = startX - this.minX;
    const movedRight = this.maxX - startX;
    const movedDown = this.maxY - startY;
    const movedUp = startY - this.minY;
    this.reset();

    const horizontal = Math.max(movedLeft, movedRight);
    const vertical = Math.max(movedDown, movedUp);

    if (horizontal >= SCROLL_STROKE_MIN && horizontal > vertical * 1.12) {
      categoryGestureCooldownUntil = now + CATEGORY_SWIPE_COOLDOWN_MS;
      if (movedLeft > movedRight) return 'next-category';
      if (movedRight > movedLeft) return 'prev-category';
      return null;
    }

    if (vertical >= SCROLL_STROKE_MIN && vertical > horizontal * 1.12) {
      scrollGestureCooldownUntil = now + SCROLL_GESTURE_COOLDOWN_MS;
      if (movedDown > movedUp) return 'down';
      if (movedUp > movedDown) return 'up';
    }

    return null;
  },
};

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

function getGestureMode() {
  if (document.body.classList.contains('about-open')) return 'about';
  return getActiveCategorySafe();
}

function isAdsGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'pubblicità';
}

function isAboutScrollActive() {
  return document.body.classList.contains('about-open');
}

function isVerticalScrollActive() {
  return isAboutScrollActive() || isAdsGestureActive();
}

function isCategoryNavigationActive() {
  return isGestureUiActive();
}

function isPortraitGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'fotografie';
}

function isPackGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'pacchetti';
}

function keypointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isSmokingGesture(hand, frameW, frameH) {
  const k = hand.keypoints;
  const thumbTip = k[4];
  const indexTip = k[8];
  const middleTip = k[12];
  const indexPip = k[6];
  const middlePip = k[10];
  const ringTip = k[16];
  const ringPip = k[14];
  const pinkyTip = k[20];
  const pinkyPip = k[18];

  const thumbIndexPinch = keypointDistance(thumbTip, indexTip) < 42;
  const middleNearCigarette = keypointDistance(middleTip, indexTip) < 52;
  const fingersGrouped = thumbIndexPinch && middleNearCigarette;

  const indexTowardFace = indexTip.y < indexPip.y + 18;
  const middleTowardFace = middleTip.y < middlePip.y + 22;

  const nearMouthNose = indexTip.y < frameH * 0.56;
  const faceCenterBand = indexTip.x > frameW * 0.18 && indexTip.x < frameW * 0.82;

  const ringCurled = ringTip.y > ringPip.y + 2;
  const pinkyCurled = pinkyTip.y > pinkyPip.y + 2;

  return (
    fingersGrouped &&
    indexTowardFace &&
    middleTowardFace &&
    nearMouthNose &&
    faceCenterBand &&
    ringCurled &&
    pinkyCurled
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

function handWristY(hand) {
  return hand.keypoints[0].y;
}

function handWristX(hand) {
  return hand.keypoints[0].x;
}

function finishOpenHandSwipe(now) {
  return openHandSwipeDetector.finishStroke(now);
}

function handleOpenHandSwipeLost(now, options = {}) {
  const direction = finishOpenHandSwipe(now);
  return applyOpenHandSwipe(direction, options);
}

function applyOpenHandSwipe(direction, { allowScroll = false, allowCategory = false } = {}) {
  if (!direction) return null;

  if (direction === 'next-category' && allowCategory) {
    window.advanceCategoryViaGesture?.();
    setGestureStatus('Categoria successiva →');
    setTimeout(updateIdleGestureStatus, CATEGORY_SWIPE_COOLDOWN_MS);
    return direction;
  }

  if (direction === 'prev-category' && allowCategory) {
    window.prevCategoryViaGesture?.();
    setGestureStatus('← categoria precedente');
    setTimeout(updateIdleGestureStatus, CATEGORY_SWIPE_COOLDOWN_MS);
    return direction;
  }

  if ((direction === 'down' || direction === 'up') && allowScroll) {
    window.scrollContentByGesture?.(direction);
    setGestureStatus(direction === 'down' ? 'Scroll ↓' : 'Scroll ↑');
    setTimeout(updateIdleGestureStatus, SCROLL_GESTURE_COOLDOWN_MS);
    return direction;
  }

  return null;
}

function processOpenHandSwipe(hand, frameW, frameH, ctx, options = {}) {
  if (hand) {
    drawHandDebug(hand, ctx, 'scroll');
  }

  const direction = openHandSwipeDetector.update(hand, frameW, frameH);
  if (direction) {
    return applyOpenHandSwipe(direction, options);
  }

  if (hand && isOpenHand(hand, frameW, frameH)) {
    const hints = [];
    if (options.allowCategory) hints.push('←→ categoria');
    if (options.allowScroll) hints.push('↓↑ scroll');
    if (hints.length) {
      setGestureStatus(`Mano aperta: ${hints.join(' · ')}`);
    }
  }

  return null;
}

function isOpenHand(hand, frameW, frameH) {
  if (!hand) return false;
  if (isSmokingGesture(hand, frameW, frameH)) return false;
  if (isIndexMiddleDown(hand)) return false;
  if (isIndexPointLeftChest(hand, frameW, frameH)) return false;

  const k = hand.keypoints;
  const indexOpen = k[8].y < k[6].y + 8;
  const middleOpen = k[12].y < k[10].y + 8;
  const ringOpen = k[16].y < k[14].y + 12;
  const pinkyOpen = k[20].y < k[18].y + 12;

  return indexOpen && middleOpen && ringOpen && pinkyOpen;
}

function drawHandDebug(hand, ctx, mode = 'portrait') {
  const color = '#E5E5E5';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  const highlight = mode === 'pack'
    ? [8, 5, 6]
    : mode === 'smoking'
      ? [4, 8, 12, 6, 10]
      : mode === 'scroll'
        ? [0, 8, 12, 16, 20]
        : [8, 12, 6, 10];

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

  if (mode === 'smoking') {
    const thumb = hand.keypoints[4];
    const index = hand.keypoints[8];
    const middle = hand.keypoints[12];
    ctx.beginPath();
    ctx.moveTo(thumb.x, thumb.y);
    ctx.lineTo(index.x, index.y);
    ctx.lineTo(middle.x, middle.y);
    ctx.stroke();
  }
}

function resetAllGestureDetectors() {
  doubleDownDetector.reset();
  leftChestDetector.reset();
  adsSmokingTracker.reset();
  openHandSwipeDetector.reset();
}

function updateIdleGestureStatus() {
  const mode = getGestureMode();
  if (mode === 'pubblicità') {
    setGestureStatus('Ads: fumo · ↓↑ scroll · ←→ categoria');
  } else if (mode === 'about') {
    setGestureStatus('About: soffia · ↓↑ scroll · ←→ categoria');
  } else if (mode === 'fotografie') {
    setGestureStatus('Portraits: ↓↓ indice+medio · ←→ categoria');
  } else if (mode === 'pacchetti') {
    setGestureStatus('Packs: indice petto sx · ←→ categoria');
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

    const mode = getGestureMode();
    if (mode !== lastGestureCategory) {
      resetAllGestureDetectors();
      if (lastGestureCategory === 'pubblicità' || mode === 'pubblicità') {
        window.resetAdsSmokingGesture?.();
      }
      if (lastGestureCategory === 'about' || mode === 'about') {
        window.resetAboutBlowGesture?.();
      }
      lastGestureCategory = mode;
    }

    if (isPortraitGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (hands.length) {
          const hand = hands[0];

          if (processOpenHandSwipe(hand, frameW, frameH, ctx, { allowCategory: true })) {
            doubleDownDetector.reset();
          } else {
            drawHandDebug(hand, ctx, 'portrait');

            if (doubleDownDetector.update(hand)) {
              setGestureStatus('Gesto ↓↓ — prossimo ritratto');
              window.advancePortraitViaGesture?.();
              setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
            } else if (isIndexMiddleDown(hand)) {
              setGestureStatus('Indice + medio ↓ — pronto per colpo');
            }
          }
        } else {
          handleOpenHandSwipeLost(performance.now(), { allowCategory: true });
          doubleDownDetector.reset();
          setGestureStatus('Portraits: ↓↓ indice+medio · ←→ categoria');
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

          if (processOpenHandSwipe(hand, frameW, frameH, ctx, { allowCategory: true })) {
            leftChestDetector.reset();
          } else {
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
          }
        } else {
          handleOpenHandSwipeLost(performance.now(), { allowCategory: true });
          leftChestDetector.reset();
          setGestureStatus('Packs: indice petto sx · ←→ categoria');
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isAboutScrollActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (hands.length) {
          if (!processOpenHandSwipe(hands[0], frameW, frameH, ctx, { allowScroll: true, allowCategory: true })
            && !window.isAboutMicBlowing?.()) {
            setGestureStatus('About: soffia · ↓↑ scroll · ←→ categoria');
          }
        } else {
          handleOpenHandSwipeLost(performance.now(), { allowScroll: true, allowCategory: true });
          if (!window.isAboutMicBlowing?.()) {
            setGestureStatus('About: soffia · ↓↑ scroll · ←→ categoria');
          }
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isAdsGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (hands.length) {
          const hand = hands[0];
          const smoking = isSmokingGesture(hand, frameW, frameH);

          if (smoking) {
            openHandSwipeDetector.reset();
            adsSmokingTracker.update(hand, frameW, frameH);
            drawHandDebug(hand, ctx, 'smoking');
            const index = window.getAdRevealIndex?.();
            const total = document.querySelectorAll('.myPhotos.layout-pubblicita .card').length;
            setGestureStatus(
              typeof index === 'number'
                ? `Pubblicità ${index + 1}/${total} accesa`
                : 'Gesto fumo — immagine accesa'
            );
          } else {
            if (adsSmokingTracker.wasActive) {
              adsSmokingTracker.update(null, frameW, frameH);
            } else {
              adsSmokingTracker.reset();
            }

            if (!processOpenHandSwipe(hand, frameW, frameH, ctx, { allowScroll: true, allowCategory: true })) {
              setGestureStatus('Ads: fumo · ↓↑ scroll · ←→ categoria');
            }
          }
        } else {
          if (adsSmokingTracker.wasActive) {
            adsSmokingTracker.update(null, frameW, frameH);
          } else {
            adsSmokingTracker.reset();
          }

          handleOpenHandSwipeLost(performance.now(), { allowScroll: true, allowCategory: true });
          setGestureStatus('Ads: fumo · ↓↑ scroll · ←→ categoria');
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
