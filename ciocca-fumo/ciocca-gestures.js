// Category gesture controls — hand tracking per category

let handDetector = null;
let gestureStream = null;
let gestureDetecting = false;
let gestureSurfaceEnabled = false;

const GESTURE_CATEGORIES = ['fotografie', 'pacchetti', 'pubblicità'];

function isGestureSurfaceActive() {
  if (!gestureSurfaceEnabled) return false;
  if (document.body.classList.contains('about-open')) return true;
  const cat = getActiveCategorySafe();
  return GESTURE_CATEGORIES.includes(cat);
}

function updateGestureCameraVisibility() {
  const camera = document.getElementById('gesture-camera');
  const show = isGestureSurfaceActive();
  document.body.classList.toggle('gesture-camera-active', show);
  if (!camera) return;
  camera.hidden = !show;
  camera.setAttribute('aria-hidden', String(!show));
}

async function ensureCategoryGestures() {
  updateGestureCameraVisibility();
  if (!isGestureSurfaceActive()) return;
  await initCategoryGestures();
}

function enableGestureSurface() {
  gestureSurfaceEnabled = true;
  ensureCategoryGestures();
}
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

const openPubblicitaGestureTracker = {
  wasActive: false,

  reset() {
    this.wasActive = false;
  },

  update(hand, frameW, frameH) {
    const now = performance.now();
    const inAds = getActiveCategorySafe() === 'pubblicità'
      && !document.body.classList.contains('about-open');

    if (now < gestureCooldownUntil) {
      if (!hand || !isSmokingGesture(hand, frameW, frameH)) {
        this.wasActive = false;
      }
      return false;
    }

    const active = hand ? isSmokingGesture(hand, frameW, frameH) : false;

    if (inAds) {
      if (window.isCategoryImagesRevealed?.()) {
        if (!active) this.wasActive = false;
        return false;
      }

      if (active && !this.wasActive) {
        this.wasActive = true;
        gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
        window.revealCategoryImages?.();
        return true;
      }

      if (!active) {
        this.wasActive = false;
      }

      return false;
    }

    if (active && !this.wasActive) {
      this.wasActive = true;
      gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
      categoryGestureCooldownUntil = now + CATEGORY_SWIPE_COOLDOWN_MS;
      window.openPubblicitaViaGesture?.();
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
    if (now < gestureCooldownUntil || now < categoryGestureCooldownUntil) {
      if (this.inStroke) this.reset();
      return null;
    }

    if (hand && shouldBlockOpenHandSwipe(hand, frameW, frameH)) {
      if (this.inStroke) this.reset();
      return null;
    }

    const openHand = hand && isOpenHand(hand, frameW, frameH);

    if (!openHand) {
      if (!this.inStroke) return null;
      return this.finishStroke(now);
    }

    if (now < scrollGestureCooldownUntil) {
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

function applyOpenHandSwipe(direction, { allowScroll = false } = {}) {
  if (!direction) return null;

  if ((direction === 'down' || direction === 'up') && allowScroll) {
    window.scrollContentByGesture?.(direction);
    setGestureStatus(direction === 'down' ? 'Scroll ↓' : 'Scroll ↑');
    setTimeout(updateIdleGestureStatus, SCROLL_GESTURE_COOLDOWN_MS);
    return direction;
  }

  return null;
}

function isPackPointingGesture(hand, frameW, frameH) {
  return isIndexPointLeftChest(hand, frameW, frameH)
    || (isIndexExtended(hand) && areOtherFingersCurled(hand));
}

function isPortraitGestureBusy(hand) {
  return isIndexMiddleDown(hand)
    || doubleDownDetector.phase !== 'idle'
    || doubleDownDetector.strokeCount > 0;
}

function shouldBlockOpenHandSwipe(hand, frameW, frameH) {
  const mode = getGestureMode();

  if (isSmokingGesture(hand, frameW, frameH) || openPubblicitaGestureTracker.wasActive) {
    return true;
  }

  if (mode === 'fotografie') {
    return isPortraitGestureBusy(hand);
  }

  if (mode === 'pacchetti') {
    return isPackPointingGesture(hand, frameW, frameH);
  }

  return false;
}

function processOpenHandSwipe(hand, frameW, frameH, ctx, options = {}) {
  if (hand && shouldBlockOpenHandSwipe(hand, frameW, frameH)) {
    openHandSwipeDetector.reset();
    return null;
  }

  if (hand) {
    drawHandDebug(hand, ctx, 'scroll');
  }

  const direction = openHandSwipeDetector.update(hand, frameW, frameH);
  if (direction) {
    return applyOpenHandSwipe(direction, options);
  }

  if (hand && isOpenHand(hand, frameW, frameH) && options.allowScroll) {
    setGestureStatus('Mano aperta: ↓↑ scroll');
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

function tryOpenPubblicitaGesture(hand, frameW, frameH) {
  if (!hand) return false;
  return openPubblicitaGestureTracker.update(hand, frameW, frameH);
}

function resetAllGestureDetectors() {
  doubleDownDetector.reset();
  leftChestDetector.reset();
  openPubblicitaGestureTracker.reset();
  openHandSwipeDetector.reset();
}

function updateIdleGestureStatus() {
  const mode = getGestureMode();
  const revealed = window.isCategoryImagesRevealed?.() ?? true;

  if (mode === 'pubblicità') {
    setGestureStatus(revealed ? 'Ads' : 'Ads: fumo → apri immagini');
  } else if (mode === 'about') {
    setGestureStatus('About: soffia · fumo → ads · ↓↑ scroll');
  } else if (mode === 'fotografie') {
    setGestureStatus(revealed
      ? 'Portraits: ↓↓ indice+medio · fumo → ads'
      : 'Portraits: ↓↓ apri immagini · fumo → ads');
  } else if (mode === 'pacchetti') {
    setGestureStatus(revealed
      ? 'Packs: indice petto sx · fumo → ads'
      : 'Packs: indice petto sx → apri immagini · fumo → ads');
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

  if (!isGestureSurfaceActive()) {
    updateGestureCameraVisibility();
    requestAnimationFrame(detectCategoryGestures);
    return;
  }

  updateGestureCameraVisibility();

  const video = document.getElementById('gesture-webcam');
  const canvas = document.getElementById('gesture-canvas');
  const ctx = canvas?.getContext('2d');

  if (handDetector && video && ctx && video.readyState >= 2) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const mode = getGestureMode();
    if (mode !== lastGestureCategory) {
      resetAllGestureDetectors();
      if (lastGestureCategory === 'pubblicità' || mode === 'pubblicità') {
        window.resetAdGestureState?.();
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

          if (tryOpenPubblicitaGesture(hand, frameW, frameH)) {
            openHandSwipeDetector.reset();
            doubleDownDetector.reset();
            drawHandDebug(hand, ctx, 'smoking');
            setGestureStatus('Pubblicità — categoria aperta');
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (isPortraitGestureBusy(hand)) {
            openHandSwipeDetector.reset();
            drawHandDebug(hand, ctx, 'portrait');

            if (doubleDownDetector.update(hand)) {
              setGestureStatus(window.isCategoryImagesRevealed?.()
                ? 'Gesto ↓↓ — prossimo ritratto'
                : 'Gesto ↓↓ — immagini aperte');
              window.advancePortraitViaGesture?.();
              setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
            } else if (isIndexMiddleDown(hand)) {
              setGestureStatus('Indice + medio ↓ — pronto per colpo');
            }
          } else {
            openHandSwipeDetector.reset();
            drawHandDebug(hand, ctx, 'portrait');
          }
        } else {
          openHandSwipeDetector.reset();
          doubleDownDetector.reset();
          setGestureStatus('Portraits: ↓↓ indice+medio · fumo → ads');
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

          if (tryOpenPubblicitaGesture(hand, frameW, frameH)) {
            openHandSwipeDetector.reset();
            leftChestDetector.reset();
            drawHandDebug(hand, ctx, 'smoking');
            setGestureStatus('Pubblicità — categoria aperta');
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (isPackPointingGesture(hand, frameW, frameH)) {
            openHandSwipeDetector.reset();
            drawHandDebug(hand, ctx, 'pack');

            if (leftChestDetector.update(hand, frameW, frameH)) {
              setGestureStatus(window.isCategoryImagesRevealed?.()
                ? 'Petto sinistro — prossimo pack'
                : 'Petto sinistro — immagini aperte');
              window.advancePackViaGesture?.();
              setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
            } else if (isIndexPointLeftChest(hand, frameW, frameH)) {
              setGestureStatus('Indice sul petto sinistro…');
            } else if (isIndexExtended(hand)) {
              setGestureStatus('Punta l’indice verso il petto sinistro');
            }
          } else {
            openHandSwipeDetector.reset();
            drawHandDebug(hand, ctx, 'pack');
          }
        } else {
          openHandSwipeDetector.reset();
          leftChestDetector.reset();
          setGestureStatus('Packs: indice petto sx · fumo → ads');
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
          const hand = hands[0];

          if (tryOpenPubblicitaGesture(hand, frameW, frameH)) {
            openHandSwipeDetector.reset();
            drawHandDebug(hand, ctx, 'smoking');
            setGestureStatus('Pubblicità — categoria aperta');
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (!window.isAboutMicBlowing?.()
            && !processOpenHandSwipe(hand, frameW, frameH, ctx, { allowScroll: true })) {
            setGestureStatus('About: soffia · fumo → ads · ↓↑ scroll');
          }
        } else {
          handleOpenHandSwipeLost(performance.now(), { allowScroll: true });
          if (!window.isAboutMicBlowing?.()) {
            setGestureStatus('About: soffia · fumo → ads · ↓↑ scroll');
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

          if (tryOpenPubblicitaGesture(hand, frameW, frameH)) {
            drawHandDebug(hand, ctx, 'smoking');
            setGestureStatus('Immagini aperte');
            setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
          } else if (isSmokingGesture(hand, frameW, frameH)) {
            drawHandDebug(hand, ctx, 'smoking');
            if (!window.isCategoryImagesRevealed?.()) {
              setGestureStatus('Fumo — apri immagini');
            }
          }
        } else {
          openPubblicitaGestureTracker.reset();
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
window.ensureCategoryGestures = ensureCategoryGestures;
window.enableGestureSurface = enableGestureSurface;
window.updateIdleGestureStatus = updateIdleGestureStatus;
