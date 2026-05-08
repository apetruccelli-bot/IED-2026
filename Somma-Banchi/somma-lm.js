let sommaDetector = null;
let sommaIsDetecting = false;
let sommaStream = null;
let sommaModelLoading = false;

function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'flex';
  initSommaExplore();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'none';
  sommaIsDetecting = false;
  if (sommaStream) {
    sommaStream.getTracks().forEach(t => t.stop());
    sommaStream = null;
  }
}

document.getElementById('explore-modal').addEventListener('click', function (e) {
  if (e.target === this) closeExploreModal();
});

async function initSommaExplore() {
  const status = document.getElementById('explore-status');
  if (!sommaDetector && !sommaModelLoading) {
    sommaModelLoading = true;
    status.textContent = 'Caricamento modello…';
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      sommaDetector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'full',
          maxHands: 1,
        }
      );
      sommaModelLoading = false;
    } catch (err) {
      status.textContent = 'Errore: ' + err.message;
      sommaModelLoading = false;
      return;
    }
  } else if (sommaModelLoading) {
    setTimeout(initSommaExplore, 500);
    return;
  }
  await startSommaCamera();
}

async function startSommaCamera() {
  const video = document.getElementById('explore-webcam');
  const status = document.getElementById('explore-status');
  try {
    sommaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = sommaStream;
    video.addEventListener('loadeddata', () => {
      sommaIsDetecting = true;
      status.textContent = 'Mostra la tua mano!';
      detectSommaHands();
    }, { once: true });
  } catch (err) {
    status.textContent = 'Errore camera: ' + err.message;
  }
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function classifyGesture(kp) {
  const wrist = kp[0];
  const mcp   = kp[9]; // middle finger MCP

  // Angle from vertical: 0° = pointing up, 90° = sideways, 180° = pointing down
  const angle = Math.abs(Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI);

  // Fist: fingertip closer to wrist than its PIP joint → finger is curled
  const tipIdx = [8, 12, 16, 20];
  const pipIdx = [6, 10, 14, 18];
  const curlCount = tipIdx.filter((ti, i) => dist2D(kp[ti], wrist) < dist2D(kp[pipIdx[i]], wrist)).length;
  const isFist = curlCount >= 3;

  // Red: vertical fist pointing sideways (knuckles to the side), angle ~90°
  if (isFist && angle >= 45 && angle <= 135)
    return { color: '#C0392B', label: 'Pugno laterale → rosso', angle };

  // Blue: fist pointing down (knuckles up), angle near 180°
  if (isFist && angle > 135)
    return { color: '#2980B9', label: 'Pugno verso il basso → blu', angle };

  // Green: open hand held sideways, 45–135°
  if (!isFist && angle >= 45 && angle <= 135)
    return { color: '#27AE60', label: 'Mano aperta laterale → verde', angle };

  return null; // no recognised gesture
}

async function detectSommaHands() {
  if (!sommaIsDetecting || !sommaDetector) return;
  const video  = document.getElementById('explore-webcam');
  const square = document.getElementById('explore-square');
  const status = document.getElementById('explore-status');
  const detectLabel = document.getElementById('explore-detect-label');
  const angleLabel  = document.getElementById('explore-angle-label');

  try {
    const hands = await sommaDetector.estimateHands(video, { flipHorizontal: true });
    if (hands.length > 0) {
      const kp = hands[0].keypoints;
      const result = classifyGesture(kp);
      const wrist = kp[0], mcp = kp[9];
      const angle = Math.abs(Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI);
      detectLabel.textContent = '✓ mano rilevata';
      detectLabel.style.background = 'rgba(0,220,120,0.2)';
      detectLabel.style.color = 'rgba(0,220,120,0.9)';
      angleLabel.textContent = 'angolo: ' + angle.toFixed(1) + '°';
      if (result) {
        square.style.backgroundColor = result.color;
        status.textContent = result.label;
        angleLabel.style.color = result.color;
      } else {
        square.style.backgroundColor = '#111';
        status.textContent = 'gesto non riconosciuto';
        angleLabel.style.color = 'rgba(255,255,255,0.3)';
      }
    } else {
      square.style.backgroundColor = '#111';
      status.textContent = 'Mostra la tua mano alla camera';
      detectLabel.textContent = 'nessuna mano';
      detectLabel.style.background = 'rgba(255,255,255,0.1)';
      detectLabel.style.color = 'rgba(255,255,255,0.4)';
      angleLabel.textContent = 'angolo: —';
      angleLabel.style.color = 'rgba(255,255,255,0.3)';
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (sommaIsDetecting) requestAnimationFrame(detectSommaHands);
}
