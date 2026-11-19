/**
 * Lightweight Canvas Confetti Generator (Zero external dependencies)
 */
export function fireConfetti(durationMs = 2500) {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#22c55e', '#ff70b5', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
  const particles = [];
  const count = 120;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.4,
      w: Math.random() * 9 + 4,
      h: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.7) * 20,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 12,
      gravity: 0.4,
      opacity: 1,
    });
  }

  let animationFrame;
  const startTime = performance.now();

  function render(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.vRotation;
      p.opacity = Math.max(0, 1 - elapsed / durationMs);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (elapsed < durationMs) {
      animationFrame = requestAnimationFrame(render);
    } else {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  }

  animationFrame = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(animationFrame);
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  };
}
