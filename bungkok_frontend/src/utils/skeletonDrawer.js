/**
 * Utility untuk menggambar kerangka tulang 3D MediaPipe pada elemen HTMLCanvasElement
 * Dilengkapi dengan:
 * 1. 60 FPS LERP Interpolator (menghilangkan kedat-kedut / patah-patah secara total)
 * 2. Anatomical Limb Guard (menolak tangan orang lain yang lewat di frame/background)
 * 3. Anti-Flicker Persistence (mencegah kedip/hilang seketika saat 1 frame tertunda)
 */

// State per canvas: modal latihan, kartu dashboard, dan PiP bisa menggambar bersamaan
// tanpa saling merebut satu-satunya canvas aktif (penyebab skeleton membeku).
const canvasStates = new Map();
let animationFrameId = null;
const poseListeners = new Set();

function createState() {
  return {
    currentLandmarks: null,
    targetLandmarks: null,
    targetVelocities: null,
    currentColor: '#22c55e',
    targetColor: '#22c55e',
    currentAlpha: 0,
    targetAlpha: 0,
    lastUpdateTime: 0,
    sideView: false,
  };
}

const LERP_FACTOR = 0.30;
const FAST_LERP_FACTOR = 0.52;
const TARGET_DEAD_ZONE = 0.0035;
const FACE_DEAD_ZONE = 0.003;
const VELOCITY_GATE = 0.006;
const MAX_PREDICTION_MS = 120;
const FADE_TIMEOUT_MS = 900; // Mulai memudarkan jika frame kosong > 900ms

function renderLoop() {
  for (const [canvas, state] of canvasStates) {
    if (!canvas.isConnected) {
      canvasStates.delete(canvas);
      continue;
    }
    renderCanvas(canvas, state);
  }
  animationFrameId = canvasStates.size ? requestAnimationFrame(renderLoop) : null;
}

function renderCanvas(activeCanvas, state) {
  const ctx = activeCanvas.getContext('2d');
  if (!ctx) return;
  let { currentLandmarks, currentColor, currentAlpha } = state;
  const { targetLandmarks, targetVelocities, targetColor, lastUpdateTime, sideView } = state;

  const now = performance.now();
  const timeSinceUpdate = now - lastUpdateTime;

  // Jika sudah terlalu lama tidak ada data baru, pudarkan secara bertahap
  if (timeSinceUpdate > FADE_TIMEOUT_MS) {
    state.targetAlpha = 0;
  }

  // Interpolasi opacity agar tidak kedat-kedut saat frame sempat drop
  currentAlpha += (state.targetAlpha - currentAlpha) * 0.15;
  state.currentAlpha = currentAlpha;
  if (currentAlpha < 0.01) {
    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    return;
  }

  // Update warna target
  currentColor = targetColor;
  state.currentColor = currentColor;

  // LERP posisi setiap sendi kerangka (Interpolasi 60 FPS)
  if (targetLandmarks && targetLandmarks.length > 0) {
    if (!currentLandmarks || currentLandmarks.length !== targetLandmarks.length) {
      currentLandmarks = targetLandmarks.map((pt) => ({ ...pt }));
      state.currentLandmarks = currentLandmarks;
    } else {
      for (let i = 0; i < targetLandmarks.length; i++) {
        const tgt = targetLandmarks[i];
        const cur = currentLandmarks[i];
        if (!tgt || !cur) continue;

        const velocity = targetVelocities?.[i] || { x: 0, y: 0 };
        const predictionSeconds = sideView ? 0 : Math.min(timeSinceUpdate, MAX_PREDICTION_MS) / 1000;
        const predictedX = Math.min(1, Math.max(0, tgt.x + velocity.x * predictionSeconds));
        const predictedY = Math.min(1, Math.max(0, tgt.y + velocity.y * predictionSeconds));

        // Cegah lonjakan ekstrim (outlier clamping)
        let dx = predictedX - cur.x;
        let dy = predictedY - cur.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.25) {
          dx = (dx / dist) * 0.25;
          dy = (dy / dist) * 0.25;
        }

        const isFace = i <= 10;
        const factor = isFace ? (dist > 0.025 ? 0.68 : 0.48) : (dist > 0.045 ? FAST_LERP_FACTOR : LERP_FACTOR);
        cur.x += dx * factor;
        cur.y += dy * factor;
        cur.visibility = (cur.visibility || 0) * (1 - factor) + (tgt.visibility || 0) * factor;
      }
    }
  }

  const w = activeCanvas.width;
  const h = activeCanvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!currentLandmarks || currentLandmarks.length === 0) return;

  ctx.save();
  ctx.globalAlpha = currentAlpha;

  // Hitung lebar bahu untuk anatomical guard lengan
  const ls = currentLandmarks[11];
  const rs = currentLandmarks[12];
  let shoulderWidth = 0.25;
  if (ls && rs) {
    shoulderWidth = Math.max(0.12, Math.hypot(rs.x - ls.x, rs.y - ls.y));
  }
  const maxArmLength = shoulderWidth * 1.30;

  // Validasi apakah lengan adalah milik pengguna asli (bukan tangan orang lain yang lewat).
  // Aturan sama dengan backend (_arm_state): siku terlihat, panjang segmen sebanding
  // lebar bahu, dan siku tetap di sisi bahunya sendiri.
  const isArmValid = (sh, el, wr, opp) => {
    if (!sh || !el || !wr || !opp) return false;
    if ((wr.visibility || 0) < 0.38 || (el.visibility || 0) < 0.45) return false;
    if (Math.hypot(wr.x - sh.x, wr.y - sh.y) > maxArmLength) return false;
    const upperArm = Math.hypot(el.x - sh.x, el.y - sh.y);
    const forearm = Math.hypot(wr.x - el.x, wr.y - el.y);
    if (upperArm < shoulderWidth * 0.30 || upperArm > shoulderWidth * 1.10) return false;
    if (forearm < shoulderWidth * 0.25 || forearm > shoulderWidth * 1.10) return false;
    const ratio = forearm / upperArm;
    if (ratio < 0.45 || ratio > 1.8) return false;
    const ownSide = sh.x >= opp.x ? 1 : -1;
    return (el.x - (sh.x + opp.x) / 2) * ownSide >= -0.25 * shoulderWidth;
  };
  const isLeftArmValid = isArmValid(ls, currentLandmarks[13], currentLandmarks[15], rs);
  const isRightArmValid = isArmValid(rs, currentLandmarks[14], currentLandmarks[16], ls);

  function line(i, j, width = 4) {
    const a = currentLandmarks[i];
    const b = currentLandmarks[j];
    if (!a || !b) return;
    if ((a.visibility || 0) < 0.30 || (b.visibility || 0) < 0.30) return;

    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 1. Wajah
  line(0, 1, 3); line(1, 2, 3); line(2, 3, 3); line(3, 7, 3);
  line(0, 4, 3); line(4, 5, 3); line(5, 6, 3); line(6, 8, 3);

  // 2. Bahu kiri ke kanan
  line(11, 12, 5);

  // 3. Vektor Leher (Cervical Spine: Midpoint Bahu ke Hidung)
  const nose = currentLandmarks[0];
  if (ls && rs && nose && (nose.visibility || 0) > 0.35) {
    const mx = ((ls.x + rs.x) / 2) * w;
    const my = ((ls.y + rs.y) / 2) * h;
    ctx.beginPath();
    ctx.moveTo(nose.x * w, nose.y * h);
    ctx.lineTo(mx, my);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 4. Lengan (HANYA digambar jika terbukti lengan pengguna, bukan orang lain di background)
  if (isLeftArmValid) {
    line(11, 13, 4);
    line(13, 15, 4);
  }
  if (isRightArmValid) {
    line(12, 14, 4);
    line(14, 16, 4);
  }

  // 5. Torso / Pinggul jika ada
  if (currentLandmarks[23] && currentLandmarks[24] && (currentLandmarks[23].visibility || 0) > 0.35) {
    line(11, 23, 4);
    line(12, 24, 4);
    line(23, 24, 4);
  }

  // 6. Titik-titik sendi (Joint Dots)
  const activeJoints = [0, 7, 8, 11, 12];
  if (isLeftArmValid) activeJoints.push(13, 15);
  if (isRightArmValid) activeJoints.push(14, 16);
  if (currentLandmarks[23] && currentLandmarks[24] && (currentLandmarks[23].visibility || 0) > 0.35) {
    activeJoints.push(23, 24);
  }

  for (const idx of activeJoints) {
    const pt = currentLandmarks[idx];
    if (!pt || (pt.visibility || 0) < 0.30) continue;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = currentColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.restore();
}

export function drawSkeletonOnCanvas(canvas, rawLandmarks, statusColor = '#22c55e', cameraMode = 'upper_body') {
  if (!canvas) return;
  let state = canvasStates.get(canvas);
  if (!state) {
    state = createState();
    canvasStates.set(canvas, state);
  }
  state.sideView = cameraMode === 'full_torso';
  const { sideView, lastUpdateTime } = state;

  if (rawLandmarks && rawLandmarks.length > 0) {
    const now = performance.now();
    const previousTargets = state.targetLandmarks;
    const elapsedSeconds = Math.max(0.04, Math.min(0.5, (now - lastUpdateTime) / 1000));
    const nextTargets = previousTargets?.length === rawLandmarks.length
      ? rawLandmarks.map((point, index) => {
          const previous = previousTargets[index];
          const deadZone = sideView ? 0.005 : index <= 10 ? FACE_DEAD_ZONE : TARGET_DEAD_ZONE;
          if (sideView && previous) {
            const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
            if (distance < deadZone) return { ...point, x: previous.x, y: previous.y, z: previous.z };
            const alpha = distance > 0.04 ? 0.85 : 0.55;
            return { ...point, x: previous.x + (point.x - previous.x) * alpha,
              y: previous.y + (point.y - previous.y) * alpha };
          }
          if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= deadZone) {
            return point;
          }
          return { ...point, x: previous.x, y: previous.y, z: previous.z };
        })
      : rawLandmarks;
    state.targetVelocities = nextTargets.map((point, index) => {
      const previous = previousTargets?.[index];
      if (!previous) return { x: 0, y: 0 };
      const displacement = Math.hypot(point.x - previous.x, point.y - previous.y);
      const oldVelocity = state.targetVelocities?.[index] || { x: 0, y: 0 };
      if (displacement < VELOCITY_GATE) {
        return { x: oldVelocity.x * 0.15, y: oldVelocity.y * 0.15 };
      }
      let x = (point.x - previous.x) / elapsedSeconds;
      let y = (point.y - previous.y) / elapsedSeconds;
      const speed = Math.hypot(x, y);
      if (speed > 1.2) {
        x = (x / speed) * 1.2;
        y = (y / speed) * 1.2;
      }
      return { x: oldVelocity.x * 0.4 + x * 0.6, y: oldVelocity.y * 0.4 + y * 0.6 };
    });
    state.targetLandmarks = nextTargets;
    state.targetColor = statusColor;
    state.targetAlpha = 1.0;
    state.lastUpdateTime = now;
  } else {
    // Jangan langsung hapus seketika, tandai target alpha turun perlahan
    state.targetAlpha = 0.0;
  }

  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(renderLoop);
  }
}

export function clearSkeletonCanvas(canvas) {
  if (!canvas) return;
  canvasStates.delete(canvas);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!canvasStates.size && animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Siaran frame pose terbaru (dari pelacak lokal/server) untuk tampilan lain, mis. kamera dashboard
export function publishPoseFrame(landmarks, color, cameraMode) {
  for (const listener of poseListeners) listener(landmarks, color, cameraMode);
}

export function subscribePoseFrames(listener) {
  poseListeners.add(listener);
  return () => poseListeners.delete(listener);
}
