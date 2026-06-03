let aboutMicStream = null;
let aboutAudioContext = null;
let aboutAnalyser = null;
let aboutMicDetecting = false;
let aboutMicWasBlowing = false;

const MIC_THRESHOLD = 60;
const FLATNESS_THRESHOLD = 0.18;

function setAboutGestureStatus(text) {
  if (!document.body.classList.contains('about-open')) return;
  const el = document.getElementById('gesture-status');
  if (el) el.textContent = text;
}

function updateAboutMicBlowState(isBlow) {
  if (isBlow && !aboutMicWasBlowing) {
    aboutMicWasBlowing = true;
    window.onAboutBlowGestureStart?.();
  } else if (!isBlow && aboutMicWasBlowing) {
    aboutMicWasBlowing = false;
    window.onAboutBlowGestureEnd?.();
  }

  if (isBlow) {
    const index = window.getAboutRevealIndex?.();
    const total = document.querySelectorAll('.about-plate img, .about-grid img').length;
    setAboutGestureStatus(
      typeof index === 'number'
        ? `Blow — figure ${index + 1}/${total}`
        : 'Blow — figure revealed'
    );
  } else if (document.body.classList.contains('about-open')) {
    window.updateIdleGestureStatus?.();
  }
}

function detectMicBlow(analyser, audioContext) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const binHz = (audioContext.sampleRate / 2) / analyser.frequencyBinCount;
  const lo = Math.floor(100 / binHz);
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
  const effectiveBins = bins - zeroes;
  const geoMean = effectiveBins > 0
    ? Math.exp(logSum / effectiveBins) * (effectiveBins / bins)
    : 0;
  const flatness = avg > 1 ? geoMean / avg : 0;

  return avg >= MIC_THRESHOLD && flatness >= FLATNESS_THRESHOLD;
}

function loopAboutMicDetection() {
  if (!aboutMicDetecting || !aboutAnalyser || !aboutAudioContext) return;

  updateAboutMicBlowState(detectMicBlow(aboutAnalyser, aboutAudioContext));
  requestAnimationFrame(loopAboutMicDetection);
}

async function startAboutMicDetection() {
  if (aboutMicDetecting) return;

  try {
    aboutMicStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    aboutAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (aboutAudioContext.state === 'suspended') {
      await aboutAudioContext.resume();
    }

    aboutAnalyser = aboutAudioContext.createAnalyser();
    aboutAnalyser.fftSize = 1024;

    const source = aboutAudioContext.createMediaStreamSource(aboutMicStream);
    source.connect(aboutAnalyser);

    aboutMicDetecting = true;
    aboutMicWasBlowing = false;
    window.updateIdleGestureStatus?.();
    loopAboutMicDetection();
  } catch (err) {
    console.warn('Mic unavailable:', err.message);
    setAboutGestureStatus('Microphone unavailable — allow access');
  }
}

function stopAboutMicDetection() {
  aboutMicDetecting = false;

  if (aboutMicWasBlowing) {
    aboutMicWasBlowing = false;
    window.onAboutBlowGestureEnd?.();
  }

  if (aboutMicStream) {
    aboutMicStream.getTracks().forEach(track => track.stop());
    aboutMicStream = null;
  }

  if (aboutAudioContext) {
    aboutAudioContext.close().catch(() => {});
    aboutAudioContext = null;
    aboutAnalyser = null;
  }
}

window.startAboutMicDetection = startAboutMicDetection;
window.stopAboutMicDetection = stopAboutMicDetection;
window.isAboutMicBlowing = () => aboutMicWasBlowing;
