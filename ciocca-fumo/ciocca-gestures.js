// Category gesture controls — hand tracking per category

const CATEGORY_GESTURE_INTERACTIONS_ENABLED = true;

let handDetector = null;
let gestureStream = null;
let gestureDetecting = false;
let gestureSurfaceEnabled = false;

function isGestureCategoryActiveSafe() {
  if (typeof window.isGestureCategoryActive === 'function') {
    return window.isGestureCategoryActive();
  }
  const cat = getActiveCategorySafe();
  return cat === 'fotografie' || cat === 'pacchetti' || cat === 'pubblicità';
}

function isGestureSurfaceActive() {
  if (!gestureSurfaceEnabled) return false;
  if (!CATEGORY_GESTURE_INTERACTIONS_ENABLED) return false;
  if (document.body.classList.contains('about-open')) return true;
  return isPortraitGestureActive() || isPackGestureActive() || isAdRevealGestureActive();
}

function shouldShowGestureCamera() {
  if (!gestureSurfaceEnabled) return false;
  if (document.body.classList.contains('about-open')) return true;
  if (!CATEGORY_GESTURE_INTERACTIONS_ENABLED) return false;
  const cat = getActiveCategorySafe();
  if (cat === 'pubblicità') return isAdRevealGestureActive();
  return cat === 'fotografie' || cat === 'pacchetti';
}

function updateGestureCameraVisibility() {
  const camera = document.getElementById('gesture-camera');
  const show = shouldShowGestureCamera();
  document.body.classList.toggle('gesture-camera-active', show);
  if (!camera) return;
  camera.removeAttribute('hidden');
  camera.setAttribute('aria-hidden', String(!show));
  syncGestureStatusVisibility();
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

const TAP_ON_OTHER_HAND_NEAR_PX = 58;
const TAP_ON_OTHER_HAND_DOUBLE_WINDOW_MS = 950;
const TAP_ON_OTHER_HAND_MIN_GAP_MS = 70;

const otherHandDoubleTapDetector = {
  tapCount: 0,
  lastTapTime: 0,
  wasNear: false,

  reset() {
    this.tapCount = 0;
    this.lastTapTime = 0;
    this.wasNear = false;
  },

  minTapDistance(hands) {
    let best = Infinity;

    for (let i = 0; i < hands.length; i += 1) {
      for (let j = 0; j < hands.length; j += 1) {
        if (i === j) continue;
        const tapper = hands[i];
        const target = hands[j];
        if (!isIndexMiddleTapPosture(tapper)) continue;

        const targetPoints = [0, 5, 9, 13, 17];
        [8, 12].forEach((tipIdx) => {
          const tip = tapper.keypoints[tipIdx];
          if (!tip) return;
          targetPoints.forEach((idx) => {
            const p = target.keypoints[idx];
            if (!p) return;
            best = Math.min(best, Math.hypot(tip.x - p.x, tip.y - p.y));
          });
        });
      }
    }

    return best;
  },

  update(hands, now) {
    if (now < gestureCooldownUntil) {
      if (!this.isNear(hands)) this.wasNear = false;
      return false;
    }

    const near = this.isNear(hands);

    if (near && !this.wasNear) {
      if (now - this.lastTapTime > TAP_ON_OTHER_HAND_DOUBLE_WINDOW_MS) {
        this.tapCount = 0;
      }
      if (now - this.lastTapTime >= TAP_ON_OTHER_HAND_MIN_GAP_MS) {
        this.tapCount += 1;
        this.lastTapTime = now;
      }
      this.wasNear = true;

      if (this.tapCount >= 2) {
        this.reset();
        gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
        return true;
      }
      return false;
    }

    if (!near) {
      this.wasNear = false;
    }

    return false;
  },

  isNear(hands) {
    if (!hands || hands.length < 2) return false;
    const dist = this.minTapDistance(hands);
    return dist < TAP_ON_OTHER_HAND_NEAR_PX;
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
      if (!isPackLeftChestTouch(hand, frameW, frameH)) {
        this.wasActive = false;
      }
      return false;
    }

    const active = isPackLeftChestTouch(hand, frameW, frameH);

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

function shouldShowGestureStatus() {
  return shouldShowGestureCamera()
    || document.body.classList.contains('about-open')
    || document.body.classList.contains('category-gesture-active');
}

function syncGestureStatusVisibility() {
  const el = document.getElementById('gesture-status');
  if (!el) return;
  const show = shouldShowGestureStatus();
  el.hidden = !show;
  if (!show) el.textContent = '';
}

function setGestureStatus(text) {
  const el = document.getElementById('gesture-status');
  if (!el) return;
  if (!shouldShowGestureStatus()) {
    el.textContent = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = text;
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

function isAboutScrollActive() {
  return document.body.classList.contains('about-open');
}

function isVerticalScrollActive() {
  return isAboutScrollActive();
}

function isCategoryNavigationActive() {
  return isGestureUiActive();
}

function isPortraitGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'fotografie';
}

function processPortraitOtherHandTap(hands, ctx) {
  if (otherHandDoubleTapDetector.update(hands, performance.now())) {
    resetAllGestureDetectors();
    hands.forEach(hand => drawHandDebug(hand, ctx, 'portrait'));
    setGestureStatus('Next portrait');
    window.advancePortraitViaGesture?.();
    setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
    return true;
  }

  if (hands.length >= 2) {
    hands.forEach(hand => drawHandDebug(hand, ctx, 'portrait'));
    if (otherHandDoubleTapDetector.isNear(hands)) {
      setGestureStatus('Tap again — index+middle on other hand');
    } else {
      setGestureStatus('Index+middle on other hand — tap twice');
    }
    return false;
  }

  if (hands.length === 1) {
    drawHandDebug(hands[0], ctx, 'portrait');
    setGestureStatus('Show both hands in frame');
    return false;
  }

  updateIdleGestureStatus();
  return false;
}

function isPackGestureActive() {
  return isGestureUiActive() && getActiveCategorySafe() === 'pacchetti';
}

function isAdRevealGestureActive() {
  if (!isGestureUiActive()) return false;
  const cat = getActiveCategorySafe();
  if (cat === 'pubblicità') return !window.isCategoryImagesRevealed?.();
  return cat === 'fotografie' || cat === 'pacchetti';
}

function attemptAdsRevealWithHands(hands, ctx) {
  if (!isAdRevealGestureActive() || !hands.length || !ctx) return false;

  const canvas = ctx.canvas;
  const frameW = canvas.width;
  const frameH = canvas.height;
  const hand = hands[0];
  const nearMouth = isCigaretteToMouthGesture(hand, frameW, frameH);
  const holdPending = cigaretteToMouthDetector.holdStart > 0;

  if (!nearMouth && !holdPending) return false;

  return processAdCigaretteGesture(hand, frameW, frameH, ctx);
}

function handScale(hand) {
  const k = hand.keypoints;
  return Math.hypot(k[5].x - k[0].x, k[5].y - k[0].y) || 48;
}

function isIndexMiddleUnited(hand, scale) {
  const k = hand.keypoints;
  return keypointDistance(k[8], k[12]) < scale * 0.36;
}

function isCigaretteToMouthGesture(hand, frameW, frameH) {
  if (!hand) return false;

  const k = hand.keypoints;
  const scale = handScale(hand);
  const indexTip = k[8];
  const middleTip = k[12];
  const wrist = k[0];

  const indexMiddleUnited = isIndexMiddleUnited(hand, scale);
  const indexMiddleExtended = isIndexMiddleExtended(hand);
  const nearMouthBand =
    indexTip.y < frameH * 0.52
    && middleTip.y < frameH * 0.52
    && indexTip.y > frameH * 0.1;
  const handRaised = indexTip.y < wrist.y + scale * 0.4;

  return indexMiddleUnited && indexMiddleExtended && nearMouthBand && handRaised;
}

const cigaretteToMouthDetector = {
  holdStart: 0,
  wasTriggered: false,

  reset() {
    this.holdStart = 0;
    this.wasTriggered = false;
  },

  update(hand, frameW, frameH) {
    const now = performance.now();
    const active = isCigaretteToMouthGesture(hand, frameW, frameH);

    if (now < gestureCooldownUntil) {
      if (!active) {
        this.holdStart = 0;
        this.wasTriggered = false;
      }
      return false;
    }

    if (!active) {
      this.holdStart = 0;
      this.wasTriggered = false;
      return false;
    }

    if (!this.holdStart) this.holdStart = now;

    if (!this.wasTriggered && now - this.holdStart >= 320) {
      this.wasTriggered = true;
      gestureCooldownUntil = now + GESTURE_COOLDOWN_MS;
      return true;
    }

    return false;
  },

  holdProgress() {
    if (!this.holdStart) return 0;
    return Math.min(1, (performance.now() - this.holdStart) / 320);
  },
};

function processAdCigaretteGesture(hand, frameW, frameH, ctx) {
  if (!hand) {
    cigaretteToMouthDetector.reset();
    document.body.classList.remove('ad-smoking-gesture');
    updateIdleGestureStatus();
    return false;
  }

  openHandSwipeDetector.reset();
  drawHandDebug(hand, ctx, 'smoke');

  const nearMouth = isCigaretteToMouthGesture(hand, frameW, frameH);
  document.body.classList.toggle('ad-smoking-gesture', nearMouth);

  if (cigaretteToMouthDetector.update(hand, frameW, frameH)) {
    window.openAdsViaGesture?.();
    setGestureStatus('Advertisements open');
    setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
    updateGestureCameraVisibility();
    return true;
  }

  if (nearMouth) {
    const pct = Math.round(cigaretteToMouthDetector.holdProgress() * 100);
    setGestureStatus(pct > 0 && pct < 100
      ? `Index and middle to mouth… ${pct}%`
      : 'Hold index and middle together at mouth');
    return false;
  }

  setGestureStatus('Ads: index and middle together at mouth');
  return false;
}

function keypointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function isIndexMiddleExtended(hand) {
  const k = hand.keypoints;
  const indexStraight = k[8].y <= k[6].y + 12;
  const middleStraight = k[12].y <= k[10].y + 12;
  const indexLen = Math.hypot(k[8].x - k[5].x, k[8].y - k[5].y) > 40;
  const middleLen = Math.hypot(k[12].x - k[9].x, k[12].y - k[9].y) > 36;
  const ringCurled = k[16].y > k[14].y + 4;
  const pinkyCurled = k[20].y > k[18].y + 4;

  return indexStraight && middleStraight && indexLen && middleLen && ringCurled && pinkyCurled;
}

function isIndexMiddleTapPosture(hand) {
  return isIndexMiddleDown(hand) || isIndexMiddleExtended(hand);
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

function isPackLeftChestTouch(hand, frameW, frameH) {
  if (!hand) return false;

  const handZone = isIndexPointLeftChestHand(hand, frameW, frameH);
  const body = window.detectPackLeftChestTouch?.(frameW, frameH, hand);

  if (body === true || handZone) return true;
  if (body === false) return false;
  return handZone;
}

function isIndexPointLeftChestHand(hand, frameW, frameH) {
  const k = hand.keypoints;
  const indexTip = k[8];
  const indexMcp = k[5];
  const wrist = k[0];

  if (!isIndexExtended(hand) || !areOtherFingersCurled(hand)) {
    return false;
  }

  const chestYMin = frameH * 0.6;
  const chestYMax = frameH * 1;
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
  return isPackLeftChestTouch(hand, frameW, frameH)
    || (isIndexExtended(hand) && areOtherFingersCurled(hand));
}

function isPortraitGestureBusy(hand) {
  return isIndexMiddleDown(hand)
    || doubleDownDetector.phase !== 'idle'
    || doubleDownDetector.strokeCount > 0;
}

function shouldBlockOpenHandSwipe(hand, frameW, frameH) {
  const mode = getGestureMode();

  if (mode === 'fotografie') {
    return true;
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
    setGestureStatus('Open hand: ↓↑ scroll');
  }

  return null;
}

function isOpenHand(hand, frameW, frameH) {
  if (!hand) return false;
  if (isIndexMiddleDown(hand)) return false;
  if (isPackLeftChestTouch(hand, frameW, frameH)) return false;

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
    : mode === 'smoke'
      ? [8, 12, 6, 10, 0]
    : mode === 'scroll' || mode === 'wipe'
      ? [0, 5, 9, 13, 17]
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

  if (mode === 'smoke') {
    const index = hand.keypoints[8];
    const middle = hand.keypoints[12];
    ctx.beginPath();
    ctx.moveTo(index.x, index.y);
    ctx.lineTo(middle.x, middle.y);
    ctx.stroke();
  }

}

function processPackLeftChestGesture(hand, frameW, frameH, ctx) {
  if (!hand) {
    leftChestDetector.reset();
    updateIdleGestureStatus();
    return false;
  }

  openHandSwipeDetector.reset();
  drawHandDebug(hand, ctx, 'pack');

  if (leftChestDetector.update(hand, frameW, frameH)) {
    setGestureStatus('Next pack');
    window.advancePackViaGesture?.();
    setTimeout(updateIdleGestureStatus, GESTURE_COOLDOWN_MS);
    return true;
  }

  if (isPackLeftChestTouch(hand, frameW, frameH)) {
    setGestureStatus('Index on left chest…');
  } else if (isIndexExtended(hand)) {
    setGestureStatus('Point index at left chest');
  } else {
    updateIdleGestureStatus();
  }

  return false;
}

const ABOUT_WIPE_DISTANCE_SCALE = 720;

const aboutWipeSound = {
  ctx: null,
  nodes: null,
};

async function ensureAboutWipeAudio() {
  if (!aboutWipeSound.ctx) {
    aboutWipeSound.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (aboutWipeSound.ctx.state === 'suspended') {
    await aboutWipeSound.ctx.resume();
  }
  return aboutWipeSound.ctx;
}

function startAboutWipeSound() {
  if (aboutWipeSound.nodes || !aboutWipeSound.ctx) return;

  const ctx = aboutWipeSound.ctx;
  const bufferSize = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 680;

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 90;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);

  aboutWipeSound.nodes = { source, gain, lowPass };
}

function setAboutWipeSoundIntensity(intensity) {
  if (!aboutWipeSound.nodes?.gain || !aboutWipeSound.ctx) return;

  const level = Math.max(0, Math.min(1, intensity));
  const gain = level * 0.11;
  const { gain: gainNode, lowPass } = aboutWipeSound.nodes;
  const ctx = aboutWipeSound.ctx;

  gainNode.gain.setTargetAtTime(gain, ctx.currentTime, 0.08);
  lowPass.frequency.setTargetAtTime(520 + level * 320, ctx.currentTime, 0.1);
}

function playClothWipeSwipe(intensity) {
  if (!aboutWipeSound.ctx || intensity < 0.35) return;

  const ctx = aboutWipeSound.ctx;
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(Math.sin(Math.PI * t), 1.4);
    data[i] = (Math.random() * 2 - 1) * env * 0.7;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420 + intensity * 180;

  const gain = ctx.createGain();
  gain.gain.value = 0.05 + intensity * 0.06;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
  source.stop(ctx.currentTime + 0.12);
}

function stopAboutWipeSound() {
  if (!aboutWipeSound.nodes?.gain || !aboutWipeSound.ctx) {
    aboutWipeSound.nodes = null;
    return;
  }

  const { source, gain } = aboutWipeSound.nodes;
  const ctx = aboutWipeSound.ctx;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);

  window.setTimeout(() => {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    if (aboutWipeSound.nodes?.source === source) {
      aboutWipeSound.nodes = null;
    }
  }, 160);
}

async function syncAboutWipeAudio(active, wipeSpeed = 0) {
  if (!active) {
    stopAboutWipeSound();
    return;
  }

  await ensureAboutWipeAudio();
  startAboutWipeSound();
  setAboutWipeSoundIntensity(wipeSpeed);
}

const aboutWindowWipe = {
  lastX: null,
  lastY: null,
  trail: [],

  reset() {
    this.lastX = null;
    this.lastY = null;
    this.trail = [];
    stopAboutWipeSound();
  },

  resetStroke() {
    this.lastX = null;
    this.lastY = null;
  },

  update(hand, frameW, frameH) {
    if (!hand || !isWindowWipingHand(hand, frameW, frameH)) {
      this.resetStroke();
      window.setAboutWiping?.(false);
      syncAboutWipeAudio(false);
      return false;
    }

    window.setAboutWiping?.(true);
    const palm = hand.keypoints[9];
    const x = palm.x;
    const y = palm.y;
    let wipeSpeed = 0;

    if (this.lastX !== null) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      const dist = Math.hypot(dx, dy);

      if (dist > 2.5 && Math.abs(dx) >= Math.abs(dy) * 0.55) {
        const amount = dist / ABOUT_WIPE_DISTANCE_SCALE;
        window.addAboutWipeProgress?.(amount);
        wipeSpeed = Math.min(1, dist / 28);
        if (dist > 11) playClothWipeSwipe(wipeSpeed);
        this.trail.push({ x1: this.lastX, y1: this.lastY, x2: x, y2: y });
        if (this.trail.length > 24) this.trail.shift();
      }
    }

    syncAboutWipeAudio(true, wipeSpeed || 0.08);

    this.lastX = x;
    this.lastY = y;
    return true;
  },
};

function isWindowWipingHand(hand, frameW, frameH) {
  if (!hand || !isOpenHand(hand, frameW, frameH)) return false;

  const k = hand.keypoints;
  const palmWidth = Math.hypot(k[5].x - k[17].x, k[5].y - k[17].y);
  const palmHeight = Math.hypot(k[0].x - k[9].x, k[0].y - k[9].y);

  return palmWidth > 30 && palmHeight > 24 && palmWidth < frameW * 0.72;
}

function formatAboutWipeStatus() {
  const index = window.getAboutRevealIndex?.();
  const total = document.querySelectorAll('.about-plate img, .about-grid img').length;
  const progress = typeof index === 'number' ? window.getAboutWipeProgress?.(index) ?? 0 : 0;

  if (progress >= 0.92 && typeof index === 'number' && total > 0) {
    return `Glass clear — plate ${index + 1}/${total}`;
  }
  if (window.isAboutWiping?.()) {
    return `Wipe the glass — plate ${typeof index === 'number' ? index + 1 : '?'}/${total}`;
  }
  return 'About: wipe the glass with your hand · ↓↑ scroll';
}

function drawWindowWipeTrail(ctx) {
  if (!aboutWindowWipe.trail.length) return;

  ctx.strokeStyle = 'rgba(229, 229, 229, 0.45)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';

  aboutWindowWipe.trail.forEach((seg) => {
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  });
}

async function processAboutInteraction(video, ctx, now) {
  const frameW = ctx.canvas.width;
  const frameH = ctx.canvas.height;

  if (!handDetector) return;

  const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
  const wipeProgress = window.getAboutWipeProgress?.() ?? 0;

  if (hands.length && wipeProgress < 0.98) {
    const hand = hands[0];
    const wiping = aboutWindowWipe.update(hand, frameW, frameH);

    if (wiping || window.isAboutWiping?.()) {
      openHandSwipeDetector.reset();
      drawHandDebug(hand, ctx, 'wipe');
      drawWindowWipeTrail(ctx);
      setGestureStatus(formatAboutWipeStatus());
      return;
    }

    if (!processOpenHandSwipe(hand, frameW, frameH, ctx, { allowScroll: true })) {
      updateIdleGestureStatus();
    }
    return;
  }

  aboutWindowWipe.resetStroke();
  window.setAboutWiping?.(false);
  syncAboutWipeAudio(false);

  if (hands.length) {
    if (!processOpenHandSwipe(hands[0], frameW, frameH, ctx, { allowScroll: true })) {
      updateIdleGestureStatus();
    }
  } else {
    handleOpenHandSwipeLost(now, { allowScroll: true });
    updateIdleGestureStatus();
  }
}

function resetAllGestureDetectors() {
  doubleDownDetector.reset();
  otherHandDoubleTapDetector.reset();
  leftChestDetector.reset();
  openHandSwipeDetector.reset();
  aboutWindowWipe.reset();
  cigaretteToMouthDetector.reset();
  document.body.classList.remove('ad-smoking-gesture');
}

function updateIdleGestureStatus() {
  const mode = getGestureMode();

  if (mode === 'fotografie') {
    setGestureStatus('Portraits: 2× tap · index+middle to mouth → Ads');
  } else if (mode === 'pacchetti') {
    setGestureStatus('Packs: left chest · index+middle to mouth → Ads');
  } else if (mode === 'pubblicità') {
    setGestureStatus('Ads: index and middle together at mouth');
  } else if (mode === 'about') {
    if (window.isAboutWiping?.()) return;
    setGestureStatus('About: wipe the glass with your hand · ↓↑ scroll');
  } else {
    setGestureStatus('');
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
        maxHands: 2,
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
    window.initPackBodyTracking?.();
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

  updateGestureCameraVisibility();

  if (!isGestureSurfaceActive()) {
    requestAnimationFrame(detectCategoryGestures);
    return;
  }

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
        aboutWindowWipe.reset();
        window.resetAboutWipeGesture?.();
      }
      lastGestureCategory = mode;
      updateGestureCameraVisibility();
    }

    if (isPortraitGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });

        if (attemptAdsRevealWithHands(hands, ctx)) {
          requestAnimationFrame(detectCategoryGestures);
          return;
        }

        if (hands.length >= 2) {
          processPortraitOtherHandTap(hands, ctx);
        } else {
          updateIdleGestureStatus();
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isPackGestureActive()) {
      window.drawPackChestZoneDebug?.(ctx);
      try {
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (isAdRevealGestureActive()) {
          const handsForAds = await handDetector.estimateHands(video, { flipHorizontal: true });
          if (attemptAdsRevealWithHands(handsForAds, ctx)) {
            /* switched to Ads */
            requestAnimationFrame(detectCategoryGestures);
            return;
          }
        }

        const hands = await handDetector.estimateHands(video, { flipHorizontal: false });

        if (hands.length) {
          processPackLeftChestGesture(hands[0], frameW, frameH, ctx);
        } else {
          openHandSwipeDetector.reset();
          leftChestDetector.reset();
          updateIdleGestureStatus();
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isAdRevealGestureActive()) {
      try {
        const hands = await handDetector.estimateHands(video, { flipHorizontal: true });
        const frameW = canvas.width;
        const frameH = canvas.height;

        if (hands.length) {
          processAdCigaretteGesture(hands[0], frameW, frameH, ctx);
        } else {
          cigaretteToMouthDetector.reset();
          document.body.classList.remove('ad-smoking-gesture');
          updateIdleGestureStatus();
        }
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else if (isAboutScrollActive()) {
      try {
        await processAboutInteraction(video, ctx, performance.now());
      } catch (err) {
        /* ignore per-frame errors */
      }
    } else {
      resetAllGestureDetectors();
      updateIdleGestureStatus();
    }
  }

  updateGestureCameraVisibility();
  requestAnimationFrame(detectCategoryGestures);
}

window.initCategoryGestures = initCategoryGestures;
window.ensureCategoryGestures = ensureCategoryGestures;
window.enableGestureSurface = enableGestureSurface;
window.updateIdleGestureStatus = updateIdleGestureStatus;
window.updateGestureCameraVisibility = updateGestureCameraVisibility;
window.stopAboutWipeSound = stopAboutWipeSound;
window.aboutWindowWipeResetStroke = () => aboutWindowWipe.resetStroke();
