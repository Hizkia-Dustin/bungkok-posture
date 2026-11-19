# Handoff Plan — BUNGKOK Background Monitoring

## Tujuan

Membuat sesi pemantauan postur tetap berjalan ketika pengguna berpindah ke VS Code, Spotify, browser lain, atau aplikasi Windows lain. Kamera, inferensi, pengingat, dan pencatatan sesi tidak boleh berhenti hanya karena dashboard tidak sedang berada di depan.

## Keputusan arsitektur

Jangan menjanjikan true background monitoring dari tab browser biasa. Chromium dapat men-throttle timer, menghentikan audio, membatasi kamera, atau membekukan tab ketika diminimalkan. Service Worker juga tidak boleh mengakses kamera.

Implementasikan sebagai aplikasi desktop Electron yang membungkus frontend React/Vite dan menjalankan FastAPI lokal. Electron dipilih karena proyek sudah memakai JavaScript/Chromium dan perubahan lebih kecil daripada migrasi ke Tauri/Rust.

Versi web tetap tersedia, tetapi harus diberi label “pemantauan terbaik saat tab tetap terbuka”. True background hanya dijamin pada aplikasi desktop.

## Kondisi kode saat ini

- Mesin kamera dan lifecycle sesi masih berada di `bungkok_frontend/src/components/dialogs/StartExerciseModal.jsx`.
- Ketika modal di-unmount, `stopCamera()` menghentikan semua track kamera.
- Timer UI memperlakukan `document.hidden` sebagai jeda.
- Backend sudah memiliki sesi server-authoritative, active-session check, pause, finish, cancel, prediction metrics, dan Supabase Auth.
- Frame kamera dikirim ke FastAPI untuk inferensi; gambar tidak disimpan.

## Tahapan implementasi

### 1. Pisahkan monitoring engine dari modal

Buat `PostureMonitorProvider` di atas router/layout aplikasi. Provider harus memiliki lifecycle sendiri dan tidak boleh unmount saat pengguna menutup modal atau pindah halaman.

Pindahkan dari `StartExerciseModal.jsx`:

- stream kamera dan `MediaStreamTrack`;
- calibration ID dan active session ID;
- loop capture/inference;
- pause/resume/finish/cancel;
- metrics dan posture state;
- reminder state;
- reconnect ke sesi aktif.

Modal hanya menjadi UI untuk persiapan, kalibrasi, konfigurasi, dan rekap. Menutup modal saat sesi aktif harus menyembunyikan UI, bukan menghentikan kamera.

Sediakan API context minimal:

```text
status: idle | calibrating | monitoring | paused | interrupted
metrics
posture
start(config)
pause()
resume()
finish()
cancel()
openMonitor()
```

### 2. Tambahkan Electron shell

Buat folder `bungkok_frontend/electron/` dengan main process dan preload script.

Konfigurasi `BrowserWindow`:

```text
webPreferences.backgroundThrottling = false
contextIsolation = true
nodeIntegration = false
```

Main process harus:

- membuat tray icon;
- mengubah tombol tutup menjadi hide-to-tray saat sesi aktif;
- mempertahankan renderer dan kamera selama window disembunyikan;
- memakai `powerSaveBlocker.start('prevent-app-suspension')` hanya selama sesi aktif;
- menyediakan menu tray: Buka BUNGKOK, Jeda/Lanjutkan, Akhiri Sesi, Keluar;
- mencegah dua instance aplikasi;
- benar-benar menghentikan kamera dan backend ketika pengguna memilih Keluar.

Gunakan preload + IPC yang sempit. Jangan expose seluruh Node API ke renderer.

### 3. Jalankan FastAPI sebagai child process Electron

Main process menjalankan backend lokal saat aplikasi dibuka dan menutupnya saat aplikasi benar-benar keluar.

Persyaratan:

- port tidak boleh hard-coded tanpa pemeriksaan;
- tunggu `/api/health` sebelum memuat UI latihan;
- log backend disimpan secara lokal tanpa token dan tanpa frame kamera;
- restart backend maksimal satu kali jika proses crash;
- tampilkan status “Mesin postur tidak tersedia” jika restart gagal.

Jangan menjalankan dua backend ketika developer sudah menjalankan backend manual. Gunakan health check terlebih dahulu.

### 4. Background inference dan lifecycle

Saat window tersembunyi:

- jangan menghentikan `MediaStream`;
- jangan menggunakan `document.hidden` sebagai pause otomatis;
- loop inferensi tetap hanya boleh memiliki satu request aktif;
- gunakan timestamp server, bukan jumlah tick frontend;
- gap tanpa prediksi lebih dari 3 detik harus tercatat sebagai `unknown`, bukan tegak;
- sleep, lock screen, kamera terputus, atau backend mati harus mengubah status menjadi `interrupted`;
- setelah aplikasi aktif kembali, pengguna diberi pilihan lanjut atau akhiri.

Pause hanya terjadi karena tindakan pengguna, kamera terputus, logout, atau sistem benar-benar suspend.

### 5. Notifikasi background

Saat backend mengirim `remind: true`:

- tampilkan Electron native notification;
- mainkan suara/ucapan sesuai konfigurasi admin;
- jangan mengirim notifikasi berulang selama pengguna masih dalam satu episode bungkuk;
- reset episode setelah postur tegak stabil;
- klik notifikasi harus membuka window BUNGKOK pada panel monitor.

Gunakan pesan admin dari `/api/configuration`. Sediakan fallback lokal:

```text
Postur badanmu mulai bungkuk. Yuk, tegakkan kembali agar tetap nyaman dan fokus.
```

Jangan bergantung hanya pada Web Speech API karena audio browser dapat dibatasi ketika background. Native notification harus tetap muncul meskipun speech gagal.

### 6. Mini monitor global

Tambahkan indikator kecil pada semua halaman aplikasi:

- kamera aktif;
- status postur terakhir;
- durasi sesi;
- tombol buka monitor;
- jeda dan akhiri.

Saat window disembunyikan, informasi yang sama tersedia dari menu tray. Jangan tampilkan preview kamera di tray atau notifikasi.

### 7. Active-session recovery

Saat aplikasi dibuka ulang:

- panggil `GET /api/sessions/active`;
- jika sesi masih dapat dilanjutkan dan calibration ID valid, pulihkan monitor;
- jika kalibrasi sudah kedaluwarsa, tawarkan Akhiri Tanpa Poin atau Batalkan Sesi;
- jangan membuat sesi kedua;
- logout harus pause/finish/cancel sesi secara eksplisit sebelum token dibuang.

Simpan hanya ID sesi dan preferensi non-sensitif. Token Supabase desktop disimpan menggunakan Electron `safeStorage`, bukan plaintext baru di file konfigurasi.

### 8. Backend yang perlu ditambahkan

- Tambahkan `last_heartbeat_at` atau status heartbeat pada sesi aktif.
- Tambahkan endpoint heartbeat yang terautentikasi bila prediction interval bisa berhenti lama.
- Kembalikan `config`, `startedAt`, dan status interruption dari active-session endpoint.
- Simpan cooldown/episode reminder pada sesi server agar reload tidak menggandakan notifikasi.
- Pastikan finish idempotent.
- Pastikan cancel hanya bisa menghapus sesi milik user dan hanya sesi yang belum selesai.

Tidak perlu menyimpan foto atau video.

## Urutan pengerjaan yang disarankan

1. Refactor monitoring engine ke provider tanpa mengubah perilaku.
2. Tambahkan tes provider dengan mock API dan mock MediaStream.
3. Tambahkan Electron shell, tray, hide-to-tray, dan `backgroundThrottling: false`.
4. Hubungkan lifecycle provider ke IPC Electron.
5. Tambahkan native notification dan action klik.
6. Tambahkan recovery active session dan heartbeat backend.
7. Uji perpindahan aplikasi, minimize, lock screen, sleep, kamera dicabut, backend crash, logout, dan relaunch.
8. Baru setelah stabil, buat installer Windows.

## Acceptance criteria

- Sesi tetap berjalan selama 10 menit ketika pengguna bekerja di VS Code atau aplikasi lain.
- Window BUNGKOK boleh disembunyikan ke tray tanpa mematikan kamera.
- Tidak ada dua request prediction yang berjalan bersamaan.
- Bungkuk nyata pada mode Koreksi Aktif memunculkan notifikasi maksimal sekitar 2 detik setelah status stabil.
- Melihat HP atau menoleh tidak memicu notifikasi jika torso tetap stabil.
- Diam tidak membuat skeleton atau status bergetar berlebihan.
- Minimize/hide tidak otomatis menambah waktu tegak; hanya sampel valid yang dihitung.
- Sleep/lock/kamera mati dicatat sebagai interrupted/unknown.
- Membuka kembali aplikasi memulihkan sesi atau menawarkan penyelesaian yang jelas.
- Logout dan Exit benar-benar menghentikan kamera.
- Tidak ada token, password, foto, atau video di log.
- Aplikasi web tetap berfungsi tanpa Electron, tetapi menunjukkan keterbatasan background.

## Skenario pengujian minimum

1. Mulai sesi, pindah ke VS Code 10 menit, lalu buka BUNGKOK kembali.
2. Hide ke tray selama sesi, lakukan postur bungkuk, pastikan native notification muncul.
3. Diam selama 2 menit, pastikan tidak ada false reminder.
4. Lihat HP dengan torso stabil, pastikan status aktivitas kepala dan tidak ada reminder.
5. Bungkukkan badan, pastikan reminder muncul dan metrik bertambah.
6. Putuskan kamera, pastikan sesi interrupted dan tidak mendapat poin dari gap.
7. Sleep lalu resume Windows, pastikan gap tidak dihitung tegak.
8. Matikan backend saat sesi, pastikan satu kali restart dan UI memberi status yang benar.
9. Relaunch aplikasi dengan sesi aktif, pastikan recovery tidak membuat sesi duplikat.
10. Logout saat sesi aktif, pastikan ada konfirmasi penyelesaian sesi.

## Batasan yang harus dijelaskan kepada pengguna

- True background monitoring dijamin hanya pada aplikasi desktop.
- Versi browser tidak bisa menjamin kamera tetap aktif ketika tab dibekukan oleh browser/OS.
- Aplikasi tidak memberikan diagnosis medis; hasil adalah pendamping kebiasaan postur.

## Instruksi untuk agent implementasi

- Jangan menghapus atau mereset database pengguna.
- Jangan melemahkan autentikasi endpoint kamera.
- Jangan menyimpan frame kamera.
- Jangan memberi poin berdasarkan timer frontend.
- Pertahankan toleransi aktivitas kepala dan smoothing yang sudah ada.
- Kerjakan bertahap dan jalankan tes statis/unit; jangan menjalankan kamera tanpa persetujuan pengguna.
