let exploreDetector = null;
let exploreIsDetecting = false;
let exploreStream = null;
let exploreModelLoading = false;

let images_left = ['red', 'green', 'blue', 'yellow', 'cyan'];
let images_right = ['magenta', 'orange', 'purple', 'brown', 'pink'];
const exploreAirshipImage = 'img/dirigibili/dirigibile (16).png';
const exploreRelittoImage = 'img/relitti/relitto (4).png';
const exploreRelittoImage7 = 'img/relitti/relitto (7).png';
const exploreRelittoImage21 = 'img/relitti/relitto (21).png';
const exploreDirigibileImage9 = 'img/dirigibili/dirigibile (9).png';
const exploreDirigibileImage19 = 'img/dirigibili/dirigibile (19).png';
const exploreDirigibileImage1 = 'img/dirigibili/dirigibile (1).png';
const exploreDirigibileImage17 = 'img/dirigibili/dirigibile (17).png';
const exploreDirigibileImage18 = 'img/dirigibili/dirigibile (18).png';
const exploreDirigibileImage16 = 'img/dirigibili/dirigibile (16).png';

const exploreArtIds = [
  'explore-art-dirigibile-19',
  'explore-art-dirigibile-1',
  'explore-art-dirigibile-2',
  'explore-art-dirigibile-4',
  'explore-art-dirigibile-10',
  'explore-art-dirigibile-17',
  'explore-art-dirigibile-18',
  'explore-art-dirigibile-16',
  'explore-art-airship-16',
  'explore-art-relitto-4',
  'explore-art-relitto-7',
  'explore-art-relitto-21',
  'explore-art-dirigibile-9',
];

const exploreLeftAirshipOptions = [
  'explore-art-dirigibile-1',
  'explore-art-dirigibile-2',
  'explore-art-dirigibile-4',
  'explore-art-dirigibile-10',
];

let exploreLeftAirshipCurrentId = null;
let exploreLeftAirshipLastId = null;
let exploreLeftAirshipWasActive = false;

function setExploreArtVisible(activeId) {
  exploreArtIds.forEach(id => {
    const img = document.getElementById(id);
    if (img) img.style.opacity = id === activeId ? '1' : '0';
  });
}

function pickExploreAirshipId(previousId) {
  const candidates = exploreLeftAirshipOptions.filter(id => id !== previousId);
  const pool = candidates.length > 0 ? candidates : exploreLeftAirshipOptions;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getExploreArtLabelById(id) {
  switch (id) {
    case 'explore-art-dirigibile-19': return 'dirigibile (19)';
    case 'explore-art-dirigibile-1': return 'airship (1)';
    case 'explore-art-dirigibile-2': return 'airship (2)';
    case 'explore-art-dirigibile-4': return 'airship (4)';
    case 'explore-art-dirigibile-10': return 'airship (10)';
    case 'explore-art-dirigibile-17': return 'dirigibile (17)';
    case 'explore-art-dirigibile-18': return 'dirigibile (18)';
    case 'explore-art-dirigibile-16': return 'dirigibile (16)';
    case 'explore-art-airship-16': return 'airship (16)';
    case 'explore-art-relitto-4': return 'relitto (4)';
    case 'explore-art-relitto-7': return 'relitto (7)';
    case 'explore-art-relitto-21': return 'relitto (21)';
    case 'explore-art-dirigibile-9': return 'dirigibile (9)';
    default: return '';
  }
}

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  setExploreArtVisible(null);
  exploreLeftAirshipCurrentId = null;
  exploreLeftAirshipLastId = null;
  exploreLeftAirshipWasActive = false;
  modal.style.display = 'flex';
  initExplore();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'none';
  exploreIsDetecting = false;
  setExploreArtVisible(null);
  exploreLeftAirshipWasActive = false;
  if (exploreStream) {
    exploreStream.getTracks().forEach(t => t.stop());
    exploreStream = null;
  }
}

document.getElementById('explore-modal').addEventListener('click', function(e) {
  if (e.target === this) closeExploreModal();
});

async function initExplore() {
  const status = document.getElementById('explore-status');
  if (!exploreDetector && !exploreModelLoading) {
    exploreModelLoading = true;
    status.textContent = 'Loading hand detection model...';
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      exploreDetector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'full',
          maxHands: 1,
        }
      );
      exploreModelLoading = false;
    } catch (err) {
      status.textContent = 'Error loading model: ' + err.message;
      exploreModelLoading = false;
      return;
    }
  } else if (exploreModelLoading) {
    setTimeout(initExplore, 500);
    return;
  }
  await startExploreCamera();
}

async function startExploreCamera() {
  const video = document.getElementById('explore-webcam');
  const status = document.getElementById('explore-status');
  try {
    exploreStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = exploreStream;
    video.addEventListener('loadeddata', () => {
      exploreIsDetecting = true;
      status.textContent = 'Show your hand!';
      detectExploreHands();
    }, { once: true });
  } catch (err) {
    status.textContent = 'Camera error: ' + err.message;
  }
}

async function detectExploreHands() {
  if (!exploreIsDetecting || !exploreDetector) return;
  const video = document.getElementById('explore-webcam');
  const square = document.getElementById('explore-square');
  const status = document.getElementById('explore-status');
  try {
    const hands = await exploreDetector.estimateHands(video, { flipHorizontal: true });
    const detectLabel = document.getElementById('explore-detect-label');
    const angleLabel  = document.getElementById('explore-angle-label');
    if (hands.length > 0) {
      const hand  = hands[0];
      const wrist = hand.keypoints[0];  // Wrist
      const mcp   = hand.keypoints[9];  // Middle MCP
      // Angle from vertical: 0° = hand pointing straight up, 180° = pointing down
      const angle = Math.abs(Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI);
      // Map angle into explicit ranges: 0–30, 31–50, 51–70, 71–90, 91–180
      let segmentIndex;
      if (angle <= 30) {
        segmentIndex = 0;
      } else if (angle <= 50) {
        segmentIndex = 1;
      } else if (angle <= 70) {
        segmentIndex = 2;
      } else if (angle <= 90) {
        segmentIndex = 3;
      } else {
        segmentIndex = 4;
      }
      const handednessRaw = hand.handedness;
      const handedness = Array.isArray(handednessRaw)
        ? (handednessRaw[0] && handednessRaw[0].label) || 'Right'
        : (typeof handednessRaw === 'object' && handednessRaw !== null
          ? handednessRaw.label || handednessRaw.side || 'Right'
          : handednessRaw || 'Right');
      const isRightHand = String(handedness).toLowerCase() === 'right';
      const isLeftHand = String(handedness).toLowerCase() === 'left';
      const colorArray = isLeftHand ? images_left : images_right;
      const color = colorArray[segmentIndex];
      const showDirigibile19 = isLeftHand && segmentIndex === 0;
      const showLeftAirshipRange = isLeftHand && segmentIndex === 1;
      const showDirigibile17 = isLeftHand && segmentIndex === 2;
      const showDirigibile18 = isLeftHand && segmentIndex === 3;
      const showDirigibile16 = isLeftHand && segmentIndex === 4;
      const showAirship = isRightHand && segmentIndex === 0;
      const showRelitto = isRightHand && segmentIndex === 1;
      const showRelitto7 = isRightHand && segmentIndex === 2;
      const showRelitto21 = isRightHand && segmentIndex === 3;
      const showDirigibile9 = isRightHand && segmentIndex === 4;
      if (!showLeftAirshipRange && exploreLeftAirshipWasActive && exploreLeftAirshipCurrentId) {
        exploreLeftAirshipLastId = exploreLeftAirshipCurrentId;
      }
      if (!showLeftAirshipRange) {
        exploreLeftAirshipWasActive = false;
        exploreLeftAirshipCurrentId = null;
      }
      if (showDirigibile19) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-dirigibile-19');
      } else if (showLeftAirshipRange) {
        if (!exploreLeftAirshipWasActive || !exploreLeftAirshipCurrentId) {
          exploreLeftAirshipCurrentId = pickExploreAirshipId(exploreLeftAirshipLastId);
        }
        exploreLeftAirshipWasActive = true;
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible(exploreLeftAirshipCurrentId);
      } else if (showDirigibile17) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-dirigibile-17');
      } else if (showDirigibile18) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-dirigibile-18');
      } else if (showDirigibile16) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-dirigibile-16');
      } else if (showAirship) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-airship-16');
      } else if (showRelitto) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-relitto-4');
      } else if (showRelitto7) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-relitto-7');
      } else if (showRelitto21) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-relitto-21');
      } else if (showDirigibile9) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible('explore-art-dirigibile-9');
      } else {
        setExploreArtVisible(null);
        square.style.backgroundColor = color;
      }
      status.textContent = handedness.toLowerCase() + ' hand — ' + angle.toFixed(1) + '° (segment ' + (segmentIndex + 1) + '/5)';
      detectLabel.textContent = '✓ ' + handedness + ' hand';
      detectLabel.style.background = 'rgba(0,220,120,0.2)';
      detectLabel.style.color = 'rgba(0,220,120,0.9)';
      angleLabel.textContent = showDirigibile19 ? 'angle: ' + angle.toFixed(1) + '° → dirigibile (19)' : showLeftAirshipRange ? 'angle: ' + angle.toFixed(1) + '° → ' + getExploreArtLabelById(exploreLeftAirshipCurrentId) : showDirigibile17 ? 'angle: ' + angle.toFixed(1) + '° → dirigibile (17)' : showDirigibile18 ? 'angle: ' + angle.toFixed(1) + '° → dirigibile (18)' : showDirigibile16 ? 'angle: ' + angle.toFixed(1) + '° → dirigibile (16)' : showAirship ? 'angle: ' + angle.toFixed(1) + '° → airship (16)' : showRelitto ? 'angle: ' + angle.toFixed(1) + '° → relitto (4)' : showRelitto7 ? 'angle: ' + angle.toFixed(1) + '° → relitto (7)' : showRelitto21 ? 'angle: ' + angle.toFixed(1) + '° → relitto (21)' : showDirigibile9 ? 'angle: ' + angle.toFixed(1) + '° → dirigibile (9)' : 'angle: ' + angle.toFixed(1) + '° → ' + color;
      angleLabel.style.color = showDirigibile19 || showLeftAirshipRange || showDirigibile17 || showDirigibile18 || showDirigibile16 || showAirship || showRelitto || showRelitto7 || showRelitto21 || showDirigibile9 ? 'rgba(255,255,255,0.9)' : color;
    } else {
      status.textContent = 'show your hand to the camera';
      detectLabel.textContent = 'no hand detected';
      detectLabel.style.background = 'rgba(255,255,255,0.1)';
      detectLabel.style.color = 'rgba(255,255,255,0.4)';
      angleLabel.textContent = 'angle: —';
      angleLabel.style.color = 'rgba(255,255,255,0.3)';
    }
  } catch (e) { /* ignore per-frame errors */ }
  if (exploreIsDetecting) requestAnimationFrame(detectExploreHands);
}

function inclToColor(angle) {
  // 30° = green, 90° = red, 120° = blue
  const a = Math.max(0, Math.min(180, angle));
  let r, g, b;
  if (a <= 30) {
    r = 0;   g = 255; b = 0;
  } else if (a <= 90) {
    const t = (a - 30) / 60;
    r = Math.round(255 * t); g = Math.round(255 * (1 - t)); b = 0;
  } else if (a <= 120) {
    const t = (a - 90) / 30;
    r = Math.round(255 * (1 - t)); g = 0; b = Math.round(255 * t);
  } else {
    r = 0; g = 0; b = 255;
  }
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}