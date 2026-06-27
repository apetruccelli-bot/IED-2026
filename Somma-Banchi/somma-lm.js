let sommaDetector = null;
let sommaIsDetecting = false;
let sommaStream = null;
let sommaModelLoading = false;
let sommaCanvas = null;
let sommaCtx = null;

let sommaLastGesture = null;
let sommaInstructionEl = null;

const SOMMA_SHOW_TRACKING_OVERLAY = false;

const sommaGestureInstructions = {
  'tagliare e affettare':
    'Punta i polpastrelli verso lo schermo, come la lama di un coltello che taglia un pezzo di carne.',

  'disossare':
    'Chiudi la mano come se stessi impugnando un coltello.',

  'tagliare e colpire':
    'Punta il dorso della mano verso lo schermo e ruota la mano come se dovessi dare un colpo netto.'
};

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

function createSommaInstructionElement(video) {
  if (sommaInstructionEl) return;

  sommaInstructionEl = document.createElement('div');
  sommaInstructionEl.id = 'somma-gesture-instruction';
  sommaInstructionEl.className = 'somma-gesture-instructions';
  sommaInstructionEl.setAttribute('aria-live', 'polite');

  sommaInstructionEl.innerHTML = `
    <p class="somma-instruction-intro">
      Mostra la mano davanti alla webcam.
    </p>

    <p class="somma-instruction-row" data-gesture="tagliare e affettare">
     Punta i polpastrelli verso lo schermo, come la lama di un coltello che taglia un pezzo di carne.
    </p>

    <p class="somma-instruction-row" data-gesture="disossare">
      Chiudi la mano come se stessi impugnando un coltello.
    </p>

    <p class="somma-instruction-row" data-gesture="tagliare e colpire">
      Punta il dorso della mano verso lo schermo e ruota la mano come se dovessi dare un colpo netto.
    </p>
  `;

  const guide = video.closest('.explore-hand-guide');
  const webcamWrap = video.closest('.explore-webcam-wrap') || video.parentElement;
  const host = guide || video.parentElement;
  host.insertBefore(sommaInstructionEl, webcamWrap);
}

function updateSommaInstruction(funzione) {
  if (!sommaInstructionEl) return;

  sommaInstructionEl.querySelectorAll('.somma-instruction-row').forEach(row => {
    row.classList.toggle('active', row.dataset.gesture === funzione);
  });
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
      Anche il canvas viene specchiato uguale,
      quindi il tracking rimane allineato alla mano visibile.
    */
    video.style.transform = 'scaleX(-1)';
    video.style.transformOrigin = 'center center';

  const videoContainer = video.closest('.explore-webcam-wrap') || video.parentElement;
  videoContainer.style.position = 'relative';

  createSommaInstructionElement(video);

    if (!sommaCanvas) {
      sommaCanvas = document.createElement('canvas');
      sommaCanvas.id = 'explore-canvas-overlay';

      sommaCanvas.style.position = 'absolute';
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

      videoContainer.appendChild(sommaCanvas);

      console.log('Canvas created and appended to DOM');
    }

    video.addEventListener('loadeddata', () => {
      resizeSommaCanvasToVideo(video);

      if (typeof updateMobileArchiveLayout === 'function') {
        requestAnimationFrame(updateMobileArchiveLayout);
      }

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
  const parentRect = video.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  /*
    Posiziona il canvas esattamente sopra la webcam,
    anche se sopra la webcam ora c'è il testo con gap.
  */
  const left = rect.left - parentRect.left;
  const top = rect.top - parentRect.top;

  sommaCanvas.style.left = left + 'px';
  sommaCanvas.style.top = top + 'px';
  sommaCanvas.style.width = rect.width + 'px';
  sommaCanvas.style.height = rect.height + 'px';

  sommaCanvas.width = rect.width * dpr;
  sommaCanvas.height = rect.height * dpr;

  /*
    Così puoi disegnare usando coordinate CSS normali,
    senza dover moltiplicare ogni punto per il devicePixelRatio.
  */
  sommaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  console.log('Canvas aligned to video:', rect.width, 'x', rect.height);
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

  if (!SOMMA_SHOW_TRACKING_OVERLAY) return;

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

  // Linee rosse
  sommaCtx.strokeStyle = '#FF0000';
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

function countTipsTowardScreen(kp) {
  const tipIdx = [8, 12, 16, 20];
  const mcpIdx = [5, 9, 13, 17];
  const handScale = dist2D(kp[0], kp[9]);

  if (handScale < 5) return 0;

  return tipIdx.filter((ti, i) => {
    const tip = kp[ti];
    const mcpKnuckle = kp[mcpIdx[i]];

    if (!tip || !mcpKnuckle) return false;

    return dist2D(tip, mcpKnuckle) / handScale < 0.55;
  }).length;
}

function classifyGesture(kp) {
  const wrist = kp[0];
  const mcp = kp[9];

  if (!wrist || !mcp || !kp[5] || !kp[17]) return null;

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
  const knuckleWidth = dist2D(kp[5], kp[17]);
  const wristToMcp = dist2D(wrist, mcp);
  const isPalmFacing = !isFist && knuckleWidth >= 5 && (wristToMcp / knuckleWidth) < 1.2;
  const tipsTowardScreen = countTipsTowardScreen(kp);

  console.log('tipsTowardScreen:', tipsTowardScreen, 'isPalmFacing:', isPalmFacing, 'angle:', angle.toFixed(1));

  if (isFist) {
    return { funzione: 'disossare', angle };
  }

  // Polpastrelli verso schermo, palmo non frontale
  else if (tipsTowardScreen >= 1 && isPalmFacing) {
    return { funzione: 'tagliare e affettare', angle };
  }

  // Dorso verso schermo, dita non puntate verso camera
  else if (angle >= 30 && angle <= 150 && !isPalmFacing && tipsTowardScreen == 0) {
    return { funzione: 'tagliare e colpire', angle };
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
        updateSommaInstruction(result.funzione);

        if (result.funzione !== sommaLastGesture) {
          sommaLastGesture = result.funzione;

          if (typeof setExploreGesture === 'function') {
            setExploreGesture(result.funzione);
          }
        }
      }

      drawHandSkeleton(hand.keypoints);

    } else {
      clearSommaCanvas();

      sommaLastGesture = null;
      updateSommaInstruction(null);

      /*
        Quando la mano non si vede,
        tutte le foto dei coltelli devono apparire.
      */
      if (typeof setExploreGesture === 'function') {
        setExploreGesture(null);
      }
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

  sommaLastGesture = null;
  updateSommaInstruction(null);
}
