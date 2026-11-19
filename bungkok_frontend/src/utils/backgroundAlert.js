// ============================================================================
// UTILITY: backgroundAlert.js
// ----------------------------------------------------------------------------
// Modul pendukung untuk pemantauan postur di latar belakang (Background Monitoring)
// Fitur:
// 1. Web Notifications API: Menampilkan pop-up notifikasi desktop Windows
// 2. Background Audio Chime: Suara nada pengingat via Web Audio API
// 3. Dynamic Document Title: Mengubah judul tab browser secara berkala
// 4. Picture-in-Picture (PiP): Memunculkan jendela mini video mengambang (Always on Top)
// ============================================================================

// State internal untuk melacak debounce / interval cooldown notifikasi & suara
let lastNotificationTime = 0;
let lastChimeTime = 0;
let titleFlasherInterval = null;
let originalDocumentTitle = typeof document !== 'undefined' ? document.title : 'BUNGKOK';

// Konstanta Cooldown (mencegah spam notifikasi dan suara yang mengganggu)
const NOTIFICATION_COOLDOWN_MS = 8000; // Maksimal notifikasi desktop muncul tiap 8 detik
const CHIME_COOLDOWN_MS = 6000;        // Maksimal nada pengingat berbunyi tiap 6 detik

// ============================================================================
// 1. MANAJEMEN NOTIFIKASI DESKTOP (WEB NOTIFICATIONS API)
// ============================================================================

/**
 * Memeriksa apakah browser mendukung Web Notifications API
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Mengambil status izin notifikasi saat ini ('granted' | 'denied' | 'default')
 */
export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Meminta izin kepada pengguna untuk menampilkan notifikasi desktop sistem
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.warn('[backgroundAlert] Gagal meminta izin notifikasi:', error);
    return false;
  }
}

/**
 * Mengirimkan notifikasi desktop Windows ketika pengguna sedang membuka tab lain
 * @param {string} title - Judul notifikasi
 * @param {string} body - Pesan instruksi postur
 */
export function sendDesktopPostureNotification(
  title = '⚠️ BUNGKOK: Postur Bungkuk Terdeteksi!',
  body = 'Punggung atau leher Anda mulai condong ke depan. Tarik bahu ke belakang dan tegakkan badan.'
) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  const now = Date.now();
  // Cegah spam notifikasi jika belum melewati batas cooldown
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) {
    return;
  }
  lastNotificationTime = now;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'bungkok-posture-alert', // Menggantikan notifikasi sebelumnya agar tidak menumpuk
      silent: true, // Audio ditangani terpisah oleh playBackgroundChime agar volume dapat diatur
    });

    // Ketika notifikasi diklik, otomatis bawa pengguna kembali ke tab Bungkok
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Tutup notifikasi secara otomatis setelah 4.5 detik
    setTimeout(() => {
      notification.close();
    }, 4500);
  } catch (error) {
    console.warn('[backgroundAlert] Gagal memunculkan notifikasi desktop:', error);
  }
}

// ============================================================================
// 2. SUARA PENGINGAT DI LATAR BELAKANG (WEB AUDIO API CHIME)
// ============================================================================

/**
 * Memainkan nada chime lembut pengingat postur di latar belakang
 * Menggunakan Web Audio API Synthesizer (tidak memerlukan file audio eksternal)
 * @param {number} volume - Skala 0 s/d 100
 */
export async function playBackgroundChime(volume = 70) {
  const now = Date.now();
  if (now - lastChimeTime < CHIME_COOLDOWN_MS) {
    return;
  }
  lastChimeTime = now;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const t = ctx.currentTime;
    const gainNode = ctx.createGain();
    const osc = ctx.createOscillator();

    // Mengatur jenis gelombang nada halus (Sine Wave)
    osc.type = 'sine';

    // Melodi lembut dua nada: Nada pertama 587Hz (D5), nada kedua 880Hz (A5)
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.setValueAtTime(880.00, t + 0.14);

    // Envelope suara: Volume fade-in lembut lalu meluruh perlahan
    const normalizedVol = Math.max(0.01, Math.min(1, volume / 100)) * 0.22;
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(normalizedVol, t + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    osc.connect(gainNode).connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.65);

    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch (err) {
    console.warn('[backgroundAlert] Gagal memutar audio latar belakang:', err);
  }
}

// ============================================================================
// 3. DINAMIKA JUDUL TAB BROWSER (DYNAMIC TAB TITLE)
// ============================================================================

/**
 * Mengubah judul tab browser ketika pengguna bungkuk saat tab tersembunyi
 * @param {'slouch' | 'upright' | 'idle'} state - Status postur
 */
export function updateBackgroundTabTitle(state) {
  if (typeof document === 'undefined') return;

  // Hentikan interval berkedip sebelumnya
  if (titleFlasherInterval) {
    clearInterval(titleFlasherInterval);
    titleFlasherInterval = null;
  }

  // Jika tab sedang aktif/dilihat pengguna, kembalikan ke judul default
  if (!document.hidden || state === 'idle') {
    document.title = originalDocumentTitle;
    return;
  }

  if (state === 'slouch') {
    let flip = false;
    document.title = '🔴 [BUNGKUK!] Tegakkan Punggung · BUNGKOK';
    // Berkedip antara teks peringatan dan instruksi
    titleFlasherInterval = setInterval(() => {
      flip = !flip;
      document.title = flip
        ? '🔴 [BUNGKUK!] Tegakkan Punggung · BUNGKOK'
        : '⚠️ Perbaiki Posisi Dudukmu! · BUNGKOK';
    }, 1200);
  } else if (state === 'upright') {
    document.title = '🟢 Postur Tegak · BUNGKOK';
  }
}

/**
 * Mengembalikan judul tab ke judul bawaan aplikasi
 */
export function resetTabTitle() {
  if (titleFlasherInterval) {
    clearInterval(titleFlasherInterval);
    titleFlasherInterval = null;
  }
  if (typeof document !== 'undefined') {
    document.title = originalDocumentTitle;
  }
}

// ============================================================================
// 4. MODE FLOATING MINI WIDGET (PICTURE-IN-PICTURE / PiP)
// ============================================================================

/**
 * Mempersiapkan video element agar otomatis masuk ke mode Picture-in-Picture
 * saat pengguna berpindah ke tab lain atau meminimalkan browser (Auto-PiP)
 * @param {HTMLVideoElement} videoElement - Elemen video sumber
 * @param {Function} onStateChange - Callback status (boolean: isPipActive)
 */
export function setupAutoPictureInPicture(videoElement, onStateChange) {
  if (!videoElement) return () => {};

  try {
    videoElement.autoPictureInPicture = true;
    videoElement.setAttribute('autopictureinpicture', '');
  } catch (e) {
    // Abaikan jika browser lawas belum mendukung atribut autoPictureInPicture
  }

  const handleEnter = () => {
    onStateChange?.(true);
  };

  const handleLeave = () => {
    onStateChange?.(false);
  };

  videoElement.addEventListener('enterpictureinpicture', handleEnter);
  videoElement.addEventListener('leavepictureinpicture', handleLeave);

  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', async () => {
        try {
          if (!document.pictureInPictureElement && videoElement) {
            await videoElement.requestPictureInPicture();
            onStateChange?.(true);
          }
        } catch (err) {
          console.warn('[backgroundAlert] mediaSession enterpictureinpicture:', err);
        }
      });
    } catch {
      // mediaSession enterpictureinpicture action handler not supported
    }
  }

  return () => {
    videoElement.removeEventListener('enterpictureinpicture', handleEnter);
    videoElement.removeEventListener('leavepictureinpicture', handleLeave);
  };
}

/**
 * Mencoba memicu Picture-in-Picture secara aman tanpa melempar error tak tertangani
 * @param {HTMLVideoElement} videoElement
 * @param {Function} onStateChange
 */
export async function requestAutoPictureInPicture(videoElement, onStateChange) {
  if (typeof document === 'undefined' || !document.pictureInPictureEnabled || !videoElement) return false;
  if (document.pictureInPictureElement) {
    onStateChange?.(true);
    return true;
  }
  try {
    await videoElement.requestPictureInPicture();
    onStateChange?.(true);
    return true;
  } catch (err) {
    // Normal terjadi jika browser menolak request saat tidak ada user gesture langsung
    return false;
  }
}

/**
 * Mengaktifkan atau menonaktifkan Picture-in-Picture untuk elemen video
 * @param {HTMLVideoElement} videoElement - Elemen video sumber
 * @param {Function} onStateChange - Callback status (boolean: isPipActive)
 */
export async function togglePictureInPicture(videoElement, onStateChange) {
  if (!document.pictureInPictureEnabled) {
    throw new Error('Browser Anda belum mendukung mode Picture-in-Picture.');
  }

  try {
    if (document.pictureInPictureElement) {
      // Jika PiP sedang aktif, keluar dari mode PiP
      await document.exitPictureInPicture();
      onStateChange?.(false);
      return false;
    } else if (videoElement) {
      // Minta browser memunculkan jendela video mengambang
      await videoElement.requestPictureInPicture();
      onStateChange?.(true);

      // Pasang event listener saat pengguna menutup PiP manual
      videoElement.addEventListener(
        'leavepictureinpicture',
        () => {
          onStateChange?.(false);
        },
        { once: true }
      );
      return true;
    }
  } catch (error) {
    console.warn('[backgroundAlert] Gagal mengaktifkan Picture-in-Picture:', error);
    throw error;
  }
}
