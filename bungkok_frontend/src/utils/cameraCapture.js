/**
 * Mengambil snapshot frame dari elemen HTMLVideoElement menjadi Blob JPEG secara cepat
 * Menggunakan reusable offscreen canvas untuk mencegah overhead garbage collection
 */

let offscreenCanvas = null;
let offscreenCtx = null;

export function captureFrameAsBlob(videoElement, maxWidth = 480, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
      return reject(new Error('Kamera belum siap atau tidak aktif'));
    }

    const naturalWidth = videoElement.videoWidth;
    const naturalHeight = videoElement.videoHeight;
    const scale = Math.min(1, maxWidth / naturalWidth);
    const width = Math.round(naturalWidth * scale);
    const height = Math.round(naturalHeight * scale);

    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d');
    }

    if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
    }

    if (!offscreenCtx) {
      return reject(new Error('Gagal menginisialisasi canvas context'));
    }

    offscreenCtx.drawImage(videoElement, 0, 0, width, height);

    offscreenCanvas.toBlob(
      (blob) => {
        if (!blob) {
          return reject(new Error('Gagal mengonversi frame ke Blob'));
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}
