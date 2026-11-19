import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
let landmarker = null;

async function createLandmarker(modelUrl) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
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
      landmarker = await createLandmarker(data.modelUrl);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: error?.message || String(error) });
    }
    return;
  }

  if (data.type === "frame") {
    try {
      const result = landmarker?.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: "result", landmarks: result?.landmarks?.[0] || [] });
    } catch (error) {
      self.postMessage({ type: "error", message: error?.message || String(error) });
    } finally {
      data.bitmap.close();
    }
    return;
  }

  if (data.type === "close") {
    landmarker?.close();
    landmarker = null;
    self.close();
  }
};
