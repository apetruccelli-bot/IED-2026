let exploreDetector = null;
let exploreIsDetecting = false;
let exploreStream = null;
let exploreModelLoading = false;
let explorePackageIndex = -1;
let explorePreviewVisible = true;

let images_left = ['red', 'green', 'blue', 'yellow', 'cyan'];
let images_right = ['magenta', 'orange', 'purple', 'brown', 'pink'];

// Each package has 5 slots per hand mapped to angle ranges:
// [0-30, 31-50, 51-70, 71-90, 91-180]
const explorePackages = [
  {
    left: [
      'explore-art-dirigibile-19',
      'explore-art-dirigibile-1',
      'explore-art-dirigibile-17',
      'explore-art-dirigibile-18',
      'explore-art-dirigibile-100',
    ],
    right: [
      'explore-art-dirigibile-16',
      'explore-art-relitto-4',
      'explore-art-relitto-7',
      'explore-art-relitto-21',
      'explore-art-dirigibile-9',
    ],
  },
  {
    left: [
      'explore-art-dirigibile-20',
      'explore-art-dirigibile-2',
      'explore-art-dirigibile-11',
      'explore-art-dirigibile-12',
      'explore-art-explore-2',
    ],
    right: [
      'explore-art-explore-5',
      'explore-art-dirigibile-22',
      'explore-art-dirigibile-7',
      'explore-art-relitto-3',
      'explore-art-dirigibile-3',
    ],
  },
  {
    left: [
      'explore-art-explore-1',
      'explore-art-dirigibile-21',
      'explore-art-relitto-11',
      'explore-art-dirigibile-6',
      'explore-art-explore-4',
    ],
    right: [
      'explore-art-explore-6',
      'explore-art-dirigibile-4',
      'explore-art-dirigibile-5',
      'explore-art-relitto-2',
      'explore-art-dirigibile-10',
    ],
  },
];

function setExploreArtVisible(activeId) {
  const exploreSquare = document.getElementById('explore-square');
  if (!exploreSquare) return;

  const allImages = exploreSquare.querySelectorAll('img[id^="explore-art-"]');
  allImages.forEach(img => {
    img.style.opacity = img.id === activeId ? '1' : '0';
  });
}

// UI helpers for package selector buttons
function updatePackButtonsUI() {
  const selector = document.getElementById('explore-pack-selector');
  const buttons = document.querySelectorAll('.explore-pack-btn');

  if (selector) {
    selector.classList.toggle('has-active-pack', explorePackageIndex >= 0);
  }

  buttons.forEach((btn, index) => {
    const isActive = index === explorePackageIndex;

    btn.classList.toggle('active', isActive);
    btn.style.opacity = isActive ? '1' : '0.4';
  });
}

function setExplorePackage(idx) {
  const i = Number(idx);
  if (isNaN(i) || i < 0 || i >= explorePackages.length) return;
  explorePackageIndex = i;
  setExploreArtVisible(null);
  const square = document.getElementById('explore-square');
  if (square) {
    square.style.backgroundColor = '#333';
    square.style.backgroundImage = 'none';
  }
  updatePackButtonsUI();
}

function updateExplorePreviewUI() {
  const panel = document.getElementById('explore-preview-panel');
  const button = document.getElementById('explore-preview-toggle');

  if (!panel || !button) return;

  panel.classList.toggle('preview-hidden', !explorePreviewVisible);
  button.textContent = explorePreviewVisible ? 'hide camera' : 'show camera';

  if (!explorePreviewVisible) {
    clearExploreHandSkeleton();
  }
}

function toggleExplorePreview() {
  explorePreviewVisible = !explorePreviewVisible;
  updateExplorePreviewUI();
}

function getExploreArtLabelById(id) {
  const img = document.getElementById(id);
  return img ? (img.alt || '') : '';
}

function getAngleSegmentIndex(angle) {
  if (angle <= 30) return 0;
  if (angle <= 50) return 1;
  if (angle <= 70) return 2;
  if (angle <= 90) return 3;
  return 4;
}

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  explorePackageIndex = (explorePackageIndex + 1) % explorePackages.length;
  setExploreArtVisible(null);
  // ensure the square shows the default gray background each time Explore opens
  const square = document.getElementById('explore-square');
  if (square) {
    square.style.backgroundColor = '#333';
    square.style.backgroundImage = 'none';
  }
  updatePackButtonsUI();
  updateExplorePreviewUI();
  modal.style.display = 'flex';
  initExplore();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'none';
  exploreIsDetecting = false;
  setExploreArtVisible(null);
  clearExploreHandSkeleton();
  
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

const exploreHandConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

function resizeExploreCanvas() {
  const video = document.getElementById('explore-webcam');
  const canvas = document.getElementById('explore-hand-canvas');

  if (!video || !canvas) return;

  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}

function drawExploreHandSkeleton(hand) {
  if (!explorePreviewVisible) {
    clearExploreHandSkeleton();
    return;
  }

  const video = document.getElementById('explore-webcam');
  const canvas = document.getElementById('explore-hand-canvas');

  if (!video || !canvas) return;

  resizeExploreCanvas();

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const keypoints = hand?.keypoints;

  if (!keypoints || !video.videoWidth || !video.videoHeight) return;

  const scaleX = canvas.width / video.videoWidth;
  const scaleY = canvas.height / video.videoHeight;

  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';

  exploreHandConnections.forEach(([a, b]) => {
    const p1 = keypoints[a];
    const p2 = keypoints[b];

    if (!p1 || !p2) return;

    ctx.beginPath();
    ctx.moveTo(p1.x * scaleX, p1.y * scaleY);
    ctx.lineTo(p2.x * scaleX, p2.y * scaleY);
    ctx.stroke();
  });

  keypoints.forEach(point => {
    ctx.beginPath();
    ctx.arc(
      point.x * scaleX,
      point.y * scaleY,
      3.2 * (window.devicePixelRatio || 1),
      0,
      Math.PI * 2
    );
    ctx.fill();
  });
}

function clearExploreHandSkeleton() {
  const canvas = document.getElementById('explore-hand-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function detectExploreHands() {
  if (!exploreIsDetecting || !exploreDetector) return;
  const video = document.getElementById('explore-webcam');
  const square = document.getElementById('explore-square');
  const status = document.getElementById('explore-status');
  try {
    const hands = await exploreDetector.estimateHands(video, { flipHorizontal: true });
    drawExploreHandSkeleton(hands[0]);
    const detectLabel = document.getElementById('explore-detect-label');
    const angleLabel  = document.getElementById('explore-angle-label');
    if (hands.length > 0) {
      const hand  = hands[0];
      const wrist = hand.keypoints[0];  // Wrist
      const mcp   = hand.keypoints[9];  // Middle MCP
      // Angle from vertical: 0° = hand pointing straight up, 180° = pointing down
      const angle = Math.abs(Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI);
      const segmentIndex = getAngleSegmentIndex(angle);
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
      const activePackage = explorePackages[explorePackageIndex] || explorePackages[0];
      const packageSide = isLeftHand ? 'left' : (isRightHand ? 'right' : null);
      const activeArtId = packageSide ? activePackage[packageSide][segmentIndex] : null;

      if (activeArtId) {
        square.style.backgroundColor = 'transparent';
        square.style.backgroundImage = 'none';
        setExploreArtVisible(activeArtId);
      } else {
        setExploreArtVisible(null);
        square.style.backgroundColor = color;
      }

      status.textContent = handedness.toLowerCase() + ' hand — ' + angle.toFixed(1) + '° (segment ' + (segmentIndex + 1) + '/5, pack ' + (explorePackageIndex + 1) + '/3)';
      if (detectLabel) {
        detectLabel.textContent = '✓ ' + handedness + ' hand';
        detectLabel.style.background = 'rgba(0,220,120,0.2)';
        detectLabel.style.color = 'rgba(0,220,120,0.9)';
      }

      if (angleLabel) {
        angleLabel.textContent = activeArtId
          ? 'angle: ' + angle.toFixed(1) + '° → ' + getExploreArtLabelById(activeArtId)
          : 'angle: ' + angle.toFixed(1) + '° → ' + color;

        angleLabel.style.color = activeArtId ? 'rgba(255,255,255,0.9)' : color;
      }
    } else {
      status.textContent = 'show your hand to the camera';
      if (detectLabel) {
        detectLabel.textContent = 'no hand detected';
        detectLabel.style.background = 'rgba(255,255,255,0.1)';
        detectLabel.style.color = 'rgba(255,255,255,0.4)';
      }

      if (angleLabel) {
        angleLabel.textContent = 'angle: —';
        angleLabel.style.color = 'rgba(255,255,255,0.3)';
      }
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