// ── FACE TRACKING FOR STORY.HTML ──
// Controls:
//   - head position  → parallax (replaces mouse)
//   - face size      → blur amount (close=sharp, far=blurred)
//   - very far       → images fade to 0.2, title appears
//   - modal open     → far=image visible, close=image fades+text rises

let faceDetector     = null;
let faceIsDetecting  = false;
let faceStream       = null;
let faceModelLoading = false;

// Parallax lerp state (shared with the rAF loop in story.html)
let faceTargetX = 0, faceTargetY = 0;

// Calibration: neutral face size (px) measured on first N frames
let faceSizeSamples  = [];
let faceSizeBaseline = null;
const CALIB_FRAMES   = 50;

// ── tune these ──
const BLUR_NEAR   = 0;     // blur when face fills baseline (very close)
const BLUR_FAR    = 6;    // blur when face = 0.4× baseline (far)
const FADE_THRESH = 0.85;  // ratio below which images fade & title appears
const MODAL_FADE_THRESH = 2.5; // ratio above which modal image fades (close)

async function initFaceTracking() {
  if (faceDetector || faceModelLoading) return;
  faceModelLoading = true;
  const statusLabel = document.getElementById('face-status-label');
  if (statusLabel) statusLabel.textContent = 'loading model…';
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    faceDetector = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: false,
        maxFaces: 1,
      }
    );
    faceModelLoading = false;
    if (statusLabel) statusLabel.textContent = 'model ready';
    await startFaceCamera();
  } catch (err) {
    faceModelLoading = false;
    if (statusLabel) statusLabel.textContent = 'model error: ' + err.message;
    console.warn('Face model error:', err.message);
  }
}

async function startFaceCamera() {
  const video = document.getElementById('face-webcam');
  const statusLabel = document.getElementById('face-status-label');
  try {
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = faceStream;
    if (statusLabel) statusLabel.textContent = 'camera on — calibrating…';
    video.addEventListener('loadeddata', () => {
      faceIsDetecting = true;
      detectFaceLoop();
    }, { once: true });
    // fallback: some browsers fire loadedmetadata but not loadeddata on live streams
    video.addEventListener('loadedmetadata', () => {
      if (!faceIsDetecting) {
        faceIsDetecting = true;
        detectFaceLoop();
      }
    }, { once: true });
  } catch (err) {
    if (statusLabel) statusLabel.textContent = 'cam error: ' + err.message;
    console.warn('Camera error:', err.message);
  }
}

async function detectFaceLoop() {
  if (!faceIsDetecting || !faceDetector) return;

  const video  = document.getElementById('face-webcam');
  const images = document.querySelectorAll('.story-img');
  const titleBlock = document.querySelector('.story-title-block');
  const modal  = document.getElementById('storyModal');

  try {
    const faces = await faceDetector.estimateFaces(video, { flipHorizontal: true });

    const statusLabel = document.getElementById('face-status-label');
    const posLabel    = document.getElementById('face-pos-label');
    const proxLabel   = document.getElementById('face-prox-label');
    const calibLabel  = document.getElementById('face-calib-label');

    if (faces.length > 0) {
      if (statusLabel) statusLabel.textContent = '✓ face detected';
      const kp = faces[0].keypoints;

      // ── HEAD POSITION → parallax ──
      const noseTip = kp[1];
      faceTargetX = -((noseTip.x / video.videoWidth)  - 0.5) * 2;
      faceTargetY = -((noseTip.y / video.videoHeight) - 0.5) * 2;
      if (posLabel) posLabel.textContent = `x:${faceTargetX.toFixed(2)} y:${faceTargetY.toFixed(2)}`;

      // ── FACE SIZE → depth ──
      const faceWidth = Math.abs(kp[454].x - kp[234].x);

      if (faceSizeSamples.length < CALIB_FRAMES) {
        faceSizeSamples.push(faceWidth);
        if (calibLabel) calibLabel.textContent = `${faceSizeSamples.length}/${CALIB_FRAMES}`;
        if (faceSizeSamples.length === CALIB_FRAMES) {
          faceSizeBaseline = faceSizeSamples.reduce((a, b) => a + b) / CALIB_FRAMES;
          if (statusLabel) statusLabel.textContent = '✓ calibrated';
          if (calibLabel)  calibLabel.textContent  = `baseline: ${faceSizeBaseline.toFixed(0)}px`;
        }
      } else {
        const ratio = faceWidth / faceSizeBaseline;
        if (proxLabel) proxLabel.textContent = `${ratio.toFixed(2)}× (${ratio > 1 ? 'closer' : 'farther'})`;
        if (calibLabel) calibLabel.textContent = `base: ${faceSizeBaseline.toFixed(0)}px / now: ${faceWidth.toFixed(0)}px`;

        // ── BLUR (images + default state) ──
        // ratio 1.0 (baseline) → small blur; ratio 1.5+ → no blur; ratio 0.4 → max blur
        const blurT = Math.max(0, Math.min(1, (ratio - 0.4) / (1.4 - 0.4)));
        const blurAmt = BLUR_FAR * (1 - blurT);

        // ── FADE / TITLE (very far) ──
        const isFar = ratio < FADE_THRESH;

        // Modal open state
        const modalActive = modal.classList.contains('active');

        images.forEach(img => {
          let baseBlur = blurAmt;
          // img-s blurs a bit more, img-l a bit less (depth layers)
          if (img.classList.contains('img-s')) baseBlur = blurAmt * 1.4;
          if (img.classList.contains('img-l')) baseBlur = blurAmt * 0.6;

          if (modalActive) {
            // In modal: don't touch images behind
            return;
          }

          img.style.filter  = `blur(${baseBlur.toFixed(1)}px)`;
          img.style.opacity = isFar ? '0.2' : '1';
        });

        // About reveal: hidden normally, visible when far
        if (titleBlock) {
          titleBlock.style.opacity = isFar ? '1' : '0';
          titleBlock.classList.toggle('about-visible', isFar);
          titleBlock.setAttribute('aria-hidden', isFar ? 'false' : 'true');
        }

        // ── MODAL behavior ──
        // ── MODAL behavior ──
if (modalActive) {
  const modalImage = document.getElementById('modalImage');
  const modalText  = document.querySelector('.modal-text');

  const MODAL_TEXT_TRIGGER = 0.9;

  const showModalText = ratio > MODAL_TEXT_TRIGGER;

  if (modalImage) modalImage.style.opacity = showModalText ? '0.2' : '1';
  if (modalText)  modalText.style.opacity  = showModalText ? '1' : '0.2';
}
      }
    } else {
      if (statusLabel) statusLabel.textContent = 'no face — look at camera';
      if (posLabel)    posLabel.textContent    = '—';
      if (proxLabel)   proxLabel.textContent   = '—';
    }
  } catch (e) { /* ignore per-frame errors */ }

  if (faceIsDetecting) requestAnimationFrame(detectFaceLoop);
}

// Start once DOM is ready
document.addEventListener('DOMContentLoaded', initFaceTracking);
