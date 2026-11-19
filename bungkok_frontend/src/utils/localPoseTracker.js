const MODEL_PATH = "/models/pose_landmarker_lite.task";

function resizedFrameSize(video, maxWidth) {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  return {
    width: Math.max(1, Math.round(video.videoWidth * scale)),
    height: Math.max(1, Math.round(video.videoHeight * scale)),
  };
}

export async function startLocalPoseTracker({
  video,
  onLandmarks,
  onReady,
  onError,
  maxFps = 18,
}) {
  const worker = new Worker(
    new URL("../workers/localPoseWorker.js", import.meta.url),
    { type: "module" }
  );
  let stopped = false;
  let workerReady = false;
  let frameInFlight = false;
  let animationId = null;
  let videoFrameId = null;
  let lastCaptureTime = 0;
  const minimumInterval = 1000 / maxFps;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (animationId !== null) cancelAnimationFrame(animationId);
    if (videoFrameId !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(videoFrameId);
    }
    worker.postMessage({ type: "close" });
    worker.terminate();
  };

  worker.onmessage = ({ data }) => {
    if (stopped) return;
    if (data.type === "ready") {
      workerReady = true;
      onReady?.();
      return;
    }
    if (data.type === "result") {
      frameInFlight = false;
      onLandmarks(data.landmarks || []);
      return;
    }
    if (data.type === "error") {
      frameInFlight = false;
      onError?.(new Error(data.message || "Pelacak postur lokal berhenti"));
      stop();
    }
  };
  worker.onerror = (event) => {
    frameInFlight = false;
    onError?.(event.error || new Error(event.message || "Web Worker gagal dimuat"));
    stop();
  };

  worker.postMessage({
    type: "init",
    modelUrl: new URL(MODEL_PATH, window.location.origin).href,
  });

  const capture = async (timestamp) => {
    if (
      stopped ||
      !workerReady ||
      frameInFlight ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      timestamp - lastCaptureTime < minimumInterval
    ) {
      schedule();
      return;
    }

    frameInFlight = true;
    lastCaptureTime = timestamp;
    try {
      const size = resizedFrameSize(video, 384);
      const bitmap = await createImageBitmap(video, {
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: "low",
      });
      if (stopped) {
        bitmap.close();
      } else {
        worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
      }
    } catch (error) {
      frameInFlight = false;
      onError?.(error);
    }
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      videoFrameId = video.requestVideoFrameCallback((timestamp) => capture(timestamp));
    } else {
      animationId = requestAnimationFrame(capture);
    }
  };

  schedule();
  return stop;
}
