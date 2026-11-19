// ============================================================================
// WEB WORKER: posture-worker.js
// ----------------------------------------------------------------------------
// Worker ini berjalan di background thread terpisah dari antarmuka DOM utama.
// Tujuannya:
// Mencegah timer pengambilan frame webcam dibekukan (throttled) oleh Chrome / Edge
// ketika pengguna berpindah ke tab lain, meminimalkan browser, atau membuka aplikasi kerja.
// ============================================================================

let heartbeatTimer = null;

// Mendengarkan instruksi kontrol dari StartExerciseModal (main thread)
self.onmessage = function (event) {
  const data = event.data || {};
  const command = data.command;
  const intervalMs = Math.max(100, data.interval || 250);

  if (command === 'start') {
    // Hentikan timer sebelumnya jika ada
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // Jalankan timer background stabil yang mengirimkan event "tick"
    heartbeatTimer = setInterval(() => {
      self.postMessage({
        type: 'tick',
        timestamp: Date.now(),
      });
    }, intervalMs);
  } else if (command === 'stop') {
    // Hentikan timer saat sesi latihan di-pause atau diakhiri
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }
};
