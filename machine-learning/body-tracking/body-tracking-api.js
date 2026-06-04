/**
 * Shared PoseNet body tracking (same stack as body-tracking/script.js).
 * Used by the demo page and ciocca-fumo Packs chest-zone detection.
 */
(function (global) {
  const POSE_KEYPOINT_MIN_SCORE = 0.5;
  const POSE_MIN_STRONG_KEYPOINTS = 8;

  const POSE_MODEL_CONFIG = {
    architecture: 'MobileNetV1',
    outputStride: 16,
    inputResolution: { width: 480, height: 360 },
    multiplier: 0.75,
  };

  const ESTIMATE_CONFIG = {
    flipHorizontal: false,
    maxDetections: 1,
    scoreThreshold: POSE_KEYPOINT_MIN_SCORE,
    nmsRadius: 30,
  };

  let poseModel = null;
  let modelLoading = false;

  function getKeypointPosition(keypoint) {
    if (!keypoint) return null;
    if (keypoint.position) {
      return { x: keypoint.position.x, y: keypoint.position.y };
    }
    if (typeof keypoint.x === 'number' && typeof keypoint.y === 'number') {
      return { x: keypoint.x, y: keypoint.y };
    }
    return null;
  }

  function getPoseKeypoint(keypoints, part) {
    const kp = keypoints.find(k => k.part === part);
    if (!kp || kp.score < POSE_KEYPOINT_MIN_SCORE) return null;
    const pos = getKeypointPosition(kp);
    if (!pos) return null;
    return { ...pos, score: kp.score, part };
  }

  /**
   * Left chest zone from PoseNet torso landmarks (person's anatomical left side).
   */
  function buildLeftChestZone(keypoints, frameW, frameH) {
    const leftShoulder = getPoseKeypoint(keypoints, 'leftShoulder');
    const rightShoulder = getPoseKeypoint(keypoints, 'rightShoulder');
    const leftHip = getPoseKeypoint(keypoints, 'leftHip');

    if (!leftShoulder || !leftHip) return null;

    const torsoH = Math.max(leftHip.y - leftShoulder.y, frameH * 0.1);
    const shoulderSpan = rightShoulder
      ? Math.abs(rightShoulder.x - leftShoulder.x)
      : frameW * 0.25;

    const sternumX = rightShoulder
      ? leftShoulder.x + (rightShoulder.x - leftShoulder.x) * 0.38
      : leftShoulder.x + shoulderSpan * 0.38;

    const centerX = leftShoulder.x * 0.5 + sternumX * 0.5;
    // Mid chest: lower on torso (between shoulder line and hip, not on clavicles)
    const chestTop = leftShoulder.y + torsoH * 0.22;
    const chestBottom = leftShoulder.y + torsoH * 0.58;
    const centerY = (chestTop + chestBottom) / 2;
    const radius = Math.max(torsoH * 0.28, shoulderSpan * 0.28, frameW * 0.065);

    const left = Math.min(leftShoulder.x, leftHip.x) - shoulderSpan * 0.12;
    const right = sternumX + shoulderSpan * 0.08;
    const top = chestTop;
    const bottom = chestBottom;

    return {
      centerX,
      centerY,
      radius,
      left: Math.max(0, left),
      right: Math.min(frameW, right),
      top: Math.max(0, top),
      bottom: Math.min(frameH, bottom),
    };
  }

  function isPointInZone(x, y, zone) {
    if (!zone) return false;
    const inBox = x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
    const nearCenter = Math.hypot(x - zone.centerX, y - zone.centerY) <= zone.radius;
    return inBox || nearCenter;
  }

  function filterStrongPoses(poses) {
    return poses.filter(pose => {
      const strong = pose.keypoints.filter(kp => kp.score > POSE_KEYPOINT_MIN_SCORE).length;
      return strong >= POSE_MIN_STRONG_KEYPOINTS;
    });
  }

  async function loadPoseModel() {
    if (poseModel) return poseModel;
    if (modelLoading) {
      while (modelLoading) {
        await new Promise(r => setTimeout(r, 50));
      }
      return poseModel;
    }
    if (typeof posenet === 'undefined') {
      throw new Error('PoseNet is not loaded');
    }

    modelLoading = true;
    try {
      if (typeof tf !== 'undefined') {
        await tf.setBackend('webgl');
        await tf.ready();
      }
      poseModel = await posenet.load(POSE_MODEL_CONFIG);
      return poseModel;
    } finally {
      modelLoading = false;
    }
  }

  async function estimatePoses(video, options = {}) {
    if (!poseModel || !video || video.readyState < 2) return [];

    const config = { ...ESTIMATE_CONFIG, ...options };
    const allPoses = await poseModel.estimateMultiplePoses(video, config);
    return filterStrongPoses(allPoses);
  }

  async function estimatePrimaryPose(video, options = {}) {
    const poses = await estimatePoses(video, options);
    return poses[0] || null;
  }

  function drawLeftChestZone(ctx, zone, color = 'rgba(0, 255, 120, 0.35)') {
    if (!ctx || !zone) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 255, 120, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(zone.left, zone.top, zone.right - zone.left, zone.bottom - zone.top);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(zone.centerX, zone.centerY, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const api = {
    POSE_KEYPOINT_MIN_SCORE,
    POSE_MIN_STRONG_KEYPOINTS,
    POSE_MODEL_CONFIG,
    ESTIMATE_CONFIG,
    loadPoseModel,
    estimatePoses,
    estimatePrimaryPose,
    getPoseKeypoint,
    buildLeftChestZone,
    isPointInZone,
    drawLeftChestZone,
    filterStrongPoses,
    isModelReady: () => Boolean(poseModel),
  };

  global.IedBodyTracking = api;
})(typeof window !== 'undefined' ? window : globalThis);
