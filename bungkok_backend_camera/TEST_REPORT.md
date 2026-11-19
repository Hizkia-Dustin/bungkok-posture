# Test Report — BUNGKOK Backend Camera

Tanggal Verifikasi Terakhir: 9 November 2026  
Versi Model: `3.1.0-dual-mode`

---

## 1. Unit Test API Contracts

Perintah:
```powershell
$env:PYTHONPATH="."
.\.venv\Scripts\python -m pytest -v
```

Hasil:
```text
tests/test_api.py::test_calibration_prediction_and_delete PASSED [ 50%]
tests/test_api.py::test_rejects_too_few_calibration_images_and_invalid_type PASSED [100%]
2 passed, 1 warning in 0.74s
```

Cakupan kasus uji:
- `GET /api/health`: Memeriksa status model, versi 3.1.0, dan array `supported_modes`.
- `POST /api/detect`: Menguji analisis postur realtime tanpa kalibrasi, verifikasi field `is_upright` dan array `landmarks`.
- `POST /api/calibrations`: Menguji pembuatan sesi kalibrasi dengan parameter `camera_mode: "upper_body"`.
- `POST /api/predict`: Menguji klasifikasi postur dengan `calibration_id`, memverifikasi hasil label, prediksi, dan ketersediaan koordinat `landmarks`.
- `DELETE /api/calibrations/{id}`: Memverifikasi penghapusan sesi dan status 404 pada panggilan berikutnya.
- Guards: Penolakan jumlah foto kalibrasi yang kurang dari 3 dan penolakan format non-gambar (415).

---

## 2. End-to-End Real Model Test (MediaPipe Pose Landmarker)

Pengujian langsung dengan binary model asli `pose_landmarker_lite.task` pada sampel foto upper-body (`grace_hopper.jpg`):

- **Deteksi (`detect`)**:
  - `status: "ok"`
  - `camera_mode: "upper_body"`
  - `is_upright: True`
  - `alignment_feedback: "Posisi tegak dan seimbang! Siap kalibrasi."`
  - `landmarks`: 33 koordinat dinormalisasi (0–1).
- **Kalibrasi (`calibrate`)**:
  - `camera_mode: "upper_body"`
  - 3 sampel valid diproses tanpa penolakan.
  - Baseline `upper_neck_ratio = 0.417` dan `upper_forward_z = 0.124` tersimpan.
- **Prediksi (`predict`)**:
  - `prediction: "tegak"` (label 0).
  - Landmark tubuh atas berhasil diekstraksi untuk visualisasi kerangka tulang (*wireframe*).
- **Latency**: Rata-rata inferensi MediaPipe: **~35 ms per frame** (~28 FPS).

---

## 3. Verifikasi Antarmuka Studio (`static/index.html`)

- `HTTP GET /`: 200 OK.
- Mode Switcher: Tab *Webcam Depan* dan *Kamera Samping* berpindah dengan mulus.
- Canvas Overlay: Sinkron dengan orientasi cermin (*mirrored*) video kamera.
- Evaluasi Postur: Logika pewarnaan kerangka tulang (Hijau/Kuning/Merah) terhubung dengan status deteksi.
- Countdown Timer: Animasi hitung mundur 3.. 2.. 1.. berjalan otomatis saat posisi tegak stabil.
- Training Session: Stopwatch, persentase skor tegak, dan audio peringatan (Web Audio API) berfungsi otomatis setelah kalibrasi.
