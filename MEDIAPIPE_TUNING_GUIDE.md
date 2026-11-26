# Panduan Tuning MediaPipe BUNGKOK

Dokumen ini adalah pegangan untuk AI/developer berikutnya saat menyesuaikan deteksi postur. Baca seluruh dokumen sebelum mengubah kode. Jangan tuning hanya dari satu foto atau satu pengguna.

## Tujuan sistem

Sistem harus:

- menampilkan kerangka dengan halus dan tetap mengikuti tubuh secara realtime;
- tidak berubah status saat pengguna diam karena jitter landmark;
- tetap menganggap postur tegak ketika pengguna bekerja, melihat layar, atau menoleh ringan;
- mendeteksi bungkuk yang nyata setelah berlangsung stabil beberapa frame;
- tidak kehilangan kerangka ketika API production lambat atau restart;
- memulai setiap akun baru tanpa progres, badge, poin, atau hadiah dummy.

## Arsitektur saat ini

```text
Webcam
  ├─ Local MediaPipe Worker (18 FPS) ──> kerangka visual realtime
  └─ Backend Railway (4 FPS) ──────────> klasifikasi postur + metrik + poin
                                           │
                                           └─ Supabase/Postgres: ringkasan sesi
```

Kerangka visual dan keputusan postur sengaja dipisahkan. Jangan mengembalikan seluruh rendering kerangka ke backend karena latency jaringan akan membuatnya patah-patah atau hilang.

Production:

- Frontend: `https://bungkok-posture.vercel.app`
- Backend: `https://bungkok-api-production.up.railway.app`
- Health check: `https://bungkok-api-production.up.railway.app/api/health`

## File yang perlu dipahami

| Bagian | File | Fungsi |
|---|---|---|
| Alur kamera dan sesi | `bungkok_frontend/src/components/dialogs/StartExerciseModal.jsx` | Menangkap frame, memilih POV, smoothing status, reminder, dan timer |
| Pelacak lokal | `bungkok_frontend/src/utils/localPoseTracker.js` | Worker MediaPipe lokal dan batas FPS |
| Worker model lokal | `bungkok_frontend/src/workers/localPoseWorker.js` | Memuat WASM/model, GPU lalu fallback CPU |
| Renderer kerangka | `bungkok_frontend/src/utils/skeletonDrawer.js` | LERP, dead zone, prediksi gerak, fade, dan garis kerangka |
| API frontend | `bungkok_frontend/src/services/postureApi.js` | Request, token, timeout, dan endpoint deteksi |
| Aturan backend | `bungkok_backend_camera/model/posture_backend_v3.py` | Ekstraksi fitur dan klasifikasi tegak/depan/belakang |
| Konfigurasi model | `bungkok_backend_camera/model/posture_backend_v3_config.json` | Threshold utama untuk tuning |
| Endpoint backend | `bungkok_backend_camera/app.py` | Lock model, thread pool, CORS, detect, calibration, predict |
| Tes geometri | `bungkok_backend_camera/tests/test_model_geometry.py` | Tes POV samping dan fitur geometri |
| Tes API | `bungkok_backend_camera/tests/test_api.py` | Kontrak endpoint |

## Nilai operasional yang harus dipertahankan

Nilai saat dokumen ini dibuat:

- local skeleton: `18 FPS`;
- request backend: setiap `250 ms` atau maksimal 4 FPS;
- timeout `/api/detect`: `5000 ms`;
- timeout request biasa: `12000 ms`;
- local landmark dianggap basi setelah `1000 ms`;
- backend memakai satu `asyncio.Lock` karena instance MediaPipe tidak aman dipanggil paralel;
- model lokal aktif: `ENABLE_LOCAL_POSE_TRACKER = true`.

Jangan menaikkan request backend menjadi 10 FPS. Itu menambah beban Railway tanpa membuat kerangka lebih mulus karena kerangka sudah dirender lokal.

## Urutan tuning yang benar

### 1. Pastikan masalah bukan jaringan

Sebelum mengubah threshold, cek:

```powershell
Invoke-WebRequest https://bungkok-api-production.up.railway.app/api/health
```

Hasil normal adalah HTTP `200` dengan `{"status":"ok"}`. Jika health check hang, threshold bukan penyebabnya. Restart/redeploy backend dan periksa log Railway.

Periksa preflight CORS:

```powershell
$headers = @{
  Origin = 'https://bungkok-posture.vercel.app'
  'Access-Control-Request-Method' = 'POST'
  'Access-Control-Request-Headers' = 'authorization'
}
Invoke-WebRequest `
  -Uri 'https://bungkok-api-production.up.railway.app/api/detect' `
  -Method Options `
  -Headers $headers
```

Normal: HTTP `200` dalam waktu kurang dari satu detik.

### 2. Tentukan lapisan yang bermasalah

- Kamera tampil tetapi kerangka hilang: periksa worker lokal, canvas, model `.task`, lalu fallback landmark backend.
- Kerangka mulus tetapi label salah: tuning aturan backend/config.
- Label berubah-ubah saat diam: tambah stabilisasi temporal/dead zone, bukan langsung melonggarkan semua threshold.
- Peringatan terlambat: periksa jumlah frame berturut-turut dan cooldown reminder.
- Production berbeda dari localhost: periksa latency, CORS, model asset, CDN WASM, dan log Railway.

### 3. Rekam sampel nyata

Gunakan minimal skenario berikut untuk kamera depan dan samping:

1. tegak diam 30 detik;
2. tegak sambil mengetik 30 detik;
3. tegak sambil melihat HP 15 detik;
4. menoleh kiri/kanan tanpa membungkuk;
5. membungkuk ringan;
6. membungkuk jelas;
7. bersandar ke belakang;
8. orang lain lewat di belakang;
9. pencahayaan terang dan redup;
10. sebagian bahu keluar frame.

Simpan metrik, label yang diharapkan, label aktual, dan waktu perubahan status. Jangan menyimpan foto/video pengguna ke database.

### 4. Ubah satu kelompok parameter

Prioritaskan perubahan pada `posture_backend_v3_config.json`.

#### Kamera depan

- `max_cervical_angle_upright`: makin besar = leher maju masih dianggap tegak.
- `max_ear_forward_z_upright`: makin besar = lebih toleran terhadap kepala maju.
- `max_nose_forward_z_upright`: makin besar = lebih toleran terhadap wajah dekat kamera.
- `forward_cervical_angle_delta`: makin besar = bungkuk harus lebih jelas dari baseline.
- `forward_neck_drop_ratio`: makin negatif = kepala harus turun lebih jauh sebelum dianggap bungkuk.
- `head_activity_*`: toleransi ketika melihat HP/pekerjaan tetapi torso tetap stabil.
- `severe_forward_*`: batas keras; jangan terlalu longgar karena bungkuk berat bisa lolos.

#### Kamera samping

- `side_alignment.max_torso_lean_deg`: batas kemiringan torso saat persiapan.
- `side_alignment.max_neck_flexion_deg`: batas kepala maju saat persiapan; mencegah kalibrasi dalam posisi bungkuk.
- `thresholds.side_neck_flexion_max_deg` / `side_neck_flexion_delta_deg`: kepala maju (sudut bahu→telinga dari vertikal) secara absolut / relatif kalibrasi. Membungkuk ke laptop sering terlihat di sini walau garis bahu–pinggul masih tegak.
- `thresholds.side_torso_forward_delta_deg` / `side_torso_backward_delta_deg`: condong/bersandar garis bahu–pinggul relatif kalibrasi, dalam koordinat piksel.
- Kamera samping harus mengevaluasi garis bahu–pinggul **dan** posisi kepala terhadap bahu, bukan kemiringan kepala (roll) saja.
- Jangan memakai titik lutut sebagai syarat utama jika kamera hanya menangkap torso.

#### Visibilitas

- `min_upper_visibility`: turunkan sedikit hanya bila kacamata/cahaya menyebabkan wajah sering hilang.
- `minimum_torso_visibility`: jangan terlalu rendah karena landmark orang lain dapat ikut terbaca.

Catatan: beberapa angka masih hardcoded di `posture_backend_v3.py`, terutama sekitar keputusan `is_forward` dan `is_backward`. Jika perlu mengubahnya, pindahkan dahulu ke JSON agar sumber threshold tidak ganda.

### 5. Tuning kerangka visual

Di `skeletonDrawer.js`:

- `LERP_FACTOR` lebih besar = respons lebih cepat tetapi lebih bergetar;
- `TARGET_DEAD_ZONE` lebih besar = lebih stabil saat diam tetapi gerakan kecil terlambat;
- `FACE_DEAD_ZONE` mengatur stabilitas titik wajah;
- `VELOCITY_GATE` mencegah prediksi gerak dari noise kecil;
- `MAX_PREDICTION_MS` membatasi extrapolation agar tulang tidak melesat;
- `FADE_TIMEOUT_MS` mengatur berapa lama kerangka bertahan ketika landmark hilang sesaat.

Ubah nilai kecil, maksimal sekitar 10–20% per iterasi. Jangan sekaligus mengubah LERP, dead zone, FPS, dan threshold backend karena penyebab regresi tidak akan bisa dilacak.

## Aturan stabilisasi status

Status postur tidak boleh mengikuti satu frame mentah.

- Gunakan majority voting atau hysteresis beberapa frame.
- Masuk status bungkuk harus lebih ketat daripada tetap berada di status bungkuk.
- Kembali ke tegak harus memerlukan beberapa frame tegak berurutan.
- Aktivitas kepala boleh ditoleransi jika torso dan bahu stabil.
- Reminder hanya dikirim setelah bungkuk stabil, bukan ketika satu landmark meloncat.
- Timer `waktu valid` hanya bertambah pada frame yang benar-benar terdeteksi dan tidak sedang pause.

## Fallback yang tidak boleh dihapus

1. Worker mencoba GPU, lalu CPU.
2. Jika landmark lokal kosong atau lebih tua dari 1 detik, renderer memakai landmark backend.
3. Request deteksi memiliki timeout agar `requestInFlight` tidak terkunci selamanya.
4. Backend menjalankan MediaPipe lewat thread pool dan `model_lock`.
5. Canvas harus selalu disesuaikan dengan `videoWidth` dan `videoHeight`.
6. Foto profil dan kegagalan avatar tidak boleh memengaruhi kamera/MediaPipe.

## Checklist verifikasi

Sebelum commit:

- [ ] Kerangka muncul di tahap Persiapan maksimal beberapa detik setelah kamera aktif.
- [ ] Kerangka tetap bergerak halus ketika backend dimatikan sementara.
- [ ] Pengguna diam tidak menghasilkan indikator bergerak berlebihan.
- [ ] Melihat HP sebentar tidak langsung dihitung bungkuk bila torso tegak.
- [ ] Bungkuk jelas memicu status dan reminder dalam waktu yang wajar.
- [ ] POV depan dan samping diuji terpisah.
- [ ] Tidak ada request `/api/detect` paralel dari satu browser.
- [ ] `/api/detect` dan preflight CORS tidak mengembalikan 401/499.
- [ ] Akun baru tetap memiliki 0 poin dan 0 progres.
- [ ] Tidak ada data dummy yang ditambahkan.
- [ ] Backend test tetap lulus.
- [ ] Production diuji setelah deployment, bukan hanya localhost.

## Format laporan tuning

AI/developer berikutnya wajib menulis ringkasan seperti ini:

```md
### Tuning YYYY-MM-DD

- Gejala: ...
- Kamera: depan/samping
- Kondisi uji: ...
- Akar masalah: visual / jaringan / backend rule / temporal smoothing
- Parameter sebelum: ...
- Parameter sesudah: ...
- Sampel diuji: ...
- False positive sebelum/sesudah: ...
- False negative sebelum/sesudah: ...
- Dampak performa: ...
- Commit/deployment: ...
```

## Larangan untuk AI berikutnya

- Jangan mengklaim “sudah perfect” hanya dari satu screenshot.
- Jangan mengganti threshold berdasarkan tebakan tanpa mencatat nilai sebelum/sesudah.
- Jangan menghapus kalibrasi personal.
- Jangan menjalankan inferensi MediaPipe yang sama secara paralel pada satu instance backend.
- Jangan membuat backend menjadi sumber animasi kerangka utama.
- Jangan menyembunyikan error API; tampilkan status yang dapat dipahami pengguna.
- Jangan mengubah database proyek lain, termasuk ruang belajar MySQL dan Sistem Informasi.
- Jangan menambahkan akun, progres, poin, badge, sesi, atau hadiah dummy.

## Prompt singkat untuk AI berikutnya

```text
Baca MEDIAPIPE_TUNING_GUIDE.md sampai selesai. Diagnosa dahulu apakah masalah berada di worker lokal, canvas, jaringan/CORS, backend MediaPipe, atau stabilisasi temporal. Ubah satu kelompok parameter per iterasi, pertahankan local skeleton 18 FPS + backend classification 4 FPS + fallback landmark, jalankan tes yang relevan, dan laporkan nilai sebelum/sesudah beserta regresinya. Jangan menyentuh database/proyek di luar BUNGKOK dan jangan membuat data dummy.
```
