let sommaDetector = null;
let sommaIsDetecting = false;
let sommaStream = null;
let sommaModelLoading = false;
let sommaCanvas = null;
let sommaCtx = null;

async function initSommaExplore() {
  if (!sommaDetector && !sommaModelLoading) {
    sommaModelLoading = true;
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
      console.error('Hand model error:', err);
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
  try {
    sommaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = sommaStream;
    
    // Crea canvas per il tracking overlay
    if (!sommaCanvas) {
      sommaCanvas = document.createElement('canvas');
      sommaCanvas.id = 'explore-canvas-overlay';
      sommaCanvas.style.position = 'absolute';
      sommaCanvas.style.top = '0';
      sommaCanvas.style.left = '0';
      sommaCanvas.style.cursor = 'pointer';
      sommaCanvas.width = 640;
      sommaCanvas.height = 480;
      sommaCtx = sommaCanvas.getContext('2d');
      
      const videoContainer = video.parentElement;
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(sommaCanvas);
    }
    
    video.addEventListener('loadeddata', () => {
      sommaCanvas.width = video.videoWidth;
      sommaCanvas.height = video.videoHeight;
      sommaIsDetecting = true;
      detectSommaHands();
    }, { once: true });
  } catch (err) {
    console.error('Camera error:', err);
  }
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawHandSkeleton(keypoints) {
  if (!sommaCtx) return;
  
  // Pulisci canvas
  sommaCtx.clearRect(0, 0, sommaCanvas.width, sommaCanvas.height);
  
  // Connessioni skeleton (MediaPipe Hands format)
  const connections = [
    // Palm
    [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],
    // Thumb
    [1, 2], [2, 3], [3, 4],
    // Index
    [5, 6], [6, 7], [7, 8],
    // Middle
    [9, 10], [10, 11], [11, 12],
    // Ring
    [13, 14], [14, 15], [15, 16],
    // Pinky
    [17, 18], [18, 19], [19, 20]
  ];
  
  // Disegna linee
  sommaCtx.strokeStyle = '#00FF00';
  sommaCtx.lineWidth = 2;
  connections.forEach(([start, end]) => {
    const kpStart = keypoints[start];
    const kpEnd = keypoints[end];
    if (kpStart && kpEnd && kpStart.score > 0.5 && kpEnd.score > 0.5) {
      sommaCtx.beginPath();
      sommaCtx.moveTo(kpStart.x, kpStart.y);
      sommaCtx.lineTo(kpEnd.x, kpEnd.y);
      sommaCtx.stroke();
    }
  });
  
  // Disegna keypoints (nodi)
  sommaCtx.fillStyle = '#FF0000';
  keypoints.forEach((kp, i) => {
    if (kp && kp.score > 0.5) {
      sommaCtx.beginPath();
      sommaCtx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
      sommaCtx.fill();
    }
  });
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

  // "Directed to webcam": hand is face-on — wrist-to-MCP depth is short
  // compared to the knuckle width (index MCP kp[5] to pinky MCP kp[17])
  const knuckleWidth = dist2D(kp[5], kp[17]);
  const wristToMcp   = dist2D(wrist, mcp);
  const isFacingCam  = !isFist && (wristToMcp / knuckleWidth) < 1.2;

  // Fist (any orientation) → Disossare
  if (isFist)
    return { funzione: 'disossare', angle };

  // Open hand facing webcam → Tagliare e Affettare
  if (isFacingCam)
    return { funzione: 'tagliare e affettare', angle };

  // Open hand sideways (30°–150°) → Tagliare e Colpire
  if (angle >= 30 && angle <= 150)
    return { funzione: 'tagliare e colpire', angle };

  return null; // no recognised gesture
}

async function detectSommaHands() {
  if (!sommaIsDetecting || !sommaDetector) return;
  const video = document.getElementById('explore-webcam');

  try {
    const hands = await sommaDetector.estimateHands(video, { flipHorizontal: true });
    
    // Pulisci canvas
    if (sommaCtx) {
      sommaCtx.clearRect(0, 0, sommaCanvas.width, sommaCanvas.height);
    }
    
    if (hands.length > 0) {
      const hand = hands[0];
      const result = classifyGesture(hand.keypoints);
      if (result) setExploreGesture(result.funzione);
      
      // Disegna il skeleton
      if (sommaCtx) {
        drawHandSkeleton(hand.keypoints);
      }
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (sommaIsDetecting) requestAnimationFrame(detectSommaHands);
}
