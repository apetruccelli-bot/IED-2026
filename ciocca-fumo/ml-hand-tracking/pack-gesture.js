/**
 * Cigarette Packs — indice verso il petto sinistro → pacchetto successivo.
 */
let handDetector = null;
let faceDetector = null;
let gestureVideo = null;
let gestureCanvas = null;
let gestureCtx = null;
let gestureInitialized = false;
let gestureDetecting = false;
let gestureCategoryActive = false;

let pointingFrames = 0;
let gestureCooldown = false;
let lastTriggerTime = 0;

const POINTING_FRAMES_NEEDED = 5;
const GESTURE_COOLDOWN_MS = 1000;

function setGestureStatus(text) {
  const el = document.getElementById('gesture-status');
  if (el) el.textContent = text;
}

function kp(hand, i) {
  return hand.keypoints[i];
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Indice esteso — deve essere il dito più lungo o chiaramente puntato in avanti */
function isIndexExtended(hand) {
  const indexLen = dist(kp(hand, 8), kp(hand, 5));
  const middleLen = dist(kp(hand, 12), kp(hand, 9));
  const ringLen = dist(kp(hand, 16), kp(hand, 13));
  const pinkyLen = dist(kp(hand, 20), kp(hand, 17));
  const wrist = kp(hand, 0);
  const scale = dist(kp(hand, 5), wrist) || 1;

  const indexDominant = indexLen > middleLen * 0.88
    && indexLen > ringLen * 0.95
    && indexLen > pinkyLen * 0.95;
  const indexLongEnough = indexLen > scale * 0.55;

  const indexTip = kp(hand, 8);
  const indexPip = kp(hand, 6);
  const indexForward = dist(indexTip, wrist) > dist(indexPip, wrist) * 1.05;

  return indexLongEnough && (indexDominant || indexForward);
}

/** Zona petto sinistro — da face mesh o fallback generoso */
function getLeftChestZone(faces, w, h) {
  if (faces?.length && faces[0].keypoints?.length > 400) {
    const k = faces[0].keypoints;
    const leftCheek = k[234];
    const leftJaw = k[127] || k[234];
    const chin = k[152];
    const nose = k[1];
    const rightCheek = k[454];

    if (leftCheek && chin && nose && rightCheek) {
      const faceW = Math.abs(rightCheek.x - leftCheek.x);
      const faceH = Math.abs(chin.y - nose.y);
      return {
        x: (leftCheek.x + leftJaw.x) / 2 - faceW * 0.12,
        y: chin.y + faceH * 0.95,
        radius: Math.max(faceW * 0.55, h * 0.14),
        fromFace: true,
      };
    }
  }

  return {
    x: w * 0.36,
    y: h * 0.55,
    radius: Math.min(w, h) * 0.24,
    fromFace: false,
  };
}

/** Indice punta verso / tocca il petto sinistro */
function isIndexAtLeftChest(hand, zone) {
  const tip = kp(hand, 8);
  const mcp = kp(hand, 5);
  const wrist = kp(hand, 0);

  const dTip = dist(tip, zone);

  if (dTip <= zone.radius) return true;

  const reachRadius = zone.radius * 2.4;
  if (dTip > reachRadius) return false;

  const toZoneX = zone.x - tip.x;
  const toZoneY = zone.y - tip.y;
  const fingerX = tip.x - mcp.x;
  const fingerY = tip.y - mcp.y;
  const fingerLen = Math.hypot(fingerX, fingerY) || 1;
  const toZoneLen = Math.hypot(toZoneX, toZoneY) || 1;
  const aimDot = (fingerX * toZoneX + fingerY * toZoneY) / (fingerLen * toZoneLen);

  const wristToZoneX = zone.x - wrist.x;
  const wristToZoneY = zone.y - wrist.y;
  const wristToTipX = tip.x - wrist.x;
  const wristToTipY = tip.y - wrist.y;
  const wLen = Math.hypot(wristToTipX, wristToTipY) || 1;
  const zLen = Math.hypot(wristToZoneX, wristToZoneY) || 1;
  const wristDot = (wristToTipX * wristToZoneX + wristToTipY * wristToZoneY) / (wLen * zLen);

  return aimDot > 0.05 || wristDot > 0.2;
}

function drawDebug(hand, zone, state) {
  if (!gestureCtx) return;

  gestureCtx.fillStyle = state.pointing ? 'rgba(229,229,229,0.18)' : 'rgba(255,255,255,0.08)';
  gestureCtx.beginPath();
  gestureCtx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  gestureCtx.fill();

  gestureCtx.strokeStyle = state.pointing ? '#E5E5E5' : '#FFFFFF80';
  gestureCtx.lineWidth = 2;
  gestureCtx.beginPath();
  gestureCtx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  gestureCtx.stroke();

  if (zone.fromFace) {
    gestureCtx.fillStyle = '#FFFFFF80';
    gestureCtx.font = '10px monospace';
    gestureCtx.fillText('chest', zone.x - 14, zone.y - zone.radius - 4);
  }

  if (!hand) return;

  const color = state.indexExt ? '#E5E5E5' : '#FFFFFF80';
  [[0, 5], [5, 6], [6, 7], [7, 8]].forEach(([a, b]) => {
    gestureCtx.strokeStyle = color;
    gestureCtx.lineWidth = 2;
    gestureCtx.beginPath();
    gestureCtx.moveTo(kp(hand, a).x, kp(hand, a).y);
    gestureCtx.lineTo(kp(hand, b).x, kp(hand, b).y);
    gestureCtx.stroke();
  });

  gestureCtx.fillStyle = state.pointing ? '#E5E5E5' : '#FFFFFF80';
  gestureCtx.beginPath();
  gestureCtx.arc(kp(hand, 8).x, kp(hand, 8).y, 7, 0, Math.PI * 2);
  gestureCtx.fill();
}

async function detectPackGestureFrame() {
  if (!gestureDetecting || !handDetector || !gestureVideo) return;

  const categoryOk = gestureCategoryActive
    && window.getArchiveActiveCategory?.() === 'pacchetti';

  try {
    if (categoryOk && gestureVideo.readyState >= 2) {
      const w = gestureCanvas.width;
      const h = gestureCanvas.height;

      let faces = [];
      if (faceDetector) {
        try {
          faces = await faceDetector.estimateFaces(gestureVideo, { flipHorizontal: true });
        } catch { /* hand-only fallback */ }
      }

      const hands = await handDetector.estimateHands(gestureVideo, { flipHorizontal: true });
      const zone = getLeftChestZone(faces, w, h);

      gestureCtx.clearRect(0, 0, w, h);

      if (!hands.length) {
        pointingFrames = 0;
        drawDebug(null, zone, { pointing: false, indexExt: false });
        setGestureStatus(faces.length ? 'show hand · face ok' : 'show hand to camera');
      } else if (gestureCooldown) {
        drawDebug(hands[0], zone, { pointing: true, indexExt: true });
        setGestureStatus('next pack…');
      } else {
        const hand = hands[0];
        const indexExt = isIndexExtended(hand);
        const atChest = indexExt && isIndexAtLeftChest(hand, zone);
        const pointing = atChest;

        drawDebug(hand, zone, { pointing, indexExt });

        const tipDist = Math.round(dist(kp(hand, 8), zone));

        if (pointing) {
          pointingFrames += 1;
          if (pointingFrames >= POINTING_FRAMES_NEEDED) {
            const now = performance.now();
            if (now - lastTriggerTime >= GESTURE_COOLDOWN_MS) {
              pointingFrames = 0;
              lastTriggerTime = now;
              gestureCooldown = true;
              setGestureStatus('→ petto sinistro ✓');
              window.advancePack?.();
              setTimeout(() => {
                gestureCooldown = false;
                setGestureStatus('Packs · indice → petto sinistro');
              }, GESTURE_COOLDOWN_MS);
            }
          } else {
            setGestureStatus(`pointing… ${pointingFrames}/${POINTING_FRAMES_NEEDED}`);
          }
        } else {
          pointingFrames = 0;
          if (!indexExt) {
            setGestureStatus('extend index finger');
          } else {
            setGestureStatus(`index ok · aim left chest (${tipDist}px)`);
          }
        }
      }
    } else if (gestureCtx) {
      gestureCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
    }
  } catch (error) {
    console.warn('Pack gesture:', error);
  }

  if (gestureDetecting) requestAnimationFrame(detectPackGestureFrame);
}

async function initPackGesture() {
  gestureCategoryActive = true;
  if (gestureInitialized) {
    setGestureStatus('Packs · indice → petto sinistro');
    return;
  }

  gestureVideo = document.getElementById('gesture-webcam');
  gestureCanvas = document.getElementById('gesture-canvas');
  if (!gestureVideo || !gestureCanvas) return;

  gestureCtx = gestureCanvas.getContext('2d');
  setGestureStatus('Loading models…');

  try {
    if (typeof handPoseDetection === 'undefined' || typeof tf === 'undefined') return;

    await tf.setBackend('webgl');
    await tf.ready();

    handDetector = await handPoseDetection.createDetector(
      handPoseDetection.SupportedModels.MediaPipeHands,
      { runtime: 'tfjs', modelType: 'full', maxHands: 2 },
    );

    if (typeof faceLandmarksDetection !== 'undefined') {
      try {
        faceDetector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', refineLandmarks: true, maxFaces: 1 },
        );
      } catch (e) {
        console.warn('Face model skipped, using fallback chest zone', e);
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    });

    gestureVideo.srcObject = stream;
    await gestureVideo.play();

    await new Promise((resolve, reject) => {
      if (gestureVideo.readyState >= 2) return resolve();
      gestureVideo.addEventListener('loadeddata', resolve, { once: true });
      gestureVideo.addEventListener('error', reject, { once: true });
    });

    gestureCanvas.width = gestureVideo.videoWidth;
    gestureCanvas.height = gestureVideo.videoHeight;

    gestureInitialized = true;
    gestureDetecting = true;

    document.getElementById('gesture-camera')?.classList.add('is-ready');
    setGestureStatus('Packs · indice → petto sinistro');
    requestAnimationFrame(detectPackGestureFrame);
  } catch (error) {
    console.error('Pack gesture init failed:', error);
    document.getElementById('gesture-camera')?.classList.remove('is-ready');
  }
}

function stopPackGesture() {
  gestureCategoryActive = false;
  pointingFrames = 0;
}

window.initPackGesture = initPackGesture;
window.stopPackGesture = stopPackGesture;
