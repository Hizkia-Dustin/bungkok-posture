import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Smartphone } from "lucide-react";
import PhoneCameraModal from "../camera/PhoneCameraModal";
import { useApp } from "../../context/AppContext";
import { usePostureMonitor } from "../../context/PostureMonitorContext";
import { Button, Progress } from "../common/SoftUI";
import Dialog from "../common/Dialog";
import { activeCameraFrame, FrameArtwork } from "../common/CameraFrame";
import { clockLabel } from "../../utils/exercise";
import { playReminder, primeReminderAudio } from "../../utils/exportData";
import { captureFrameAsBlob } from "../../utils/cameraCapture";
import { startLocalPoseTracker } from "../../utils/localPoseTracker";
import { startPictureInPictureComposer } from "../../utils/pictureInPictureComposer";
import {
  drawSkeletonOnCanvas,
  clearSkeletonCanvas,
  publishPoseFrame,
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
const ENABLE_LOCAL_POSE_TRACKER = true;

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
  const { testMode, closeMonitor, minimizeMonitor, setMonitorStream, publishSnapshot, registerControls } = usePostureMonitor();
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
  const [finishing, setFinishing] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [cancellingSession, setCancellingSession] = useState(false);
  const [reminderNotice, setReminderNotice] = useState("");
  const [visualFrame, setVisualFrame] = useState({ landmarks: [], color: "#22c55e" });
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission);
  const [isPipActive, setIsPipActive] = useState(false);
  // PiP yang dibuka lewat tombol tetap dibiarkan; PiP otomatis ditutup saat kembali ke tab
  const manualPip = useRef(false);
  useEffect(() => {
    if (!isPipActive) manualPip.current = false;
  }, [isPipActive]);
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
        setError("");
        alignmentHistory.current = [];
        setAlignmentInfo({ isUpright: false, feedback: "Memeriksa posisi duduk…", hasPerson: false });
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
        // Tab kembali aktif dilihat pengguna. PiP otomatis biasanya ditutup browser sendiri;
        // menutupnya paksa bisa dianggap penolakan sehingga auto-PiP berikutnya tidak muncul.
        // Jadi hanya tutup sebagai cadangan jika browser tidak menutupnya.
        resetTabTitle();
        window.setTimeout(() => {
          if (!document.hidden && document.pictureInPictureElement && !manualPip.current) {
            document.exitPictureInPicture().catch(() => {});
          }
        }, 600);
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
  // true selama worker MediaPipe lokal hidup; landmark server (telat karena jaringan) tidak digambar
  const localTrackerActive = useRef(false);
  const localLandmarks = useRef([]);
  const localVisualColor = useRef("#22c55e");
  const lastLocalSnapshot = useRef(0);
  const lastLocalLandmarksAt = useRef(0);
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
  const hasFreshLocalLandmarks = () => (
    localTrackingReady.current
    && localLandmarks.current.length > 0
    && performance.now() - lastLocalLandmarksAt.current < 1000
  );
  // Gambar ke canvas monitor (juga sumber PiP) dan siarkan ke kamera dashboard
  const drawPose = (landmarks, color) => {
    drawSkeletonOnCanvas(canvas.current, landmarks, color, povMode);
    publishPoseFrame(landmarks, color, povMode);
  };
  const updateVisualFrame = (serverLandmarks, color) => {
    localVisualColor.current = color;
    const landmarks = hasFreshLocalLandmarks()
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
  const sideAlignmentUpright = useRef(null);
  const slouchConsecutiveFrames = useRef(0);
  const slouchWarningActive = useRef(false);
  const reminderTimer = useRef(null);
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

  const lastReminderSoundAt = useRef(0);
  // Suara pengingat yang sama (ucapan/nada dari admin) untuk tab aktif maupun saat PiP / tab lain,
  // dibatasi tiap 6 detik agar tidak terpotong-potong saat bungkuk terdeteksi berturut-turut.
  const sound = () => {
    const now = Date.now();
    if (now - lastReminderSoundAt.current < 6000) return;
    lastReminderSoundAt.current = now;
    playReminder(user.reminderVolume, appConfig.reminder).catch(() => {
      if (alive.current)
        setError("Suara tidak tersedia; pengingat visual tetap aktif.");
    });
  };

  // Banner "Tegakkan kembali posturmu" langsung hilang begitu postur pulih,
  // agar tidak bertentangan dengan kartu status yang sudah tegak.
  const clearPostureReminder = () => {
    clearTimeout(reminderTimer.current);
    setReminderNotice("");
  };

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
        if (!cancelled) localTrackerActive.current = true;
      },
      onLandmarks: (landmarks) => {
        // Tetap menggambar saat monitor diperkecil agar PiP & kamera dashboard tidak membeku
        if (cancelled) return;
        // Frame kosong sesaat diabaikan; skeletonDrawer memudar sendiri jika pose hilang > 900ms
        if (!landmarks.length) return;

        localTrackingReady.current = true;
        localLandmarks.current = landmarks;
        lastLocalLandmarksAt.current = performance.now();
        drawPose(landmarks, localVisualColor.current);

        const now = performance.now();
        if (landmarks.length && now - lastLocalSnapshot.current >= 350) {
          lastLocalSnapshot.current = now;
          setVisualFrame({ landmarks, color: localVisualColor.current });
        }
      },
      onError: (failure) => {
        localTrackerActive.current = false;
        localTrackingReady.current = false;
        console.warn("[pose] Pelacak lokal berhenti, overlay memakai landmark server.", failure);
      },
    }).then((stop) => {
      if (cancelled) stop();
      else stopTracker = stop;
    }).catch((failure) => {
      localTrackerActive.current = false;
      localTrackingReady.current = false;
      console.warn("[pose] Pelacak lokal gagal dimuat, overlay memakai landmark server.", failure);
    });

    return () => {
      cancelled = true;
      localTrackerActive.current = false;
      localTrackingReady.current = false;
      localLandmarks.current = [];
      stopTracker?.();
    };
  }, [camera, povMode]);

  useEffect(() => {
    if (camera !== "active") return;

    let isSubscribed = true;
    sideAlignmentUpright.current = null;
    alignmentHistory.current = [];
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
        const blob = await captureFrameAsBlob(captureSource, 320, 0.68);

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
              clearPostureReminder();
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (res.upper_is_head_activity) {
              boneColor = "#0ea5e9";
              statusTitle = "Badanmu tetap tegak";
              slouchConsecutiveFrames.current = 0;
              setPosture("upright");
              slouchWarningActive.current = false;
              clearPostureReminder();
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (pred === "tegak") {
              boneColor = "#22c55e"; // Hijau
              statusTitle = "Posturmu sudah pas";
              slouchConsecutiveFrames.current = 0;
              setPosture("upright");
              slouchWarningActive.current = false;
              clearPostureReminder();
              if (document.hidden) updateBackgroundTabTitle("upright");
            } else if (pred === "condong_depan" || pred === "condong_belakang") {
              slouchConsecutiveFrames.current++;
              if (pred === "condong_depan") {
                boneColor = "#ef4444"; // Merah
                statusTitle =
                  res.side_reason === "head_forward" || (res.cervical_angle_deg && res.cervical_angle_deg > 16.0)
                    ? "Kepalamu mulai terlalu maju"
                    : "Punggungmu mulai membungkuk";
                setPosture("forward");
              } else {
                boneColor = "#f59e0b"; // Kuning
                statusTitle = "Posisimu terlalu bersandar";
                setPosture("backward");
              }

              // Pemicu Pengingat Postur (Baik di Tab Aktif maupun di Background Tab Lain)
              // Pengguna dianggap tidak melihat halaman jika tab tersembunyi, sedang memakai PiP,
              // atau jendela browser tidak fokus (mis. sedang bekerja di aplikasi lain).
              const userAway = document.hidden || Boolean(document.pictureInPictureElement) || !document.hasFocus();
              if (userAway) {
                const notifyTitle = pred === "condong_depan" ? "Badan kamu bungkuk" : "Posisimu terlalu bersandar";
                const notifyBody = statusTitle + ". Tegakkan badan perlahan agar tetap nyaman.";
                sendDesktopPostureNotification(notifyTitle, notifyBody);
                window.bungkokDesktop?.notify?.({ title: notifyTitle, message: notifyBody });
                if (settings.current.config.sound) sound();
              }
              if (document.hidden) {
                updateBackgroundTabTitle("slouch");
              } else if (!slouchWarningActive.current) {
                // Tab terlihat: tampilkan juga pengingat di halaman
                showPostureReminder();
              }
              slouchWarningActive.current = true;
            }

            res.displayTitle = statusTitle;
            updateVisualFrame(res.landmarks, boneColor);
            if (!localTrackerActive.current) drawPose(res.landmarks, boneColor);
          } else {
            updateVisualFrame(res.landmarks, "#ef4444");
            if (!localTrackerActive.current) drawPose(res.landmarks || [], "#ef4444");
          }
        }
        // KASUS B: Tahap Persiapan & Kalibrasi (Step 0, 1, 2)
        else {
          const activeMode = povMode === "full_torso" ? "full_torso" : "upper_body";
          const res = await detectPose(blob, activeMode);
          if (!isSubscribed) return;

          if (res.status === "ok") {
            let ready = !!res.is_upright;
            if (activeMode === "full_torso" && res.side_alignment_available && Number.isFinite(res.side_torso_lean_deg)) {
              const limit = sideAlignmentUpright.current === null ? 15 : sideAlignmentUpright.current ? 18 : 12;
              ready = res.side_torso_lean_deg <= limit;
              sideAlignmentUpright.current = ready;
            } else {
              sideAlignmentUpright.current = null;
            }
            alignmentHistory.current.push({
              isUpright: ready,
              feedback: activeMode === "full_torso"
                ? (ready ? "Posisi siap. Pertahankan duduk nyaman untuk kalibrasi." : "Duduk lebih tegak dan pastikan kamera sejajar, lalu coba lagi.")
                : res.alignment_feedback,
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
            if (!localTrackerActive.current) drawPose(res.landmarks, boneColor);
            setAlignmentInfo({
              isUpright,
              feedback:
                stableFeedback || res.alignment_feedback ||
                (isUpright ? "Posisi pas & tegak! Siap kalibrasi." : "Sejajarkan bahu dan tegakkan leher Anda."),
              hasPerson: true,
            });
          } else {
            sideAlignmentUpright.current = null;
            alignmentHistory.current = [];
            updateVisualFrame(res.landmarks, "#ef4444");
            if (!localTrackerActive.current) drawPose(res.landmarks || [], "#ef4444");
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
      worker.postMessage({ command: "start", interval: 250 });
    } catch {
      // Fallback timer jika browser membatasi web worker
      fallbackInterval = setInterval(processFrame, 250);
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
    setFinishing(true);
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
    } finally {
      setFinishing(false);
    }
    setStep(4);
    setConfirmEnd(false);
    stopCamera();

  };

  useEffect(() => {
    if (!closeRequest) return;
    // Klik area gelap / Esc saat latihan = perkecil ke dashboard (sesi tetap berjalan)
    closeRequest.current = () => (step === 3 ? minimizeMonitor() : closeMonitor());
    return () => {
      closeRequest.current = null;
    };
  }, [step, closeRequest, closeMonitor, minimizeMonitor]);

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
    primeReminderAudio();
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
      mode: config.mode, cameraMode: povMode, startedAt: startTime.current?.toISOString() || null,
    });
  }, [step, paused, camera, posture, metrics, visualFrame, aiFeedback, alignmentInfo.feedback, config.mode, povMode, monitorInterrupted, publishSnapshot]);

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
                {(() => {
                  // Satu status gabungan: jeda > aktivitas tangan/kepala > prediksi AI > status lokal
                  const activity = aiFeedback?.upper_is_arm_activity || aiFeedback?.upper_is_head_activity;
                  const tone = paused ? "paused"
                    : activity ? "info"
                    : posture === "upright" ? "good"
                    : posture === "unknown" ? "info"
                    : posture === "forward" ? "bad" : "warn";
                  const title = paused ? "Latihan dijeda"
                    : aiFeedback?.displayTitle
                      || (aiFeedback?.upper_is_arm_activity ? "Sedang meregangkan tangan"
                        : aiFeedback?.upper_is_head_activity ? "Badanmu tetap tegak"
                        : posture === "upright" ? "Posturmu sudah pas"
                        : posture === "unknown" ? "Tubuh belum terpantau"
                        : posture === "forward" ? "Punggungmu mulai membungkuk"
                        : "Posisimu terlalu bersandar");
                  const tip = paused ? "Pencatatan postur berhenti sampai kamu melanjutkan."
                    : aiFeedback?.upper_is_arm_activity ? "Gerakan tangan tidak dihitung sebagai bungkuk."
                    : aiFeedback?.upper_is_head_activity ? "Melihat HP atau ke samping tidak dihitung bungkuk selama badan stabil."
                    : posture === "upright" ? "Pertahankan posisi nyaman ini."
                    : posture === "unknown" ? "Pastikan kepala dan kedua bahu terlihat di kamera."
                    : posture === "forward" ? "Tarik dagu perlahan ke belakang dan rilekskan bahu."
                    : "Duduk sedikit lebih maju dan sejajarkan pandangan dengan layar.";
                  return <>
                    <div className="exercise-live-head">
                      <span className="soft-tag">{config.mode === "work" ? "Mode Duduk Kerja" : "Koreksi Aktif"}</span>
                      <small>Sesi berjalan <strong>{clockLabel(metrics.total)}</strong></small>
                    </div>

                    <div className="exercise-live-hero">
                      <span>Tegak berturut-turut</span>
                      <strong className="exercise-timer">{clockLabel(metrics.uprightStreak)}</strong>
                    </div>

                    <div className={"exercise-live-status is-" + tone} role="status" aria-live="polite">
                      <strong>{title}</strong>
                      <small>{tip}</small>
                    </div>

                    <dl className="exercise-live-stats">
                      <div><dt>Total tegak</dt><dd>{clockLabel(metrics.upright)}</dd></div>
                      <div><dt>Terlama</dt><dd>{clockLabel(metrics.longestUpright)}</dd></div>
                      <div><dt>Persentase</dt><dd>{percent}%</dd></div>
                      <div><dt>Pengingat</dt><dd>{metrics.reminders}</dd></div>
                    </dl>
                  </>;
                })()}

                {/* Kontrol saat bekerja di tab / aplikasi lain */}
                <div className="exercise-live-away" role="group" aria-label="Saat meninggalkan tab">
                  <span>Saat meninggalkan tab</span>
                  <div>
                    <Button
                      onClick={async () => {
                        try {
                          const opened = await togglePictureInPicture(pictureInPictureSource(), setIsPipActive);
                          manualPip.current = Boolean(opened);
                        } catch (e) {
                          setError("Layar kecil belum dapat dibuka. Coba lagi setelah kamera aktif.");
                        }
                      }}
                      title="Tampilkan layar video kecil mengambang di atas Word, Figma, atau VS Code"
                    >
                      {isPipActive ? "Tutup layar kecil" : "Buka layar kecil"}
                    </Button>
                    <label>
                      <input
                        type="checkbox"
                        checked={autoPipEnabled}
                        onChange={(e) => setAutoPipEnabled(e.target.checked)}
                      />
                      <span>Layar kecil otomatis</span>
                    </label>
                    {isNotificationSupported() && (notifPermission === "granted"
                      ? <small className="exercise-live-note">Notifikasi desktop aktif</small>
                      : <Button
                          onClick={async () => {
                            const granted = await requestNotificationPermission();
                            setNotifPermission(granted ? "granted" : "denied");
                          }}
                        >
                          Izinkan notifikasi
                        </Button>)}
                  </div>
                </div>

                <div className="dialog-actions exercise-live-actions">
                  <Button onClick={minimizeMonitor}>Perkecil</Button>
                  <Button onClick={togglePause}>
                    {paused ? "Lanjutkan" : "Ambil jeda"}
                  </Button>
                  <Button primary onClick={() => setConfirmEnd(true)}>
                    Selesaikan sesi
                  </Button>
                </div>
                {confirmEnd && (
                  <Dialog
                    title={testMode ? "Konfirmasi akhiri pengujian" : "Konfirmasi simpan sesi"}
                    className="exercise-confirm-dialog"
                    onClose={() => !finishing && setConfirmEnd(false)}
                  >
                    <h2>{testMode ? "Akhiri pengujian?" : "Simpan hasil latihan?"}</h2>
                    <p>
                      {testMode
                        ? "Data uji tidak akan masuk ke riwayat."
                        : `Sesi ${clockLabel(live.current.total)} akan diakhiri dan hasilnya disimpan ke riwayat. Sesi yang sudah disimpan tidak bisa dilanjutkan.`}
                    </p>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="dialog-actions">
                      <Button primary disabled={finishing} onClick={finish}>
                        {finishing ? "Menyimpan…" : testMode ? "Ya, akhiri pengujian" : "Ya, simpan hasil"}
                      </Button>
                      <Button disabled={finishing} onClick={() => setConfirmEnd(false)}>
                        Lanjut berlatih
                      </Button>
                    </div>
                  </Dialog>
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
