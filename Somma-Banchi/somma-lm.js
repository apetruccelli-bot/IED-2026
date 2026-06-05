let sommaDetector = null;
let sommaIsDetecting = false;
let sommaStream = null;
let sommaModelLoading = false;
let sommaCanvas = null;
let sommaCtx = null;

let sommaLastGesture = null;
let sommaInstructionEl = null;

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

  video.parentElement.insertBefore(sommaInstructionEl, video);
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

    const videoContainer = video.parentElement;
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

function dist3D(a, b) {
  const dzA = a.z ?? 0;
  const dzB = b.z ?? 0;
  return Math.hypot(a.x - b.x, a.y - b.y, dzA - dzB);
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

const SOMMA_TIP_IDX = [8, 12, 16, 20];
const SOMMA_PIP_IDX = [6, 10, 14, 18];
const SOMMA_MCP_IDX = [5, 9, 13, 17];
const SOMMA_FINGER_CHAINS = [
  { tip: 4, pip: 3, mcp: 2 },   // pollice
  { tip: 8, pip: 6, mcp: 5 },   // indice
  { tip: 12, pip: 10, mcp: 9 }, // medio
  { tip: 16, pip: 14, mcp: 13 },// anulare
  { tip: 20, pip: 18, mcp: 17 },// mignolo
];

function getHandLandmark3D(hand, idx) {
  if (hand.keypoints3D && hand.keypoints3D[idx]) {
    return hand.keypoints3D[idx];
  }

  const kp = hand.keypoints[idx];
  if (kp && kp.z !== undefined) {
    return kp;
  }

  return null;
}

function hasHandDepth(hand) {
  return !!(
    hand.keypoints3D?.length ||
    hand.keypoints?.some((kp) => kp && kp.z !== undefined)
  );
}

function fingerForeshort2D(kp, tipIdx, pipIdx, mcpIdx) {
  const tip = kp[tipIdx];
  const pip = kp[pipIdx];
  const mcp = kp[mcpIdx];

  if (!tip || !pip || !mcp) return 1;

  const pipMcp = dist2D(pip, mcp);
  if (pipMcp < 5) return 1;

  return dist2D(tip, pip) / pipMcp;
}

function isFingerCurled2D(kp, tipIdx, pipIdx) {
  const tip = kp[tipIdx];
  const pip = kp[pipIdx];
  const wrist = kp[0];

  if (!tip || !pip || !wrist) return false;

  return dist2D(tip, wrist) < dist2D(pip, wrist) * 0.92;
}

function isFingerExtended3D(hand, tipIdx, pipIdx, mcpIdx) {
  const tip = getHandLandmark3D(hand, tipIdx);
  const pip = getHandLandmark3D(hand, pipIdx);
  const mcp = getHandLandmark3D(hand, mcpIdx);

  if (!tip || !pip || !mcp) return false;

  return dist3D(tip, mcp) > dist3D(pip, mcp) * 0.85;
}

function tipToMcpRatio2D(kp, tipIdx, pipIdx, mcpIdx) {
  const tip = kp[tipIdx];
  const pip = kp[pipIdx];
  const mcp = kp[mcpIdx];

  if (!tip || !pip || !mcp) return 1;

  const pipMcp = dist2D(pip, mcp);
  if (pipMcp < 5) return 1;

  return dist2D(tip, mcp) / pipMcp;
}

function isFingertipAtScreen(kp, hand, tipIdx, pipIdx, mcpIdx) {
  const ratio = tipToMcpRatio2D(kp, tipIdx, pipIdx, mcpIdx);
  const foreshort = fingerForeshort2D(kp, tipIdx, pipIdx, mcpIdx);
  const extended3D = hasHandDepth(hand)
    ? isFingerExtended3D(hand, tipIdx, pipIdx, mcpIdx)
    : true;

  /*
    Polpastrello verso schermo:
    - punta quasi sopra la nocca sul piano 2D
    - dito esteso in 3D
    - segmenti accorciati in 2D
  */
  return extended3D && ratio < 0.6 && foreshort < 0.95;
}

function countFingertipsAtScreen(hand) {
  const kp = hand.keypoints;

  return SOMMA_FINGER_CHAINS.filter(({ tip, pip, mcp }) =>
    isFingertipAtScreen(kp, hand, tip, pip, mcp)
  ).length;
}

function getAvgTipMcpRatio2D(kp) {
  const values = SOMMA_FINGER_CHAINS.map(({ tip, pip, mcp }) =>
    tipToMcpRatio2D(kp, tip, pip, mcp)
  );

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countFingersExtended3D(hand) {
  if (!hasHandDepth(hand)) return 0;

  return SOMMA_TIP_IDX.filter((tipIdx, i) =>
    isFingerExtended3D(hand, tipIdx, SOMMA_PIP_IDX[i], SOMMA_MCP_IDX[i])
  ).length;
}

function isPalmFacingCam(kp, hand) {
  if (!kp[5] || !kp[17] || !kp[0] || !kp[9]) return false;

  const knuckleWidth = dist2D(kp[5], kp[17]);
  const wristToMcp = dist2D(kp[0], kp[9]);

  if (knuckleWidth < 5) return false;

  if (hasHandDepth(hand)) {
    const indexMcp = getHandLandmark3D(hand, 5);
    const pinkyMcp = getHandLandmark3D(hand, 17);

    if (indexMcp && pinkyMcp) {
      const spreadX = Math.abs(indexMcp.x - pinkyMcp.x);
      const spreadZ = Math.abs(indexMcp.z - pinkyMcp.z);

      // Palmo frontale: nocche larghe in orizzontale, poca profondità
      if (spreadX > spreadZ * 1.4) return true;
    }
  }

  return wristToMcp / knuckleWidth < 1.15;
}

function isKnifeHand(hand) {
  const kp = hand.keypoints;
  const wrist = kp[0];
  const mcp = kp[9];

  if (!wrist || !mcp || !kp[5] || !kp[17]) return false;

  const curlCount = SOMMA_TIP_IDX.filter((tipIdx, i) =>
    isFingerCurled2D(kp, tipIdx, SOMMA_PIP_IDX[i])
  ).length;

  if (curlCount >= 3) return false;

  const fingertipsAtScreen = countFingertipsAtScreen(hand);
  const extended3DCount = countFingersExtended3D(hand);
  const avgTipMcpRatio = getAvgTipMcpRatio2D(kp);
  const knuckleWidth = dist2D(kp[5], kp[17]);

  if (knuckleWidth < 5) return false;

  const fingersExtended = hasHandDepth(hand) ? extended3DCount >= 3 : curlCount <= 1;
  const tipsAtScreen = fingertipsAtScreen >= 4 || (fingertipsAtScreen >= 3 && avgTipMcpRatio < 0.5);

  // Lama: polpastrelli puntati verso lo schermo, palmo non frontale
  return (
    fingersExtended &&
    tipsAtScreen &&
    !isPalmFacingCam(kp, hand)
  );
}

function isChopHand(hand, angle) {
  if (angle < 30 || angle > 150) return false;
  if (isKnifeHand(hand)) return false;

  const kp = hand.keypoints;
  const fingertipsAtScreen = countFingertipsAtScreen(hand);
  const knuckleWidth = dist2D(kp[5], kp[17]);
  const tipSpread = dist2D(kp[8], kp[20]);

  if (knuckleWidth < 5) return false;

  const avgTipMcpRatio = getAvgTipMcpRatio2D(kp);

  // Dorso verso schermo: polpastrelli NON puntati verso camera
  return fingertipsAtScreen <= 1 && avgTipMcpRatio > 0.65 && tipSpread > knuckleWidth * 0.4;
}

function classifyGesture(hand) {
  const kp = hand.keypoints;
  const wrist = kp[0];
  const mcp = kp[9];

  if (!wrist || !mcp) return null;

  const angle = Math.abs(
    Math.atan2(mcp.x - wrist.x, -(mcp.y - wrist.y)) * 180 / Math.PI
  );

  const curlCount = SOMMA_TIP_IDX.filter((tipIdx, i) =>
    isFingerCurled2D(kp, tipIdx, SOMMA_PIP_IDX[i])
  ).length;

  const isFist = curlCount >= 3;

  // Pugno → Disossare
  if (isFist) {
    return {
      funzione: 'disossare',
      angle
    };
  }

  // Mano a lama (90° verso schermo, dita verso webcam) → Tagliare e Affettare
  if (isKnifeHand(hand)) {
    return {
      funzione: 'tagliare e affettare',
      angle
    };
  }

  // Dorso verso schermo, rotazione laterale → Tagliare e Colpire
  if (isChopHand(hand, angle)) {
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

      const result = classifyGesture(hand);

      if (result) {
        console.log('Gesture detected:', result.funzione);

        updateSommaInstruction(result.funzione);

        /*
          Aggiorna il filtro solo quando il gesto cambia,
          così non richiama setExploreGesture a ogni frame.
        */
        if (result.funzione !== sommaLastGesture) {
          sommaLastGesture = result.funzione;

          if (typeof setExploreGesture === 'function') {
            setExploreGesture(result.funzione);
          }
        }
      } else if (sommaLastGesture !== null) {
        sommaLastGesture = null;
        updateSommaInstruction(null);

        if (typeof setExploreGesture === 'function') {
          setExploreGesture(null);
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