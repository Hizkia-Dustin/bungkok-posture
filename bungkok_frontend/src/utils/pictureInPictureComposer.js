const SADAR_PATH = 'M324.541 70.1873C324.541 31.4239 295.945 0 260.67 0H137.668C61.636 0 0 67.7314 0 151.282V219.929C0 265.567 33.6675 302.564 75.1985 302.564C116.729 302.564 150.397 339.561 150.397 385.2V414.367C150.397 460.005 116.729 497.002 75.1985 497.002C33.6675 497.002 0 533.999 0 579.637V653.501C0 739.933 63.7614 810 142.415 810H258.607C301.032 810 335.425 772.206 335.425 725.585C335.425 678.965 369.817 641.171 412.243 641.171H619.757C662.183 641.171 696.575 678.965 696.575 725.585C696.575 772.206 730.968 810 773.393 810H889.585C968.239 810 1032 739.933 1032 653.501V585.074C1032 536.433 996.118 497.002 951.854 497.002C907.591 497.002 871.709 457.571 871.709 408.931V401.069C871.709 352.429 907.591 312.998 951.854 312.998C996.118 312.998 1032 273.567 1032 224.926V156.499C1032 70.0669 968.239 0 889.585 0H760.446C725.171 0 696.575 31.4239 696.575 70.1873C696.575 108.951 667.979 140.375 632.704 140.375H388.412C353.137 140.375 324.541 108.951 324.541 70.1873Z';
const TURNS_PATH = 'M403 98C403 125.614 425.386 148 453 148H934C961.614 148 984 170.386 984 198V807.5C984 835.114 961.614 857.5 934 857.5H50C22.3858 857.5 0 835.114 0 807.5V50C0 22.3858 22.3858 0 50 0H353C380.614 0 403 22.3858 403 50V98Z';

export function pictureInPictureLayout(frameId) {
  if (frameId === 'frame-sadar') return { width: 480, height: 600, background: '#b3b1be', x: 10.6, y: 169.2, videoWidth: 458.8, videoHeight: 360, path: SADAR_PATH, pathWidth: 1032, pathHeight: 810 };
  if (frameId === 'frame-turns-on') return { width: 480, height: 600, background: '#e4e0f3', x: 21.4, y: 137.4, videoWidth: 437.2, videoHeight: 381.6, path: TURNS_PATH, pathWidth: 984, pathHeight: 857.5 };
  return { width: 640, height: 480, background: '#122434', x: 0, y: 0, videoWidth: 640, videoHeight: 480 };
}

function drawCover(context, source, width, height) {
  const sourceWidth = source.videoWidth || source.width || width;
  const sourceHeight = source.videoHeight || source.height || height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0; let sy = 0; let sw = sourceWidth; let sh = sourceHeight;
  if (sourceRatio > targetRatio) { sw = sourceHeight * targetRatio; sx = (sourceWidth - sw) / 2; }
  else if (sourceRatio < targetRatio) { sh = sourceWidth / targetRatio; sy = (sourceHeight - sh) / 2; }
  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

function drawCameraLayer(context, source, layout) {
  if (!source) return;
  context.save();
  context.translate(layout.x, layout.y);
  context.scale(layout.videoWidth / (layout.pathWidth || layout.videoWidth), layout.videoHeight / (layout.pathHeight || layout.videoHeight));
  if (layout.path && typeof Path2D !== 'undefined') context.clip(new Path2D(layout.path));
  const width = layout.pathWidth || layout.videoWidth;
  const height = layout.pathHeight || layout.videoHeight;
  context.translate(width, 0);
  context.scale(-1, 1);
  drawCover(context, source, width, height);
  context.restore();
}

function drawDots(context, y, width) {
  context.fillStyle = '#050505';
  for (let x = 12; x < width - 10; x += 11) { context.beginPath(); context.arc(x, y, 1.4, 0, Math.PI * 2); context.fill(); }
}

function drawFrame(context, frameId, userName, width, height) {
  if (frameId === 'frame-sadar') {
    context.fillStyle = '#050505';
    context.font = '900 43px Arial Black, Arial, sans-serif';
    context.fillText('DUDUK', 11, 78);
    context.textAlign = 'right'; context.fillText('LEBIH SADAR', width - 11, 121); context.textAlign = 'left';
    context.font = '8px monospace'; context.textAlign = 'center'; context.fillText('SESI POSTUR', width / 2, 154); context.textAlign = 'left';
    drawDots(context, 25, width); drawDots(context, height - 28, width);
  }
  if (frameId === 'frame-turns-on') {
    context.fillStyle = '#5c3e98'; context.font = '600 11px Arial, sans-serif';
    context.fillText('BUNGKOK', 22, 30); context.textAlign = 'right'; context.fillText('DUDUK', width - 22, 27); context.fillText('LEBIH SADAR', width - 22, 40);
    context.textAlign = 'left'; context.font = '800 38px Arial, sans-serif'; context.fillText(`(${(userName || 'USER').split(' ')[0].toUpperCase()})`, 22, 95);
    context.textAlign = 'right'; context.fillText('Turns On!', width - 22, 95); context.textAlign = 'left';
  }
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}

function drawStatus(context, state, layout) {
  const posture = state.paused ? 'paused' : state.posture;
  const labels = { upright: 'Postur tegak', forward: 'Tegakkan tubuhmu', backward: 'Atur posisi dudukmu', paused: 'Pemantauan dijeda', unknown: 'Membaca postur…' };
  const colors = { upright: '#159a61', forward: '#d6455d', backward: '#e39813', paused: '#63788a', unknown: '#63788a' };
  const label = labels[posture] || labels.unknown;
  context.font = '700 15px Arial, sans-serif';
  const pillWidth = Math.min(layout.videoWidth - 24, Math.max(138, context.measureText(label).width + 36));
  const x = layout.x + 12; const y = layout.y + layout.videoHeight - 48;
  context.fillStyle = colors[posture] || colors.unknown; roundedRect(context, x, y, pillWidth, 34, 17);
  context.fillStyle = '#fff'; context.fillText(label, x + 18, y + 22);
}

export function startPictureInPictureComposer({ sourceVideo, skeletonCanvas, targetCanvas, targetVideo, frameId, userName, getState }) {
  if (!sourceVideo || !targetCanvas || !targetVideo || typeof targetCanvas.captureStream !== 'function') return null;
  const layout = pictureInPictureLayout(frameId);
  targetCanvas.width = layout.width; targetCanvas.height = layout.height;
  const context = targetCanvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const outputStream = targetCanvas.captureStream(30);
  targetVideo.srcObject = outputStream; targetVideo.muted = true; targetVideo.play().catch(() => {});
  let animationFrame;
  let videoFrameCallback;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    if (typeof sourceVideo.requestVideoFrameCallback === 'function') videoFrameCallback = sourceVideo.requestVideoFrameCallback(render);
    else animationFrame = requestAnimationFrame(render);
  };
  const render = () => {
    context.fillStyle = layout.background; context.fillRect(0, 0, layout.width, layout.height);
    if (sourceVideo.readyState >= 2) drawCameraLayer(context, sourceVideo, layout);
    if (skeletonCanvas?.width) drawCameraLayer(context, skeletonCanvas, layout);
    drawFrame(context, frameId, userName, layout.width, layout.height);
    drawStatus(context, getState?.() || {}, layout);
    schedule();
  };
  render();
  return () => {
    stopped = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (videoFrameCallback && typeof sourceVideo.cancelVideoFrameCallback === 'function') sourceVideo.cancelVideoFrameCallback(videoFrameCallback);
    outputStream.getTracks().forEach((track) => track.stop());
    targetVideo.pause(); targetVideo.srcObject = null;
  };
}
