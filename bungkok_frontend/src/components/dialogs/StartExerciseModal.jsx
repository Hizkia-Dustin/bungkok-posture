import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Smartphone } from "lucide-react";
import PhoneCameraModal from "../camera/PhoneCameraModal";
import { useApp } from "../../context/AppContext";
import { usePostureMonitor } from "../../context/PostureMonitorContext";
import { Button, Progress } from "../common/SoftUI";
import { activeCameraFrame, FrameArtwork } from "../common/CameraFrame";
import { clockLabel } from "../../utils/exercise";
import { playReminder } from "../../utils/exportData";
import { captureFrameAsBlob } from "../../utils/cameraCapture";
import { startLocalPoseTracker } from "../../utils/localPoseTracker";
import { startPictureInPictureComposer } from "../../utils/pictureInPictureComposer";
import {
  drawSkeletonOnCanvas,
  clearSkeletonCanvas,
} from "../../utils/skeletonDrawer";
import {
  checkBackendHealth,
  detectPose,
  sendCalibration,
  predictFrame,
  startSession,
  pauseSession,
  heartbeatSession,
  finishSession,
  fetchActiveSession,
  cancelActiveSession,
} from "../../services/postureApi";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendDesktopPostureNotification,
  playBackgroundChime,
  updateBackgroundTabTitle,
  resetTabTitle,
  togglePictureInPicture,
  setupAutoPictureInPicture,
  requestAutoPictureInPicture,
} from "../../utils/backgroundAlert";
import "../../styles/exercise.css";

const steps = ["Persiapan", "Kalibrasi", "Atur sesi", "Latihan", "Rekap"];
const virtualCamera = /privacy view|virtual|obs camera/i;
const ENABLE_LOCAL_POSE_TRACKER = false;

async function startPreview(element, media) {
  element.srcObject = media;
  let timer;
  try {
    await Promise.race([
      element.play(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("preview")), 7000);
      }),
    ]);
    if (!element.videoWidth || !element.videoHeight || element.readyState < 2) throw new Error("preview");
  } finally {
    clearTimeout(timer);
  }
}
const emptyMetrics = () => ({
  total: 0,
  upright: 0,
  forward: 0,
  backward: 0,
  unknown: 0,
  paused: 0,
  breaks: 0,
  reminders: 0,
  uprightStreak: 0,
  longestUpright: 0,
});

export default function StartExerciseModal({ closeRequest }) {
  const { user, completeSession, appConfig, equippedItems } = useApp();
  const { isOpen: monitorIsOpen, testMode, closeMonitor, minimizeMonitor, setMonitorStream, publishSnapshot, registerControls } = usePostureMonitor();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [camera, setCamera] = useState("idle");
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({ light: false, shoulders: false });
  const [countdown, setCountdown] = useState(null);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationInfo, setCalibrationInfo] = useState(null);
  const [backendStatus, setBackendStatus] = useState({ online: false, checking: true });
  const [aiFeedback, setAiFeedback] = useState(null);
  const [alignmentInfo, setAlignmentInfo] = useState({
    isUpright: false,
    feedback: "",
    hasPerson: false,
  });

  const [config, setConfig] = useState({
    timing: "free",
    mode: "work",
    sensitivity: 15,
    sound: user.reminderSoundActive,
    speed: 1,
  });
  const [posture, setPosture] = useState("upright");
  const [paused, setPaused] = useState(false);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [result, setResult] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [cancellingSession, setCancellingSession] = useState(false);
  const [reminderNotice, setReminderNotice] = useState("");
  const [visualFrame, setVisualFrame] = useState({ landmarks: [], color: "#22c55e" });
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission);
  const [isPipActive, setIsPipActive] = useState(false);
  const [autoPipEnabled, setAutoPipEnabled] = useState(true);
  const [monitorInterrupted, setMonitorInterrupted] = useState(false);
  const cameraFrameId = activeCameraFrame(equippedItems);

  const [povMode, setPovMode] = useState("upper_body");
  const [availableDevices, setAvailableDevices] = useState([]);
  const [primaryDeviceId, setPrimaryDeviceId] = useState("");
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneStream, setPhoneStream] = useState(null);
  const phoneReceiver = useRef(null);

  const applyPhoneStreamAsActive = async (incomingStream = phoneStream, receiver) => {
    if (!incomingStream) return;
    try {
      if (receiver) {
        if (receiver !== phoneReceiver.current) stopCamera();
        else if (stream.current !== incomingStream) stream.current?.getTracks().forEach(track => track.stop());
        phoneReceiver.current = receiver;
        stream.current = incomingStream;
        setPhoneStream(incomingStream);
      }
      setPovMode("full_torso");
      if (video.current) {
        await startPreview(video.current, incomingStream);
        setCamera("active");
        setMonitorStream(incomingStream);
      }
    } catch (err) {
      stopCamera();
      setCamera("idle");
      setError("Gambar HP belum muncul. Sambungkan kembali kamera samping.");
    }
  };

  const disconnectPhoneStream = () => {
    if (phoneStream) {
      phoneStream.getTracks().forEach((t) => t.stop());
      setPhoneStream(null);
    }
    enableCamera();
  };

  // Ambil daftar perangkat kamera sejak awal jika browser mendukung
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setAvailableDevices(videoInputs);
      }).catch(() => {});
    }
  }, []);

  // Mengembalikan judul tab saat pengguna kembali ke tab Bungkok,
  // dan OTOMATIS memunculkan popup layar kecil (Picture-in-Picture) saat tab ditinggalkan / diminimalkan
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.hidden) {
        // Tab sedang di latar belakang / berpindah ke aplikasi atau tab lain
        if (step === 3 && running.current && autoPipEnabled && pictureInPictureSource()) {
          if (!document.pictureInPictureElement) {
            await requestAutoPictureInPicture(pictureInPictureSource(), setIsPipActive);
          }
        }
      } else {
        // Tab kembali aktif dilihat pengguna
        resetTabTitle();
      }
    };

    const handleBeforeUnload = (e) => {
      if (step === 3 && running.current) {
        e.preventDefault();
        e.returnValue = "Sesi pemantauan postur masih berlangsung. Yakin ingin menutup halaman?";
        return e.returnValue;
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      resetTabTitle();
    };
  }, [step, autoPipEnabled]);

  const video = useRef(null);
  const pipVideo = useRef(null);
  const pipCanvas = useRef(null);
  const engineVideo = useRef(null);
  const canvas = useRef(null);
  const localTrackingReady = useRef(false);
  const localLandmarks = useRef([]);
  const localVisualColor = useRef("#22c55e");
  const lastLocalSnapshot = useRef(0);
  const stream = useRef(null);
  const alive = useRef(true);
  const running = useRef(false);
  const startTime = useRef(null);
  const sessionId = useRef(null);
  const calibrationId = useRef(null);
  const live = useRef(emptyMetrics());
  const settings = useRef({ config, posture, paused });
  settings.current = { config, posture, paused };
  const pictureInPictureSource = () => pipVideo.current?.srcObject ? pipVideo.current : video.current;
  const updateVisualFrame = (serverLandmarks, color) => {
    localVisualColor.current = color;
    const landmarks = localTrackingReady.current && localLandmarks.current.length
      ? localLandmarks.current
      : (serverLandmarks || []);
    setVisualFrame({ landmarks, color });
  };

  useEffect(() => {
    if (camera !== "active" || !video.current || !pipVideo.current || !pipCanvas.current) return undefined;
    return startPictureInPictureComposer({
      sourceVideo: video.current,
      skeletonCanvas: canvas.current,
      targetCanvas: pipCanvas.current,
      targetVideo: pipVideo.current,
      frameId: cameraFrameId,
      userName: user.name,
      getState: () => settings.current,
    }) || undefined;
  }, [camera, cameraFrameId, user.name]);

  useEffect(() => {
    const source = pictureInPictureSource();
    if (!source) return undefined;
    return setupAutoPictureInPicture(source, setIsPipActive);
  }, [camera, cameraFrameId]);

  // Loop & Smoothing Buffers (Sama persis dengan static/index.html)
  const requestInFlight = useRef(false);
  const countdownActive = useRef(false);
  const predictionHistory = useRef([]);
  const alignmentHistory = useRef([]);
  const slouchConsecutiveFrames = useRef(0);
  const slouchWarningActive = useRef(false);
  const reminderTimer = useRef(null);
  const monitorOpen = useRef(monitorIsOpen);
  monitorOpen.current = monitorIsOpen;
  const stopCamera = () => {
    if (phoneReceiver.current) {
      phoneReceiver.current.destroy();
      phoneReceiver.current = null;
      setPhoneStream(null);
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (engineVideo.current) {
      engineVideo.current.srcObject = null;
      engineVideo.current.remove();
      engineVideo.current = null;
    }
    setMonitorStream(null);
    alignmentHistory.current = [];
    clearTimeout(reminderTimer.current);
    setReminderNotice("");
    clearSkeletonCanvas(canvas.current);
  };

  const syncCanvasSize = (source = video.current) => {
    if (source && canvas.current) {
      const vw = source.videoWidth || 640;
      const vh = source.videoHeight || 480;
      if (canvas.current.width !== vw || canvas.current.height !== vh) {
        canvas.current.width = vw;
        canvas.current.height = vh;
      }
    }
  };

  // Majority Voting Buffer untuk Temporal Smoothing (Window 5 frame)
  const getSmoothedPrediction = (newPred) => {
    predictionHistory.current.push(newPred);
    if (predictionHistory.current.length > 5) predictionHistory.current.shift();
    const counts = {};
    let dominant = newPred;
    let maxCount = 0;
    for (const p of predictionHistory.current) {
      counts[p] = (counts[p] || 0) + 1;
      if (counts[p] > maxCount) {
        maxCount = counts[p];
        dominant = p;
      }
    }
    return maxCount >= 3 ? dominant : predictionHistory.current[0] || newPred;
  };

  useEffect(() => {
    alive.current = true;
    checkBackendHealth().then((res) => {
      if (alive.current) {
        setBackendStatus(res);
      }
    });
    fetchActiveSession().then((active) => {
      if (!alive.current || !active) return;
      setActiveSession(active);
      setError("Sesi latihan sebelumnya masih aktif karena belum sempat diselesaikan.");
    }).catch(() => {});
    return () => {
      alive.current = false;
      running.current = false;
      stopCamera();
    };
  }, []);

  const sound = () =>
    playReminder(user.reminderVolume, appConfig.reminder).catch(() => {
      if (alive.current)
        setError("Suara tidak tersedia; pengingat visual tetap aktif.");
    });

  const showPostureReminder = () => {
    const message = appConfig.reminder?.message
      || "Postur badanmu mulai bungkuk. Yuk, tegakkan kembali agar tetap nyaman dan fokus.";
    setReminderNotice(message);
    clearTimeout(reminderTimer.current);
    reminderTimer.current = setTimeout(() => setReminderNotice(""), 4500);
    if (settings.current.config.sound) sound();
    window.bungkokDesktop?.notify?.({ title: "Pengingat postur", message });
  };

  const enableCamera = async (overridePrimaryId) => {
    const primId = overridePrimaryId !== undefined ? overridePrimaryId : primaryDeviceId;

    setCamera("loading");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");

      stopCamera();

      // Constraints untuk Kamera Utama
      const primaryConstraints = {
        video: primId
          ? { deviceId: { exact: primId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      };

      let media = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      if (!alive.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = media;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (!alive.current) return;
      const inputs = devices.filter(device => device.kind === "videoinput");
      setAvailableDevices(inputs);
      const physical = inputs.find(device => device.label && !virtualCamera.test(device.label));
      if (!primId && virtualCamera.test(media.getVideoTracks()[0].label) && physical) {
        media.getTracks().forEach(track => track.stop());
        media = await navigator.mediaDevices.getUserMedia({
          video: { ...primaryConstraints.video, deviceId: { exact: physical.deviceId } },
          audio: false,
        });
        if (!alive.current) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream.current = media;
      }
      setPrimaryDeviceId(media.getVideoTracks()[0].getSettings().deviceId || primId);
      await startPreview(video.current, media);
      if (!alive.current) return;
      setMonitorStream(media);
      const persistentVideo = document.createElement("video");
      persistentVideo.muted = true;
      persistentVideo.autoplay = true;
      persistentVideo.playsInline = true;
      persistentVideo.srcObject = media;
      persistentVideo.setAttribute("aria-hidden", "true");
      Object.assign(persistentVideo.style, {
        position: "fixed", width: "2px", height: "2px", left: "0", bottom: "0",
        opacity: "0.01", pointerEvents: "none",
      });
      document.body.appendChild(persistentVideo);
      engineVideo.current = persistentVideo;
      persistentVideo.play().catch(() => {});
      media.getVideoTracks()[0].onended = () => {
        if (alive.current) {
          setCamera("idle");
          setError("Kamera terputus. Aktifkan ulang.");
          setPaused(true);
          setMonitorInterrupted(true);
        }
      };
      setCamera("active");
      setMonitorInterrupted(false);
    } catch (failure) {
      if (alive.current) {
        stopCamera();
        setCamera("idle");
        setError(failure.name === "NotAllowedError"
          ? "Izinkan akses kamera di browser, lalu coba lagi."
          : "Gambar kamera belum muncul. Periksa penutup webcam atau pilih perangkat kamera lain.");
      }
    }
  };

  const handlePovChange = (newMode) => {
    if (newMode === povMode) return;
    setPovMode(newMode);
    alignmentHistory.current = [];
    setChecks({ light: false, shoulders: false });
    setCalibrated(false);
    calibrationId.current = null;

    if (newMode === "full_torso") {
      // Langsung munculkan modal QR Code jika kamera HP belum terhubung
      if (!phoneStream) {
        setIsPhoneModalOpen(true);
      } else {
        applyPhoneStreamAsActive(phoneStream);
      }
    } else {
      // Kembali ke kamera laptop (Depan)
      enableCamera();
    }
  };

  const handleDeviceSelect = (deviceId) => {
    setPrimaryDeviceId(deviceId);
    setChecks({ light: false, shoulders: false });
    setCalibrated(false);
    calibrationId.current = null;
    if (camera === "active") enableCamera(deviceId);
  };
  // =========================================================================
  // Inferensi berjalan terpisah dari renderer skeleton 60 FPS.
  // Didukung oleh Web Worker agar tetap berjalan di latar belakang (Background)
  // saat pengguna membuka tab lain atau meminimalkan browser.
  // =========================================================================
  useEffect(() => {
    if (camera !== "active" || !ENABLE_LOCAL_POSE_TRACKER) return;

    const captureSource = engineVideo.current || video.current;
    if (!captureSource) return;

    let cancelled = false;
    let stopTracker = null;
    localTrackingReady.current = false;

    startLocalPoseTracker({
      video: captureSource,
      maxFps: 18,
      onReady: () => {
        if (!cancelled) localTrackingReady.current = true;
      },
      onLandmarks: (landmarks) => {
        if (cancelled || !monitorOpen.current) return;
        localTrackingReady.current = true;
        localLandmarks.current = landmarks;
        drawSkeletonOnCanvas(canvas.current, landmarks, localVisualColor.current);

        const now = performance.now();
        if (landmarks.length && now - lastLocalSnapshot.current >= 350) {
          lastLocalSnapshot.current = now;
          setVisualFrame({ landmarks, color: localVisualColor.current });
        }
      },
      onError: () => {
        localTrackingReady.current = false;
      },
    }).then((stop) => {
      if (cancelled) stop();
      else stopTracker = stop;
    }).catch(() => {
      localTrackingReady.current = false;
    });

    return () => {
      cancelled = true;
      localTrackingReady.current = false;
      localLandmarks.current = [];
      stopTracker?.();
    };
  }, [camera, povMode]);

  useEffect(() => {
    if (camera !== "active") return;

    let isSubscribed = true;
    let worker = null;
    let fallbackInterval = null;

    const processFrame = async () => {
      const captureSource = engineVideo.current || video.current;
      if (
        !isSubscribed ||
        requestInFlight.current ||
        countdownActive.current ||
        !captureSource ||
        captureSource.readyState < 2
      ) {
        return;
      }

      requestInFlight.current = true;
      try {
        syncCanvasSize(captureSource);
        const blob = await captureFrameAsBlob(captureSource, 400, 0.8);

        // KASUS A: Tahap Latihan (Step 3) & Sudah Dikalibrasi
        if (step === 3 && running.current && calibrationId.current && !settings.current.paused) {
          const res = await predictFrame(blob, calibrationId.current, sessionId.current);
          if (!isSubscribed) return;
          setMonitorInterrupted(false);

          setAiFeedback(res);
          if (res.server?.metrics) {
            live.current = res.server.metrics;
            setMetrics({ ...res.server.metrics });
          }

          if (res.status === "ok") {
            const rawPred = res.server?.stable_prediction || res.prediction;
            const pred = getSmoothedPrediction(rawPred);
            let boneColor = "#22c55e";
            let statusTitle = "Posturmu sudah pas";

            // Fitur Peregangan Tangan (Arm Activity Gate)
            if (res.upper_is_arm_activity) {
              boneColor = "#38bdf8"; // Sky Blue
              statusTitle = "Sedang meregangkan tangan";
              slouchConsecutiveFrames.current = 0;
              setPosture("upright");
              slouchWarningActive.current = false;
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (res.upper_is_head_activity) {
              boneColor = "#0ea5e9";
              statusTitle = "Badanmu tetap tegak";
              slouchConsecutiveFrames.current = 0;
              setPosture("upright");
              slouchWarningActive.current = false;
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (pred === "tegak") {
              boneColor = "#22c55e"; // Hijau
              statusTitle = "Posturmu sudah pas";
              slouchConsecutiveFrames.current = 0;
              setPosture("upright");
              slouchWarningActive.current = false;
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (pred === "condong_depan" || pred === "condong_belakang") {
              slouchConsecutiveFrames.current++;
              if (pred === "condong_depan") {
                boneColor = "#ef4444"; // Merah
                statusTitle =
                  res.cervical_angle_deg && res.cervical_angle_deg > 16.0
                    ? "Kepalamu mulai terlalu maju"
                    : "Punggungmu mulai membungkuk";
                setPosture("forward");
              } else {
                boneColor = "#f59e0b"; // Kuning
                statusTitle = "Posisimu terlalu bersandar";
                setPosture("backward");
              }

              // Pemicu Pengingat Postur (Baik di Tab Aktif maupun di Background Tab Lain)
              if (document.hidden) {
                // Tab sedang di latar belakang: kirim Desktop Notification + Bunyi Chime + Ubah Judul Tab
                sendDesktopPostureNotification(
                  "Yuk, rapikan posisi duduk",
                  statusTitle + ". Tegakkan badan perlahan agar tetap nyaman."
                );
                window.bungkokDesktop?.notify?.({
                  title: "Yuk, rapikan posisi duduk",
                  message: statusTitle + ". Tegakkan badan perlahan agar tetap nyaman.",
                });
                if (settings.current.config.sound) {
                  playBackgroundChime(user.reminderVolume);
                }
                updateBackgroundTabTitle("slouch");
              } else {
                // Tab sedang aktif di depan mata pengguna
                if (!slouchWarningActive.current) showPostureReminder();
              }
              slouchWarningActive.current = true;
            }

            res.displayTitle = statusTitle;
            updateVisualFrame(res.landmarks, boneColor);
            if (monitorOpen.current && !localTrackingReady.current) drawSkeletonOnCanvas(canvas.current, res.landmarks, boneColor);
          } else {
            updateVisualFrame(res.landmarks, "#ef4444");
            if (monitorOpen.current && !localTrackingReady.current) drawSkeletonOnCanvas(canvas.current, res.landmarks || [], "#ef4444");
          }
        }
        // KASUS B: Tahap Persiapan & Kalibrasi (Step 0, 1, 2)
        else {
          const activeMode = povMode === "full_torso" ? "full_torso" : "upper_body";
          const res = await detectPose(blob, activeMode);
          if (!isSubscribed) return;

          if (res.status === "ok") {
            alignmentHistory.current.push({
              isUpright: !!res.is_upright,
              feedback: res.alignment_feedback,
            });
            if (alignmentHistory.current.length > 5) alignmentHistory.current.shift();
            const uprightVotes = alignmentHistory.current.filter((item) => item.isUpright).length;
            const isUpright = alignmentHistory.current.length >= 3
              && uprightVotes >= Math.ceil(alignmentHistory.current.length * 0.6);
            const stableFeedback = [...alignmentHistory.current]
              .reverse()
              .find((item) => item.isUpright === isUpright)?.feedback;
            const boneColor = isUpright ? "#22c55e" : "#f59e0b";
            updateVisualFrame(res.landmarks, boneColor);
            if (monitorOpen.current && !localTrackingReady.current) drawSkeletonOnCanvas(canvas.current, res.landmarks, boneColor);
            setAlignmentInfo({
              isUpright,
              feedback:
                stableFeedback || res.alignment_feedback ||
                (isUpright ? "Posisi pas & tegak! Siap kalibrasi." : "Sejajarkan bahu dan tegakkan leher Anda."),
              hasPerson: true,
            });
          } else {
            updateVisualFrame(res.landmarks, "#ef4444");
            if (monitorOpen.current && !localTrackingReady.current) drawSkeletonOnCanvas(canvas.current, res.landmarks || [], "#ef4444");
            setAlignmentInfo({
              isUpright: false,
              feedback: res.reason || "Pastikan tubuh berada di dalam kamera.",
              hasPerson: false,
            });
          }
        }
      } catch (err) {
        if (err?.status === 401) {
          isSubscribed = false;
          setPaused(true);
          setError("Sesi masukmu berakhir. Masuk kembali agar kamera dapat melanjutkan pemantauan.");
        }
      } finally {
        requestInFlight.current = false;
      }
    };

    // Jalankan Web Worker agar tidak di-freeze browser saat buka tab lain
    try {
      worker = new Worker("/posture-worker.js");
      worker.onmessage = (e) => {
        if (e.data?.type === "tick") {
          processFrame();
        }
      };
      worker.postMessage({ command: "start", interval: 150 });
    } catch {
      // Fallback timer jika browser membatasi web worker
      fallbackInterval = setInterval(processFrame, 150);
    }

    return () => {
      isSubscribed = false;
      if (worker) {
        worker.postMessage({ command: "stop" });
        worker.terminate();
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [camera, step, povMode]);

  // Proses Kalibrasi Bersih
  const startCalibrationProcess = async () => {
    setError("");
    if (camera === "active" && backendStatus.online && video.current) {
      countdownActive.current = true;
      try {
        for (const number of [1, 2, 3]) {
          if (!alive.current) return;
          setCountdown(number);
          await new Promise(resolve => setTimeout(resolve, 900));
        }
        if (!alive.current) return;
        setCountdown("processing");

        const b1 = await captureFrameAsBlob(video.current, 440, 0.8);
        await new Promise((r) => setTimeout(r, 250));
        const b2 = await captureFrameAsBlob(video.current, 440, 0.8);
        await new Promise((r) => setTimeout(r, 250));
        const b3 = await captureFrameAsBlob(video.current, 440, 0.8);

        const activeMode = povMode === "full_torso" ? "full_torso" : "upper_body";
        const res = await sendCalibration([b1, b2, b3], activeMode);
        calibrationId.current = res.calibration_id;
        setCalibrationInfo(res);
        setCalibrated(true);
        setCountdown(null);
        countdownActive.current = false;
        if (settings.current.config.sound) playBackgroundChime(user.reminderVolume);
      } catch (err) {
        console.error("Kalibrasi gagal:", err);
        setError("Posisi acuan belum tersimpan. Pastikan kepala dan bahu terlihat jelas, lalu coba lagi.");
        setCountdown(null);
        countdownActive.current = false;
      }
    } else {
      setError("Kamera dan pemantauan harus siap sebelum menyimpan posisi acuan.");
    }
  };

  // Selesaikan Sesi & Simpan ke Database
  const finish = async () => {
    if (!running.current) return;
    running.current = false;
    try {
      if (testMode) {
        await cancelActiveSession(sessionId.current);
        setResult({ testMode: true });
        setStep(4);
        setConfirmEnd(false);
        stopCamera();
        return;
      }
      const serverResult = await finishSession(sessionId.current);
      const completed = await completeSession(serverResult);
      setResult(completed);
      setCelebrate(completed.challenges.length > 0 || completed.badges.length > 0);
    } catch (failure) {
      running.current = true;
      setError(failure.message);
      return;
    }
    setStep(4);
    setConfirmEnd(false);
    stopCamera();

  };

  useEffect(() => {
    if (!closeRequest) return;
    closeRequest.current = () => (step === 3 ? setConfirmEnd(true) : closeMonitor());
    return () => {
      closeRequest.current = null;
    };
  }, [step, closeRequest, closeMonitor]);

  // Timer metrik sesi (akumulasi detik latihan)
  useEffect(() => {
    if (step !== 3) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last) / 1000;
      last = now;
      if (!running.current) return;
      const { config: current, posture: state, paused: isPaused } = settings.current;
      const m = live.current;
      const delta = elapsed * current.speed;
      m.total += delta;

      // Jangan pause saat tab berada di latar belakang (document.hidden)
      // agar waktu kerja dan postur pengguna tetap terpantau akurat!
      if (isPaused) {
        m.paused += delta;
        m.uprightStreak = 0;
      } else {
        m[state] += delta;
        m.uprightStreak = state === "upright" ? m.uprightStreak + delta : 0;
        m.longestUpright = Math.max(m.longestUpright, m.uprightStreak);
      }
      setMetrics({ ...m });
    }, 250);
    return () => clearInterval(timer);
  }, [step]);

  // Heartbeat memisahkan sesi yang benar-benar aktif dari sesi yang kehilangan koneksi.
  useEffect(() => {
    if (step !== 3 || !sessionId.current) return undefined;
    let subscribed = true;
    const sendHeartbeat = async () => {
      try {
        const response = await heartbeatSession(sessionId.current);
        if (!subscribed) return;
        setMonitorInterrupted(false);
        if (response.metrics) {
          live.current = response.metrics;
          setMetrics({ ...response.metrics });
        }
      } catch {
        if (!subscribed) return;
        setMonitorInterrupted(true);
        setError("Koneksi pemantauan terputus. Sesi tetap tersimpan dan akan dilanjutkan saat backend kembali.");
      }
    };
    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 5000);
    return () => { subscribed = false; clearInterval(timer); };
  }, [step]);

  const begin = async () => {
    if (!calibrationId.current) {
      setError("Kalibrasi kamera wajib diselesaikan sebelum latihan.");
      return;
    }
    live.current = emptyMetrics();
    setMetrics(emptyMetrics());
    predictionHistory.current = [];
    slouchConsecutiveFrames.current = 0;
    startTime.current = new Date();
    sessionId.current = crypto.randomUUID();
    try {
      await startSession({ calibration_id: calibrationId.current, mode: config.mode, sound: config.sound, request_id: sessionId.current });
      running.current = true;
      setStep(3);

      // Konfigurasikan autoPictureInPicture pada video element
      if (pictureInPictureSource()) {
        try {
          pictureInPictureSource().autoPictureInPicture = true;
          pictureInPictureSource().setAttribute("autopictureinpicture", "");
        } catch {}
      }
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 409) {
        fetchActiveSession().then(setActiveSession).catch(() => {});
      }
    }
  };

  const cancelPreviousSession = async () => {
    if (!activeSession || cancellingSession) return;
    setCancellingSession(true);
    try {
      await cancelActiveSession(activeSession.id);
      setActiveSession(null);
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setCancellingSession(false);
    }
  };

  const togglePause = async () => {
    const next = !paused;
    try { await pauseSession(sessionId.current, next); } catch (failure) { setError(failure.message); return; }
    if (!paused) {
      live.current.breaks++;
      setMetrics({ ...live.current });
    }
    setPaused(next);
    slouchConsecutiveFrames.current = 0;
  };

  useEffect(() => {
    publishSnapshot({
      status: step === 3 ? (monitorInterrupted ? "interrupted" : paused ? "paused" : running.current ? "monitoring" : "interrupted") : camera === "active" ? "preparing" : "idle",
      posture, metrics, landmarks: visualFrame.landmarks, color: visualFrame.color,
      message: aiFeedback?.displayTitle || alignmentInfo.feedback || "Kamera aktif",
      mode: config.mode, startedAt: startTime.current?.toISOString() || null,
    });
  }, [step, paused, camera, posture, metrics, visualFrame, aiFeedback, alignmentInfo.feedback, config.mode, monitorInterrupted, publishSnapshot]);

  useEffect(() => {
    registerControls({ togglePause, finish });
    return () => registerControls(null);
  });

  const valid = metrics.upright + metrics.forward + metrics.backward;
  const percent = valid ? Math.round((metrics.upright / valid) * 100) : 0;
  const leave = (path) => {
    closeMonitor();
    navigate(path);
  };

  return (
    <div className="exercise-flow">
      <canvas ref={pipCanvas} className="pip-composite-canvas" aria-hidden="true" />
      <video ref={pipVideo} className="pip-source-video" muted playsInline aria-hidden="true" />
      <div className="exercise-heading"><h2>{steps[step]}</h2></div>
      <ol className="exercise-steps" aria-label="Tahap latihan">
        {steps.map((label, i) => (
          <li
            key={label}
            className={i < step ? "is-complete" : ""}
            aria-current={step === i ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      {error && (
        <div className="exercise-error" role="alert">
          <span>{error}</span>
          {activeSession && <Button onClick={cancelPreviousSession} disabled={cancellingSession}>
            {cancellingSession ? "Membatalkan…" : "Batalkan sesi lama"}
          </Button>}
        </div>
      )}
      {step < 4 && (
        <div className="exercise-layout">
          <div className={`exercise-preview camera-is-${camera} ${cameraFrameId ? `has-camera-frame ${cameraFrameId}` : ''}`}>
            <div className="exercise-camera-surface">
              <video
                ref={video}
                autoPlay
                muted
                playsInline
              />
              <canvas ref={canvas} className="exercise-skeleton-canvas" />
            </div>
            <FrameArtwork frameId={cameraFrameId} userName={user.name} />

            {camera === "active" && step < 3 && countdown === null && (
              <div
                className={`exercise-align-badge ${alignmentInfo.isUpright ? "good" : alignmentInfo.hasPerson ? "warn" : "bad"}`}
              >
                <i aria-hidden="true" />
                <span>
                  {alignmentInfo.feedback ||
                    (alignmentInfo.isUpright
                      ? "Posisi Pas & Tegak! Siap Kalibrasi"
                      : "Posisikan kepala & bahu tegak menghadap layar")}
                </span>
              </div>
            )}

            {step === 3 && reminderNotice && (
              <div className="exercise-posture-reminder" role="alert" aria-live="assertive">
                <strong>Tegakkan kembali posturmu</strong>
                <span>{reminderNotice}</span>
              </div>
            )}

            {camera !== "active" && (
              <div className={`exercise-camera-idle ${camera === "loading" ? "is-loading" : ""}`}>
                <Camera size={26} aria-hidden="true" />
                <strong>{camera === "loading" ? "Membuka kamera…" : "Pratinjau kamera"}</strong>
                <small>{povMode === "full_torso" ? "Ambil gambar dari samping, dari bahu hingga pinggul." : "Posisikan kamera di depan wajah, dengan kedua bahu terlihat."}</small>
              </div>
            )}

            {typeof countdown === "number" && (
              <div className="exercise-countdown" role="status">{countdown}</div>
            )}
          </div>
          <div className="exercise-controls stack" key={step}>
            {step === 0 && (
              <>
                <div className="pov-selector-card">
                  <fieldset className="exercise-angle">
                    <legend>Posisi kamera</legend>
                    <div className="pov-pills">
                      {[["upper_body", "Depan"], ["full_torso", "Samping"]].map(([mode, label]) => (
                        <label key={mode}>
                          <input type="radio" name="exercise-angle" checked={povMode === mode}
                            onChange={() => handlePovChange(mode)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {/* Hanya tampilkan pemilihan kamera webcam jika mode Depan */}
                  {povMode === "upper_body" && availableDevices.length > 0 && (
                    <div className="pov-device-selects">
                      <label>
                        <span>Kamera yang digunakan</span>
                        <select
                          value={primaryDeviceId}
                          disabled={camera === "loading"}
                          onChange={(e) => handleDeviceSelect(e.target.value)}
                        >
                          <option value="">Pilih otomatis</option>
                          {availableDevices.filter(d => d.deviceId).map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                              {d.label || `Kamera ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      {camera === "active" && availableDevices.some(device =>
                        device.deviceId === primaryDeviceId && virtualCamera.test(device.label)
                      ) && <small>Jika gambar hitam, pilih webcam bawaan atau kamera USB.</small>}
                    </div>
                  )}

                  {/* Jika mode Samping dan HP sudah terhubung */}
                  {povMode === "full_torso" && phoneStream && (
                    <div style={{
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 600, fontSize: '13px' }}>
                        <Smartphone size={18} /> Kamera HP Samping Terhubung
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPhoneModalOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284c7',
                          fontSize: '12px',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                        }}
                      >
                        Buka QR Ulang
                      </button>
                    </div>
                  )}
                </div>

                {!backendStatus.online && !backendStatus.checking && (
                  <p className="exercise-warning">Pemantauan belum tersambung. Buka aplikasi pendamping untuk kalibrasi.</p>
                )}

                {/* Sisi Tombol Aksi */}
                {povMode === "full_torso" ? (
                  /* Mode Samping: Jika HP belum terhubung, tombol utamanya langsung Scan QR Code! */
                  !phoneStream ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Button primary onClick={() => setIsPhoneModalOpen(true)}>
                        <Smartphone size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                        Scan QR Code Kamera HP
                      </Button>
                      <small style={{ textAlign: 'center', color: '#64748b' }}>
                        Posisikan HP di samping meja Anda dan scan QR code untuk memulai streaming.
                      </small>
                    </div>
                  ) : (
                    /* HP sudah terhubung: Tampilkan periksa gambar & tombol lanjut */
                    <>
                      <fieldset className="exercise-ready">
                        <legend>Periksa gambar samping</legend>
                        <label><input type="checkbox" checked={checks.light}
                          onChange={e => setChecks({ ...checks, light: e.target.checked })} />Pencahayaan cukup</label>
                        <label><input type="checkbox" checked={checks.shoulders}
                          onChange={e => setChecks({ ...checks, shoulders: e.target.checked })} />
                          Bahu dan pinggul terlihat dari samping
                        </label>
                      </fieldset>
                      <Button primary disabled={!checks.light || !checks.shoulders}
                        onClick={() => setStep(1)}>Lanjut ke kalibrasi</Button>
                    </>
                  )
                ) : (
                  /* Mode Depan (Laptop Webcam Standar) */
                  camera === "active" ? (
                    <>
                      <fieldset className="exercise-ready">
                        <legend>Periksa gambar</legend>
                        <label><input type="checkbox" checked={checks.light}
                          onChange={e => setChecks({ ...checks, light: e.target.checked })} />Wajah terlihat jelas</label>
                        <label><input type="checkbox" checked={checks.shoulders}
                          onChange={e => setChecks({ ...checks, shoulders: e.target.checked })} />
                          Kedua bahu terlihat
                        </label>
                      </fieldset>
                      <Button primary disabled={!checks.light || !checks.shoulders}
                        onClick={() => setStep(1)}>Lanjut ke kalibrasi</Button>
                    </>
                  ) : (
                    <Button primary disabled={camera === "loading"} onClick={() => enableCamera()}>
                      {camera === "loading" ? "Membuka kamera…" : "Aktifkan kamera"}
                    </Button>
                  )
                )}
              </>
            )}
            {step === 1 && (
              <>
                <h3>Temukan postur tegak netralmu</h3>
                <p>
                  {povMode === "full_torso"
                    ? "Duduk tegak wajar dari samping meja, rilekskan punggung, lalu pandang lurus. Warna hijau menandakan postur samping pas."
                    : "Duduk tegak tanpa dibuat-buat, rilekskan bahu, lalu pandang lurus ke layar. Warna hijau berarti posisimu sudah pas."}
                </p>

                {camera === "active" && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: alignmentInfo.isUpright ? "#f0fdf4" : "#fefce8",
                      border: `1px solid ${alignmentInfo.isUpright ? "#86efac" : "#fde047"}`,
                      fontSize: 13,
                    }}
                  >
                    <strong>Kesiapan posisi</strong>
                    <div style={{ marginTop: 4 }}>
                      {alignmentInfo.isUpright ? (
                        <span style={{ color: "#15803d", fontWeight: 700 }}>
                          ✓ Sudah pas. Pertahankan posisi ini sebentar.
                        </span>
                      ) : (
                        <span style={{ color: "#b45309" }}>
                          {alignmentInfo.feedback || "Sesuaikan posisi hingga kerangka berwarna hijau."}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {calibrated ? (
                  <>
                    <strong className="exercise-good">
                      ✓ Posisi acuan tersimpan
                    </strong>
                    <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
                      Mulai sekarang, perubahan posturmu akan dibandingkan dengan posisi nyaman ini.
                    </p>
                    <Button primary onClick={() => setStep(2)}>
                      Atur Sesi Latihan
                    </Button>
                  </>
                ) : (
                  <Button
                    primary
                    disabled={countdown !== null}
                    onClick={startCalibrationProcess}
                  >
                    {countdown
                      ? "Tetap diam sebentar…"
                      : alignmentInfo.isUpright
                        ? "Simpan posisi tegak ini"
                        : "Siapkan posisi tegak"}
                  </Button>
                )}
                <Button
                  disabled={countdown !== null}
                  onClick={() => setStep(0)}
                >
                  Kembali ke persiapan
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <label className="form-field">
                  Mode latihan
                  <select
                    value={config.mode}
                    onChange={(e) =>
                      setConfig({ ...config, mode: e.target.value })
                    }
                  >
                    <option value="work">Duduk Kerja · pengingat lebih tenang</option>
                    <option value="active">Koreksi Aktif · pengingat lebih cepat</option>
                  </select>
                </label>
                <p>
                  Selama latihan, kamera akan membantu mengingatkan saat posisi dudukmu mulai berubah.
                </p>
                <label className="form-field">
                  Kepekaan pengingat
                  <select
                    value={config.sensitivity}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sensitivity: Number(e.target.value),
                      })
                    }
                  >
                    <option value={10}>Peka</option>
                    <option value={15}>Seimbang</option>
                    <option value={20}>Lebih santai</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={config.sound}
                    onChange={(e) =>
                      setConfig({ ...config, sound: e.target.checked })
                    }
                  />{" "}
                  Bunyikan pengingat saat postur berubah
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={autoPipEnabled}
                    onChange={(e) => setAutoPipEnabled(e.target.checked)}
                  />{" "}
                  Buka jendela kamera saat pindah tab
                </label>
                <Button primary onClick={begin}>
                  Mulai Latihan Sekarang
                </Button>
                <Button
                  onClick={() => {
                    setCalibrated(false);
                    calibrationId.current = null;
                    setStep(1);
                  }}
                >
                  Kalibrasi ulang
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <span className="soft-tag">
                  {config.mode === "work" ? "Mode Duduk Kerja" : "Koreksi Aktif"}
                </span>
                <span>Postur tegak berturut-turut</span>
                <strong className="exercise-timer">
                  {clockLabel(metrics.uprightStreak)}
                </strong>
                <small>
                  Latihan berjalan {clockLabel(metrics.total)}
                </small>
                <div className="data-pair">
                  <span>Total waktu tegak</span>
                  <strong>{clockLabel(metrics.upright)}</strong>
                </div>
                <div className="data-pair">
                  <span>Terjaga paling lama</span>
                  <strong>{clockLabel(metrics.longestUpright)}</strong>
                </div>

                {/* AI REALTIME STATUS BADGE */}
                {aiFeedback && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background:
                        aiFeedback.upper_is_arm_activity || aiFeedback.upper_is_head_activity
                          ? "var(--polar)"
                          : aiFeedback.prediction === "tegak"
                            ? "#f0fdf4"
                            : aiFeedback.prediction === "condong_depan"
                              ? "#fef2f2"
                              : "#fffbeb",
                      border: `1.5px solid ${
                        aiFeedback.upper_is_arm_activity || aiFeedback.upper_is_head_activity
                          ? "var(--blue)"
                          : aiFeedback.prediction === "tegak"
                            ? "#86efac"
                            : aiFeedback.prediction === "condong_depan"
                              ? "#fca5a5"
                              : "#fde047"
                      }`,
                      borderRadius: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {aiFeedback.displayTitle ||
                        (aiFeedback.upper_is_arm_activity
                          ? "Sedang meregangkan tangan"
                          : aiFeedback.upper_is_head_activity
                            ? "Badanmu tetap tegak"
                          : aiFeedback.prediction === "tegak"
                            ? "Posturmu sudah pas"
                            : "Punggungmu mulai membungkuk")}
                    </div>
                    {aiFeedback.upper_is_arm_activity ? (
                      <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 4 }}>
                        ✓ Gerakan tangan terdeteksi — tidak dihitung sebagai bungkuk.
                      </div>
                    ) : aiFeedback.upper_is_head_activity ? (
                      <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 4 }}>
                        ✓ Melihat HP atau ke samping tidak dihitung bungkuk selama badan tetap stabil.
                      </div>
                    ) : aiFeedback.z_delta !== undefined ? (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                        {aiFeedback.prediction === "tegak"
                          ? "Pertahankan posisi nyaman ini."
                          : aiFeedback.prediction === "condong_depan"
                            ? "Tarik dagu perlahan ke belakang dan rilekskan bahu."
                            : "Arahkan kembali pandangan sejajar dengan layar."}
                      </div>
                    ) : null}
                  </div>
                )}

                <p
                  role="status"
                  className={
                    posture === "upright"
                      ? "exercise-good"
                      : "exercise-warning"
                  }
                >
                  {paused
                    ? "Sedang jeda — pencatatan postur dihentikan"
                    : posture === "upright"
                      ? "Postur tegak terjaga dengan baik"
                      : posture === "unknown"
                        ? "Tubuh tidak terpantau"
                        : "Punggung condong bungkuk, tegakkan kembali!"}
                </p>
                <strong>
                  {percent}% tegak · {metrics.reminders} pengingat
                </strong>

                {/* Kontrol Pendukung Produktivitas saat Bekerja di Tab / Aplikasi Lain */}
                <div style={{ margin: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <Button
                      onClick={async () => {
                        try {
                          await togglePictureInPicture(pictureInPictureSource(), setIsPipActive);
                        } catch (e) {
                          setError("Layar kecil belum dapat dibuka. Coba lagi setelah kamera aktif.");
                        }
                      }}
                      title="Tampilkan layar video kecil mengambang di atas Word, Figma, atau VS Code"
                    >
                      {isPipActive ? "Tutup layar kecil (PiP)" : "Buka layar kecil (PiP)"}
                    </Button>

                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", background: autoPipEnabled ? "var(--blue)" : "var(--polar)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", color: "var(--ink)" }}>
                      <input
                        type="checkbox"
                        checked={autoPipEnabled}
                        onChange={(e) => setAutoPipEnabled(e.target.checked)}
                        style={{ accentColor: "var(--pink)", cursor: "pointer" }}
                      />
                      <span>Buka otomatis saat pindah tab</span>
                    </label>

                    {isNotificationSupported() && notifPermission !== "granted" && (
                      <button
                        type="button"
                        className="soft-button"
                        style={{
                          fontSize: 12,
                          padding: "6px 12px",
                          background: "var(--polar)",
                          color: "var(--ink)",
                          border: "1px solid var(--line)",
                          cursor: "pointer",
                          borderRadius: 8,
                        }}
                        onClick={async () => {
                          const granted = await requestNotificationPermission();
                          setNotifPermission(granted ? "granted" : "denied");
                        }}
                      >
                        Izinkan notifikasi desktop
                      </button>
                    )}

                    {isNotificationSupported() && notifPermission === "granted" && (
                      <span style={{ color: "var(--ink-secondary)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        Notifikasi desktop aktif
                      </span>
                    )}
                  </div>

                </div>

                <div className="dialog-actions">
                  <Button
                    onClick={async () => {
                      if (autoPipEnabled && pictureInPictureSource() && !document.pictureInPictureElement) {
                        await requestAutoPictureInPicture(pictureInPictureSource(), setIsPipActive);
                      }
                      minimizeMonitor();
                    }}
                  >
                    Perkecil ke Dashboard
                  </Button>
                  <Button onClick={togglePause}>
                    {paused ? "Lanjutkan latihan" : "Ambil Jeda"}
                  </Button>
                  <Button primary onClick={() => setConfirmEnd(true)}>
                    Selesaikan Sesi
                  </Button>
                </div>
                {confirmEnd && (
                  <div className="exercise-confirm">
                    <p>{testMode ? 'Akhiri pengujian? Data uji tidak akan masuk ke riwayat.' : 'Akhiri sesi dan simpan hasil ke riwayat?'}</p>
                    <Button primary onClick={finish}>
                      {testMode ? 'Ya, akhiri pengujian' : 'Ya, simpan hasil'}
                    </Button>
                    <Button onClick={() => setConfirmEnd(false)}>
                      Lanjut berlatih
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {step === 4 && result?.testMode && (
        <div className="exercise-summary stack">
          <span className="soft-tag">MODE UJI ADMIN</span>
          <h3>Pengujian kamera selesai.</h3>
          <p>Deteksi postur, kalibrasi, peringatan bungkuk, dan frame sudah dijalankan melalui alur kamera asli.</p>
          <div className="exercise-summary-grid">
            <div><small>Waktu terbaca</small><strong>{clockLabel(valid)}</strong></div>
            <div><small>Postur tegak</small><strong>{percent}%</strong></div>
            <div><small>Condong depan</small><strong>{clockLabel(metrics.forward)}</strong></div>
            <div><small>Pengingat muncul</small><strong>{metrics.reminders} kali</strong></div>
          </div>
          <div className="exercise-earned"><strong>Data pengujian tidak disimpan</strong><span>Poin, level, pencapaian, dan riwayat admin tidak berubah.</span></div>
          <div className="dialog-actions"><Button primary onClick={() => leave('/app/admin')}>Kembali ke Dashboard Admin</Button></div>
        </div>
      )}
      {step === 4 && result && !result.testMode && (
        <div className="exercise-summary stack">
          <h3>Sesi tersimpan di riwayat</h3>
          <div className="exercise-summary-grid">
            {[
              ["Durasi total", result.session.totalDuration],
              ["Waktu valid", result.session.validDuration],
              ["Postur tegak", `${result.session.uprightPercentage}%`],
              ["Total waktu tegak", clockLabel(result.session.uprightSeconds)],
              ["Tegak berturut-turut terlama", clockLabel(result.session.longestUprightSeconds)],
              ["Pengingat", `${result.session.remindersCount} kali`],
              ["Jeda", result.session.pauseDuration],
              ["Waktu terpantau", `${result.session.coverage}%`],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="exercise-earned">
            <strong>+{result.session.pointsEarned} poin sesi</strong>
            <span>
              {result.previousBalance} → {result.balance} poin tersedia
              {result.bonus > 0 && ` (termasuk +${result.bonus} bonus)`}
            </span>
          </div>
          <p>
            1 poin per menit valid, maksimal 25 poin per sesi.
          </p>
          <div className="data-pair">
            <span>Level {user.level} · poin kumulatif</span>
            <strong>
              {user.totalPointsCumulative} / {user.levelProgressMax}
            </strong>
          </div>
          <Progress
            value={user.totalPointsCumulative}
            max={user.levelProgressMax}
          />
          {!celebrate &&
            (result.challenges.length > 0 || result.badges.length > 0) && (
              <Button primary onClick={() => setCelebrate(true)}>
                Lihat pencapaian baru
              </Button>
            )}
          {celebrate && (
            <section className="exercise-celebration" role="status">
              <h3>Pencapaian baru</h3>
              {result.challenges.map((c) => (
                <p key={c.id}>
                  {c.title} selesai. {c.rewardValue}
                </p>
              ))}
              {result.badges.map((b) => (
                <p key={b.id}>
                  Lencana “{b.title}” terbuka. {b.description}
                </p>
              ))}
            </section>
          )}
          <div className="dialog-actions">
            <Button onClick={() => leave("/app/reward")}>
              Kunjungi Toko Hadiah
            </Button>
            <Button primary onClick={() => leave("/app/dashboard")}>
              Selesai & Kembali ke Dashboard
            </Button>
          </div>
        </div>
      )}
      {step < 4 && testMode && <small>Sesi uji admin tidak menambah poin atau riwayat.</small>}

      <PhoneCameraModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        onStreamConnected={applyPhoneStreamAsActive}
      />
    </div>
  );
}
