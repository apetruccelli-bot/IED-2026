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

  if (!video) {
    console.error('Video element #explore-webcam non trovato');
    return;
  }

  try {
    sommaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      }
    });

    video.srcObject = sommaStream;

    /*
      Video in stile selfie.
      IMPORTANTE:
      anche il canvas viene specchiato uguale,
      quindi il tracking rimane allineato alla mano visibile.
    */
    video.style.transform = 'scaleX(-1)';
    video.style.transformOrigin = 'center center';

    if (!sommaCanvas) {
      sommaCanvas = document.createElement('canvas');
      sommaCanvas.id = 'explore-canvas-overlay';

      sommaCanvas.style.position = 'absolute';
      sommaCanvas.style.top = '0';
      sommaCanvas.style.left = '0';
      sommaCanvas.style.width = '100%';
      sommaCanvas.style.height = '100%';
      sommaCanvas.style.zIndex = '10';
      sommaCanvas.style.pointerEvents = 'none';
      sommaCanvas.style.borderRadius = '4px';
      sommaCanvas.style.backgroundColor = 'transparent';

      /*
        Il canvas viene specchiato come il video.
        Per questo sotto useremo flipHorizontal: false.
      */
      sommaCanvas.style.transform = 'scaleX(-1)';
      sommaCanvas.style.transformOrigin = 'center center';

      sommaCtx = sommaCanvas.getContext('2d');

      const videoContainer = video.parentElement;
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(sommaCanvas);

      console.log('Canvas created and appended to DOM');
    }

    video.addEventListener('loadeddata', () => {
      resizeSommaCanvasToVideo(video);

      sommaIsDetecting = true;
      detectSommaHands();
    }, { once: true });

    window.addEventListener('resize', () => {
      resizeSommaCanvasToVideo(video);
    });

  } catch (err) {
    console.error('Camera error:', err);
  }
}

function resizeSommaCanvasToVideo(video) {
  if (!sommaCanvas || !sommaCtx || !video) return;

  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  /*
    Il canvas interno viene adattato alla dimensione reale
    in cui il video appare nella pagina.
  */
  sommaCanvas.style.width = rect.width + 'px';
  sommaCanvas.style.height = rect.height + 'px';

  sommaCanvas.width = rect.width * dpr;
  sommaCanvas.height = rect.height * dpr;

  /*
    Così puoi disegnare usando coordinate CSS normali,
    senza dover moltiplicare ogni punto per il devicePixelRatio.
  */
  sommaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  console.log('Canvas visible size:', rect.width, 'x', rect.height);
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isValidKeypoint(kp) {
  return kp && (kp.score === undefined || kp.score > 0.3);
}

function mapKeypointToCanvas(kp, video) {
  const rect = video.getBoundingClientRect();

  const displayW = rect.width;
  const displayH = rect.height;

  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  const objectFit = getComputedStyle(video).objectFit || 'fill';

  let x;
  let y;

  if (objectFit === 'cover') {
    /*
      Caso object-fit: cover.
      Il video riempie il box, ma può essere tagliato ai lati
      o sopra/sotto.
    */
    const scale = Math.max(displayW / videoW, displayH / videoH);
    const scaledW = videoW * scale;
    const scaledH = videoH * scale;

    const offsetX = (displayW - scaledW) / 2;
    const offsetY = (displayH - scaledH) / 2;

    x = kp.x * scale + offsetX;
    y = kp.y * scale + offsetY;

  } else if (objectFit === 'contain') {
    /*
      Caso object-fit: contain.
      Il video è tutto visibile, ma possono esserci bande vuote.
    */
    const scale = Math.min(displayW / videoW, displayH / videoH);
    const scaledW = videoW * scale;
    const scaledH = videoH * scale;

    const offsetX = (displayW - scaledW) / 2;
    const offsetY = (displayH - scaledH) / 2;

    x = kp.x * scale + offsetX;
    y = kp.y * scale + offsetY;

  } else {
    /*
      Caso normale.
      Il video viene adattato esattamente al box.
    */
    x = kp.x * (displayW / videoW);
    y = kp.y * (displayH / videoH);
  }

  return { x, y };
}

function clearSommaCanvas() {
  if (!sommaCtx || !sommaCanvas) return;

  const video = document.getElementById('explore-webcam');
  if (!video) return;

  const rect = video.getBoundingClientRect();
  sommaCtx.clearRect(0, 0, rect.width, rect.height);
}

function drawHandSkeleton(keypoints) {
  if (!sommaCtx || !sommaCanvas) {
    console.warn('Canvas context or canvas not available');
    return;
  }

  const video = document.getElementById('explore-webcam');

  if (!video) {
    console.warn('Video element not available');
    return;
  }

  clearSommaCanvas();

  const connections = [
    // Palmo
    [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],

    // Pollice
    [1, 2], [2, 3], [3, 4],

    // Indice
    [5, 6], [6, 7], [7, 8],

    // Medio
    [9, 10], [10, 11], [11, 12],

    // Anulare
    [13, 14], [14, 15], [15, 16],

    // Mignolo
    [17, 18], [18, 19], [19, 20]
  ];

  // Linee verdi
  sommaCtx.strokeStyle = '#00FF00';
  sommaCtx.lineWidth = 3;
  sommaCtx.lineCap = 'round';
  sommaCtx.lineJoin = 'round';

  connections.forEach(([start, end]) => {
    const kpStart = keypoints[start];
    const kpEnd = keypoints[end];

    if (isValidKeypoint(kpStart) && isValidKeypoint(kpEnd)) {
      const p1 = mapKeypointToCanvas(kpStart, video);
      const p2 = mapKeypointToCanvas(kpEnd, video);

      sommaCtx.beginPath();
      sommaCtx.moveTo(p1.x, p1.y);
      sommaCtx.lineTo(p2.x, p2.y);
      sommaCtx.stroke();
    }
  });

  // Punti rossi
  sommaCtx.fillStyle = '#FF0000';

  keypoints.forEach((kp) => {
    if (isValidKeypoint(kp)) {
      const p = mapKeypointToCanvas(kp, video);

      sommaCtx.beginPath();
      sommaCtx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      sommaCtx.fill();
    }
  });
}

function classifyGesture(kp) {
  const wrist = kp[0];
  const mcp = kp[9];

  if (!wrist || !mcp) return null;

  const angle = Math.abs(
    Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI
  );

  const tipIdx = [8, 12, 16, 20];
  const pipIdx = [6, 10, 14, 18];

  const curlCount = tipIdx.filter((ti, i) => {
    const tip = kp[ti];
    const pip = kp[pipIdx[i]];

    if (!tip || !pip) return false;

    return dist2D(tip, wrist) < dist2D(pip, wrist);
  }).length;

  const isFist = curlCount >= 3;

  if (!kp[5] || !kp[17]) return null;

  const knuckleWidth = dist2D(kp[5], kp[17]);
  const wristToMcp = dist2D(wrist, mcp);

  if (knuckleWidth === 0) return null;

  const isFacingCam = !isFist && (wristToMcp / knuckleWidth) < 1.2;

  // Pugno → Disossare
  if (isFist) {
    return {
      funzione: 'disossare',
      angle
    };
  }

  // Mano aperta verso webcam → Tagliare e Affettare
  if (isFacingCam) {
    return {
      funzione: 'tagliare e affettare',
      angle
    };
  }

  // Mano aperta laterale → Tagliare e Colpire
  if (angle >= 30 && angle <= 150) {
    return {
      funzione: 'tagliare e colpire',
      angle
    };
  }

  return null;
}

async function detectSommaHands() {
  if (!sommaIsDetecting || !sommaDetector) return;

  const video = document.getElementById('explore-webcam');

  if (!video) {
    console.error('Video element #explore-webcam non trovato');
    return;
  }

  try {
    /*
      IMPORTANTE:
      flipHorizontal deve stare false,
      perché video e canvas sono già specchiati con CSS.
    */
    const hands = await sommaDetector.estimateHands(video, {
      flipHorizontal: false
    });

    if (hands.length > 0) {
      const hand = hands[0];

      const result = classifyGesture(hand.keypoints);

      if (result) {
        console.log('Gesture detected:', result.funzione);

        if (typeof setExploreGesture === 'function') {
          setExploreGesture(result.funzione);
        }
      }

      drawHandSkeleton(hand.keypoints);

    } else {
      clearSommaCanvas();
    }

  } catch (e) {
    console.error('Detection error:', e);
  }

  if (sommaIsDetecting) {
    requestAnimationFrame(detectSommaHands);
  }
}

function stopSommaCamera() {
  sommaIsDetecting = false;

  if (sommaStream) {
    sommaStream.getTracks().forEach((track) => {
      track.stop();
    });

    sommaStream = null;
  }

  clearSommaCanvas();
}