let exploreDetector = null;
let exploreIsDetecting = false;
let exploreStream = null;
let exploreModelLoading = false;

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'flex';
  initExplore();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'none';
  exploreIsDetecting = false;
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
    const hands = await exploreDetector.estimateHands(video, { flipHorizontal: false });
    const detectLabel = document.getElementById('explore-detect-label');
    const angleLabel  = document.getElementById('explore-angle-label');
    if (hands.length > 0) {
      const wrist = hands[0].keypoints[0];  // Wrist
      const mcp   = hands[0].keypoints[9];  // Middle MCP
      // Angle from vertical: 0° = hand pointing straight up, 90° = horizontal
      const angle = Math.abs(Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI);
      square.style.backgroundColor = inclToColor(angle);
      status.textContent = 'inclination: ' + angle.toFixed(1) + '°';
      detectLabel.textContent = '✓ hand detected';
      detectLabel.style.background = 'rgba(0,220,120,0.2)';
      detectLabel.style.color = 'rgba(0,220,120,0.9)';
      angleLabel.textContent = 'angle: ' + angle.toFixed(1) + '°';
      angleLabel.style.color = inclToColor(angle);
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