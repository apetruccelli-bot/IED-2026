// Packs: left-chest zone via machine-learning/body-tracking (IedBodyTracking API).

let packChestZoneCache = null;

function getGestureWebcam() {
  return document.getElementById('gesture-webcam');
}

function isIndexExtendedOnHand(hand) {
  const k = hand.keypoints;
  const indexTip = k[8];
  const indexPip = k[6];
  const indexMcp = k[5];
  const indexLen = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);
  const indexStraight = indexTip.y <= indexPip.y + 12;
  return indexLen > 42 && indexStraight;
}

async function initPackBodyTracking() {
  if (!window.IedBodyTracking) {
    console.warn('IedBodyTracking missing — load ../machine-learning/body-tracking/body-tracking-api.js');
    return false;
  }
  try {
    await window.IedBodyTracking.loadPoseModel();
    return true;
  } catch (err) {
    console.warn('Pack body tracking init failed:', err);
    return false;
  }
}

async function refreshPackChestZone(frameW, frameH) {
  packChestZoneCache = null;
  if (!window.IedBodyTracking?.isModelReady()) return null;

  const video = getGestureWebcam();
  if (!video || video.readyState < 2) return null;

  try {
    const pose = await window.IedBodyTracking.estimatePrimaryPose(video, {
      flipHorizontal: false,
      maxDetections: 1,
    });
    if (!pose?.keypoints) return null;
    packChestZoneCache = window.IedBodyTracking.buildLeftChestZone(
      pose.keypoints,
      frameW,
      frameH
    );
    return packChestZoneCache;
  } catch {
    return null;
  }
}

async function detectPackLeftChestTouch(frameW, frameH, hand) {
  if (!hand || !isIndexExtendedOnHand(hand)) return null;

  const zone = packChestZoneCache || (await refreshPackChestZone(frameW, frameH));
  if (!zone) return null;

  const indexTip = hand.keypoints[8];
  return window.IedBodyTracking.isPointInZone(indexTip.x, indexTip.y, zone) ? true : false;
}

function drawPackChestZoneDebug(ctx) {
  if (!ctx || !packChestZoneCache) return;
  window.IedBodyTracking?.drawLeftChestZone(ctx, packChestZoneCache);
}

window.initPackBodyTracking = initPackBodyTracking;
window.detectPackLeftChestTouch = detectPackLeftChestTouch;
window.drawPackChestZoneDebug = drawPackChestZoneDebug;
