import { FaceDetector, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
let landmarker = null;
let faceDetector = null;

async function createLandmarker(modelUrl, faceModelUrl) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  if (faceModelUrl) {
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: faceModelUrl },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.7,
    });
  }
  const options = {
    baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.55,
    outputSegmentationMasks: false,
  };

  try {
    return await PoseLandmarker.createFromOptions(vision, options);
  } catch {
    return PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      landmarker = await createLandmarker(data.modelUrl, data.faceModelUrl);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: error?.message || String(error) });
    }
    return;
  }

  if (data.type === "frame") {
    try {
      const result = landmarker?.detectForVideo(data.bitmap, data.timestamp);
      const landmarks = result?.landmarks?.[0] || [];
      if (faceDetector && landmarks.length) {
        const faces = faceDetector.detectForVideo(data.bitmap, data.timestamp).detections;
        const matches = faces.filter(({ keypoints }) => {
          const [right, left, nose, mouth] = keypoints;
          if (!mouth) return false;
          const span = Math.abs(left.x - right.x);
          const dy = (nose.y - landmarks[0].y) * data.bitmap.height / data.bitmap.width;
          return span > 0.015 && Math.hypot(nose.x - landmarks[0].x, dy) < 0.65 * span
            && mouth.y - nose.y > 0.004 && nose.y > (left.y + right.y) / 2;
        });
        if (matches.length === 1) {
          const [right, left] = matches[0].keypoints;
          for (const [i, eye] of [[2, left], [5, right]]) {
            landmarks[i] = { ...landmarks[i], x: eye.x, y: eye.y, visibility: 1, faceEye: true };
          }
        }
      }
      self.postMessage({ type: "result", landmarks });
    } catch (error) {
      self.postMessage({ type: "error", message: error?.message || String(error) });
    } finally {
      data.bitmap.close();
    }
    return;
  }

  if (data.type === "close") {
    faceDetector?.close();
    landmarker?.close();
    landmarker = null;
    self.close();
  }
};
