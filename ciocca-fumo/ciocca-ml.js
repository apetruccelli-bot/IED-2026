// ── STATE ──
let exploreDetector     = null;
let exploreIsDetecting  = false;
let exploreStream       = null;
let exploreModelLoading = false;

let audioContext   = null;
let analyser       = null;
let micStream      = null;
let audioDetecting = false;

let squareRevealed = false;
let reblurTimeout  = null;
const TRIGGER_COOLDOWN = 1500; // ms — prevents re-trigger spam from one puff
let lastTriggerTime = 0;

function setExploreStatusText(text) {
  const status = document.querySelector('.explore-status');
  if (status) status.textContent = text;
}

// Cheek-puff calibration
let cheekBaselineSamples = [];
let cheekBaseline = null;
let calibrationComplete = false; // nothing triggers until face is calibrated

// ── MODAL OPEN / CLOSE ──
function openExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'flex';
  setSquareBlurred(true);
  initExplore();
}

function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  modal.style.display = 'none';
  exploreIsDetecting = false;
  audioDetecting = false;
  clearTimeout(reblurTimeout);
  setSquareBlurred(true);

  if (exploreStream) { exploreStream.getTracks().forEach(t => t.stop()); exploreStream = null; }
  if (micStream)     { micStream.getTracks().forEach(t => t.stop());     micStream = null; }
  if (audioContext)  { audioContext.close(); audioContext = null; analyser = null; }

  // Reset cheek baseline so next open recalibrates
  cheekBaselineSamples = [];
  cheekBaseline = null;
  calibrationComplete = false;
}

document.getElementById('explore-modal').addEventListener('click', function (e) {
  if (e.target === this) closeExploreModal();
});

// ── SQUARE BLUR / REVEAL ──
function setSquareBlurred(blurred) {
  const square = document.querySelector('.explore-square');
  if (!square) return;
  if (blurred) {
    square.style.filter  = 'blur(16px)';
    square.style.opacity = '0.5';
    squareRevealed = false;
  } else {
    square.style.filter  = 'blur(0px)';
    square.style.opacity = '1';
    squareRevealed = true;
  }
}

function triggerReveal() {
  if (!calibrationComplete) return; // wait until face baseline is ready
  const now = Date.now();
  if (now - lastTriggerTime < TRIGGER_COOLDOWN) return;
  lastTriggerTime = now;

  clearTimeout(reblurTimeout);
  setSquareBlurred(false);
  reblurTimeout = setTimeout(() => {
    setSquareBlurred(true);
    setExploreStatusText('blow or puff your cheeks!');
  }, 3000);

  setExploreStatusText('revealed — re-blurs in 3s...');
}

// ── MICROPHONE / BLOW DETECTION ──
async function startMicDetection() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioContext.createMediaStreamSource(micStream);
    source.connect(analyser);
    audioDetecting = true;
    loopMicDetection();
  } catch (e) {
    console.warn('Mic unavailable:', e.message);
  }
}

const MIC_THRESHOLD  = 60;   // minimum energy to even consider (0-255)
const FLATNESS_THRESHOLD = 0.18; // min spectral flatness to count as noise/blow

function loopMicDetection() {
  if (!audioDetecting || !analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  // Blowing lives in ~100–4000 Hz: broad burst of turbulent air
  const binHz = (audioContext.sampleRate / 2) / analyser.frequencyBinCount;
  const lo = Math.floor(100  / binHz);
  const hi = Math.ceil(4000 / binHz);
  const bins = hi - lo + 1;

  let sum = 0;
  let logSum = 0;
  let zeroes = 0;
  for (let i = lo; i <= hi; i++) {
    const v = data[i];
    sum += v;
    if (v > 0) logSum += Math.log(v);
    else zeroes++;
  }
  const avg = sum / bins;

  // Spectral flatness = geometric mean / arithmetic mean
  // A blow is broadband noise → flatness near 1
  // Speech/tapping is tonal  → flatness near 0
  const effectiveBins = bins - zeroes;
  const geoMean = effectiveBins > 0
    ? Math.exp(logSum / effectiveBins) * (effectiveBins / bins) // penalise silent bins
    : 0;
  const flatness = avg > 1 ? geoMean / avg : 0;

  const isBlow = avg >= MIC_THRESHOLD && flatness >= FLATNESS_THRESHOLD;

  // Update mic bar UI
  const bar     = document.getElementById('explore-mic-bar');
  const valEl   = document.getElementById('explore-mic-value');
  const marker  = document.getElementById('explore-mic-threshold-marker');
  if (bar) {
    const pct = Math.min(avg / 255 * 100, 100);
    bar.style.width = pct + '%';
    bar.style.background = isBlow ? 'rgba(0,220,120,0.8)' : 'rgba(255,255,255,0.4)';
  }
  if (valEl)  valEl.textContent  = `${Math.round(avg)} / f:${flatness.toFixed(2)}`;
  if (marker) marker.style.left  = (MIC_THRESHOLD / 255 * 100).toFixed(1) + '%';

  if (isBlow) triggerReveal();

  requestAnimationFrame(loopMicDetection);
}

// ── FACE MODEL INIT ──
async function initExplore() {
  if (!exploreDetector && !exploreModelLoading) {
    exploreModelLoading = true;
    setExploreStatusText('Loading face detection model...');
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      exploreDetector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
          refineLandmarks: true,
          maxFaces: 1,
        }
      );
      exploreModelLoading = false;
    } catch (err) {
      setExploreStatusText('Error loading model: ' + err.message);
      exploreModelLoading = false;
      return;
    }
  } else if (exploreModelLoading) {
    setTimeout(initExplore, 500);
    return;
  }

  startMicDetection();        // non-blocking — kick off mic in parallel
  await startExploreCamera();
}

async function startExploreCamera() {
  const video  = document.getElementById('explore-webcam');
  try {
    exploreStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = exploreStream;
    video.addEventListener('loadeddata', () => {
      exploreIsDetecting = true;
      setExploreStatusText('blow or puff your cheeks!');
      detectExploreFace();
    }, { once: true });
  } catch (err) {
    setExploreStatusText('Camera error: ' + err.message);
  }
}

// ── FACE DETECTION LOOP ──
async function detectExploreFace() {
  if (!exploreIsDetecting || !exploreDetector) return;

  const video       = document.getElementById('explore-webcam');
  const detectLabel = document.getElementById('explore-detect-label');
  const angleLabel  = document.getElementById('explore-angle-label');

  try {
    const faces = await exploreDetector.estimateFaces(video, { flipHorizontal: false });

    if (faces.length > 0) {
      const kp = faces[0].keypoints;

      // Outer cheek width: landmark 234 (left border) ↔ 454 (right border)
      const cheekWidth = Math.abs(kp[454].x - kp[234].x);
      // Inter-eye reference: 33 (right inner corner) ↔ 263 (left inner corner) — stable
      const eyeWidth   = Math.abs(kp[263].x - kp[33].x);
      const ratio      = cheekWidth / eyeWidth;

      // First 40 frames: build neutral baseline
      if (cheekBaselineSamples.length < 40) {
        cheekBaselineSamples.push(ratio);
        angleLabel.textContent = `calibrating… ${cheekBaselineSamples.length}/40`;
        angleLabel.style.color = 'rgba(255,255,255,0.3)';
        if (cheekBaselineSamples.length === 40) {
          cheekBaseline = cheekBaselineSamples.reduce((a, b) => a + b) / cheekBaselineSamples.length;
          calibrationComplete = true;
          setExploreStatusText('blow or puff your cheeks!');
        }
      } else {
        const puffed = ratio.toFixed(2) > (cheekBaseline.toFixed(2) + 5);
        if (puffed) triggerReveal();
        angleLabel.textContent = `cheeks: ${ratio.toFixed(2)} / base: ${cheekBaseline.toFixed(2)}`;
        angleLabel.style.color = puffed ? 'rgba(0,220,120,0.9)' : 'rgba(255,255,255,0.3)';
      }

      detectLabel.textContent      = '✓ face detected';
      detectLabel.style.background = 'rgba(0,220,120,0.2)';
      detectLabel.style.color      = 'rgba(0,220,120,0.9)';
    } else {
      detectLabel.textContent      = 'no face detected';
      detectLabel.style.background = 'rgba(255,255,255,0.1)';
      detectLabel.style.color      = 'rgba(255,255,255,0.4)';
      angleLabel.textContent       = '—';
      angleLabel.style.color       = 'rgba(255,255,255,0.3)';
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (exploreIsDetecting) requestAnimationFrame(detectExploreFace);
}