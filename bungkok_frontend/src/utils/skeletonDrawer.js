/**
 * Utility untuk menggambar kerangka tulang 3D MediaPipe pada elemen HTMLCanvasElement
 * Dilengkapi dengan:
 * 1. 60 FPS LERP Interpolator (menghilangkan kedat-kedut / patah-patah secara total)
 * 2. Anatomical Limb Guard (menolak tangan orang lain yang lewat di frame/background)
 * 3. Anti-Flicker Persistence (mencegah kedip/hilang seketika saat 1 frame tertunda)
 */

let activeCanvas = null;
let currentLandmarks = null;
let targetLandmarks = null;
let targetVelocities = null;
let currentColor = '#22c55e';
let targetColor = '#22c55e';
let currentAlpha = 0;
let targetAlpha = 0;
let lastUpdateTime = 0;
let animationFrameId = null;

const LERP_FACTOR = 0.30;
const FAST_LERP_FACTOR = 0.52;
const TARGET_DEAD_ZONE = 0.0035;
const FACE_DEAD_ZONE = 0.003;
const VELOCITY_GATE = 0.006;
const MAX_PREDICTION_MS = 70;
const FADE_TIMEOUT_MS = 900; // Mulai memudarkan jika frame kosong > 900ms

function renderLoop() {
  if (!activeCanvas) {
    animationFrameId = null;
    return;
  }

  const ctx = activeCanvas.getContext('2d');
  if (!ctx) {
    animationFrameId = null;
    return;
  }

  const now = performance.now();
  const timeSinceUpdate = now - lastUpdateTime;

  // Jika sudah terlalu lama tidak ada data baru, pudarkan secara bertahap
  if (timeSinceUpdate > FADE_TIMEOUT_MS) {
    targetAlpha = 0;
  }

  // Interpolasi opacity agar tidak kedat-kedut saat frame sempat drop
  currentAlpha += (targetAlpha - currentAlpha) * 0.15;
  if (currentAlpha < 0.01) {
    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    animationFrameId = requestAnimationFrame(renderLoop);
    return;
  }

  // Update warna target
  currentColor = targetColor;

  // LERP posisi setiap sendi kerangka (Interpolasi 60 FPS)
  if (targetLandmarks && targetLandmarks.length > 0) {
    if (!currentLandmarks || currentLandmarks.length !== targetLandmarks.length) {
      currentLandmarks = targetLandmarks.map((pt) => ({ ...pt }));
    } else {
      for (let i = 0; i < targetLandmarks.length; i++) {
        const tgt = targetLandmarks[i];
        const cur = currentLandmarks[i];
        if (!tgt || !cur) continue;

        const velocity = targetVelocities?.[i] || { x: 0, y: 0 };
        const predictionSeconds = Math.min(timeSinceUpdate, MAX_PREDICTION_MS) / 1000;
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

  if (!currentLandmarks || currentLandmarks.length === 0) {
    animationFrameId = requestAnimationFrame(renderLoop);
    return;
  }

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

  // Validasi apakah lengan kiri & kanan adalah milik pengguna asli (bukan tangan orang lain yang lewat)
  const isLeftArmValid = (() => {
    const el = currentLandmarks[13];
    const wr = currentLandmarks[15];
    if (!ls || !el || !wr) return false;
    if ((wr.visibility || 0) < 0.38) return false;
    const dArm = Math.hypot(wr.x - ls.x, wr.y - ls.y);
    return dArm <= maxArmLength;
  })();

  const isRightArmValid = (() => {
    const el = currentLandmarks[14];
    const wr = currentLandmarks[16];
    if (!rs || !el || !wr) return false;
    if ((wr.visibility || 0) < 0.38) return false;
    const dArm = Math.hypot(wr.x - rs.x, wr.y - rs.y);
    return dArm <= maxArmLength;
  })();

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
  animationFrameId = requestAnimationFrame(renderLoop);
}

export function drawSkeletonOnCanvas(canvas, rawLandmarks, statusColor = '#22c55e') {
  if (!canvas) return;
  activeCanvas = canvas;

  if (rawLandmarks && rawLandmarks.length > 0) {
    const now = performance.now();
    const previousTargets = targetLandmarks;
    const elapsedSeconds = Math.max(0.04, Math.min(0.5, (now - lastUpdateTime) / 1000));
    const nextTargets = previousTargets?.length === rawLandmarks.length
      ? rawLandmarks.map((point, index) => {
          const previous = previousTargets[index];
          const deadZone = index <= 10 ? FACE_DEAD_ZONE : TARGET_DEAD_ZONE;
          if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= deadZone) {
            return point;
          }
          return { ...point, x: previous.x, y: previous.y, z: previous.z };
        })
      : rawLandmarks;
    targetVelocities = nextTargets.map((point, index) => {
      const previous = previousTargets?.[index];
      if (!previous) return { x: 0, y: 0 };
      const displacement = Math.hypot(point.x - previous.x, point.y - previous.y);
      const oldVelocity = targetVelocities?.[index] || { x: 0, y: 0 };
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
    targetLandmarks = nextTargets;
    targetColor = statusColor;
    targetAlpha = 1.0;
    lastUpdateTime = now;
  } else {
    // Jangan langsung hapus seketika, tandai target alpha turun perlahan
    targetAlpha = 0.0;
  }

  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(renderLoop);
  }
}

export function clearSkeletonCanvas(canvas) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  activeCanvas = null;
  currentLandmarks = null;
  targetLandmarks = null;
  targetVelocities = null;
  targetAlpha = 0;
  currentAlpha = 0;

  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
