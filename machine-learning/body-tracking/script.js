// Demo page — uses body-tracking-api.js (shared with ciocca-fumo Packs).

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const keypointList = document.getElementById('keypointList');

const { IedBodyTracking } = window;
let isDetecting = false;

const connections = [
  ['nose', 'leftEye'],
  ['nose', 'rightEye'],
  ['leftEye', 'leftEar'],
  ['rightEye', 'rightEar'],
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['nose', 'leftShoulder'],
  ['nose', 'rightShoulder'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

const personColors = [
  { skeleton: '#00FF00', keypoint: '#FF0000' },
  { skeleton: '#0088FF', keypoint: '#FF8800' },
  { skeleton: '#FF00FF', keypoint: '#FFFF00' },
  { skeleton: '#00FFFF', keypoint: '#FF0088' },
  { skeleton: '#88FF00', keypoint: '#8800FF' },
];

function drawKeypoint(keypoint, color) {
  const pos = keypoint.position || keypoint;
  const x = pos.x;
  const y = pos.y;
  if (keypoint.score > IedBodyTracking.POSE_KEYPOINT_MIN_SCORE) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawSkeleton(keypoints, color) {
  const keypointMap = {};
  keypoints.forEach((keypoint) => {
    keypointMap[keypoint.part] = keypoint;
  });

  connections.forEach(([part1, part2]) => {
    const kp1 = keypointMap[part1];
    const kp2 = keypointMap[part2];

    if (kp1 && kp2 && kp1.score > 0.5 && kp2.score > 0.5) {
      const p1 = kp1.position || kp1;
      const p2 = kp2.position || kp2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
}

async function loadModel() {
  try {
    status.textContent = 'Loading pose detection model...';
    await IedBodyTracking.loadPoseModel();
    status.textContent = "Model loaded! Click 'Start Camera'";
    startBtn.disabled = false;
  } catch (error) {
    status.textContent = 'Error loading model: ' + error.message;
    console.error(error);
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        facingMode: 'user',
      },
    });
    video.srcObject = stream;

    video.addEventListener('loadeddata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      status.textContent = 'Tracking bodies...';
      startBtn.textContent = 'Camera Running';
      startBtn.disabled = true;
      detectPose();
    }, { once: true });
  } catch (error) {
    status.textContent = 'Error accessing camera: ' + error.message;
    console.error(error);
  }
}

async function detectPose() {
  if (!IedBodyTracking.isModelReady()) return;

  isDetecting = true;

  const poses = await IedBodyTracking.estimatePoses(video, { maxDetections: 5 });

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let infoHTML = '';

  if (poses.length > 0) {
    infoHTML = `<div style="margin-bottom: 10px;"><strong>Tracking ${poses.length} person(s)</strong></div>`;

    poses.forEach((p, index) => {
      const colors = personColors[index % personColors.length];
      drawSkeleton(p.keypoints, colors.skeleton);
      p.keypoints.forEach((keypoint) => drawKeypoint(keypoint, colors.keypoint));

      const zone = IedBodyTracking.buildLeftChestZone(
        p.keypoints,
        canvas.width,
        canvas.height
      );
      IedBodyTracking.drawLeftChestZone(ctx, zone);

      const visibleKeypoints = p.keypoints.filter(
        kp => kp.score > IedBodyTracking.POSE_KEYPOINT_MIN_SCORE
      );
      infoHTML += `<div class="person-info" style="border-color: ${colors.skeleton};">`;
      infoHTML += `<strong>Person ${index + 1}</strong> (${visibleKeypoints.length} keypoints)<br>`;
      if (zone) {
        infoHTML += `<em>Left chest zone:</em> `
          + `x ${zone.left.toFixed(0)}–${zone.right.toFixed(0)}, `
          + `y ${zone.top.toFixed(0)}–${zone.bottom.toFixed(0)}<br>`;
      }
      infoHTML += '</div>';
    });
  } else {
    infoHTML = '<div>No people detected - step into frame!</div>';
  }

  keypointList.innerHTML = infoHTML;

  if (isDetecting) {
    requestAnimationFrame(detectPose);
  }
}

startBtn.addEventListener('click', startCamera);
loadModel();
