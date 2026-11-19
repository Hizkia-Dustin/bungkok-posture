const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_PATH = "/models/pose_landmarker_lite.task";

let visionFilesPromise;

async function loadVisionFiles() {
  if (!visionFilesPromise) {
    visionFilesPromise = import("@mediapipe/tasks-vision").then(({ FilesetResolver }) =>
      FilesetResolver.forVisionTasks(WASM_ROOT)
    );
  }
  return visionFilesPromise;
}

async function createLandmarker() {
  const [{ PoseLandmarker }, vision] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    loadVisionFiles(),
  ]);

  const options = {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
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

export async function startLocalPoseTracker({
  video,
  onLandmarks,
  onReady,
  onError,
  maxFps = 30,
}) {
  const landmarker = await createLandmarker();
  let stopped = false;
  let animationId = null;
  let videoFrameId = null;
  let lastVideoTime = -1;
  let lastInferenceTime = 0;
  const minimumInterval = 1000 / maxFps;

  onReady?.();

  const processVideoFrame = (timestamp) => {
    if (stopped) return;
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTime &&
      timestamp - lastInferenceTime >= minimumInterval
    ) {
      lastVideoTime = video.currentTime;
      lastInferenceTime = timestamp;
      try {
        const result = landmarker.detectForVideo(video, timestamp);
        onLandmarks(result.landmarks?.[0] || []);
      } catch (error) {
        onError?.(error);
      }
    }
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      videoFrameId = video.requestVideoFrameCallback((timestamp) => processVideoFrame(timestamp));
    } else {
      animationId = requestAnimationFrame(processVideoFrame);
    }
  };

  schedule();

  return () => {
    stopped = true;
    if (animationId !== null) cancelAnimationFrame(animationId);
    if (videoFrameId !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(videoFrameId);
    }
    landmarker.close();
  };
}
