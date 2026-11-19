# BUNGKOK Posture Studio & Backend Camera

Backend FastAPI + Posture Studio untuk klasifikasi postur duduk berbasis MediaPipe Pose Landmarker. Paket ini menyertakan antarmuka studio webcam lokal dengan visualisasi kerangka tulang realtime (*skeleton wireframe*), kalibrasi otomatis dengan hitung mundur (*countdown*), dan sesi pelatihan postur (*training session*).

Model mengklasifikasikan postur menjadi `tegak`, `condong_depan` (bungkuk), atau `condong_belakang`. Ini adalah prototipe monitoring kebiasaan duduk, **bukan alat diagnosis medis**.

---

## 🌟 Fitur Utama & Mode Kamera

### 1. Dual Mode Kamera
- **Mode Webcam Depan (`upper_body`) [Default & Rekomendasi Laptop]**:
  - Dirancang khusus untuk webcam laptop saat bekerja di meja.
  - Memantau tubuh bagian atas: **Kepala, Leher, dan Bahu** (Hidung, Telinga, Bahu kiri & kanan).
  - Pinggul dan lutut yang tertutup meja kerja **tidak lagi ditolak**.
  - Mengukur *Forward Head Posture* (leher maju/bungkuk), rasio panjang leher relatif (*neck drop ratio*), dan kemiringan bahu (*shoulder roll*).
- **Mode Kamera Samping / Tambahan (`full_torso`)**:
  - Untuk kamera samping/eksternal yang menangkap batang tubuh penuh.
  - Memantau sudut kemiringan torso (*torso inclination*) terhadap panggul/lutut.
- **Mode Otomatis (`auto`)**:
  - Mendeteksi ketersediaan landmark: jika pinggul & lutut terlihat, otomatis mengaktifkan mode *full torso*; jika hanya tubuh atas yang terlihat, otomatis beralih ke mode *upper body*.

### 2. Visualisasi Kerangka Tulang Realtime (*Skeleton Wireframe Overlay*)
- Menggambar sendi dan garis kerangka tubuh langsung di atas tampilan kamera.
- **Kode Warna Dinamis**:
  - 🟢 **Hijau**: Postur tegak, seimbang, dan ideal.
  - 🟡 **Kuning/Oranye**: Mulai miring atau condong ringan.
  - 🔴 **Merah**: Bungkuk (*forward head / slouch*) atau input tidak terbaca jelas.

### 3. Kalibrasi Pintar dengan Hitung Mundur Otomatis
- Saat pengguna duduk di zona panduan dan terdeteksi tegak serta seimbang:
  - Sistem mendeteksi kestabilan postur.
  - Layar menampilkan hitung mundur besar: **3... 2... 1...**
  - Mengambil snapshot kalibrasi baseline secara otomatis tanpa harus klik manual berulang kali.

### 4. Fitur Pelatihan Postur (*Live Posture Training Session*)
- Begitu hitung mundur selesai dan kalibrasi tersimpan, sistem **otomatis memulai sesi pelatihan**:
  - **Stopwatch Durasi Latihan** (misal: 05:20).
  - **Skor Postur Realtime** (% waktu duduk tegak).
  - **Akumulasi Waktu Tegak vs Waktu Bungkuk**.
  - **Audio Alert Sintetis**: Chime nada sukses saat tegak, dan peringatan suara lembut jika pengguna membungkuk lebih dari threshold waktu.

---

## Menjalankan di Windows

```powershell
cd path\ke\bungkok_backend_camera
.\.venv\Scripts\Activate.ps1
.\start_backend.ps1
```

Buka peramban ke [http://127.0.0.1:8000](http://127.0.0.1:8000), izinkan webcam, lalu:

1. Pilih mode kamera (**Webcam Depan** untuk laptop atau **Kamera Samping** untuk kamera eksternal).
2. Tekan **1. Nyalakan Kamera**.
3. Posisikan kepala dan bahu di zona panduan hingga kerangka tulang berubah menjadi hijau.
4. Hitung mundur **3... 2... 1...** akan berjalan otomatis, atau tekan **Kalibrasi Otomatis**.
5. Sistem langsung masuk ke **Mode Pelatihan Postur**.

Dokumentasi OpenAPI/Swagger tersedia di [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

---

## Endpoint API

- `GET /api/health`: Memeriksa status model, versi, dan mode yang didukung (`["upper_body", "full_torso", "auto"]`).
- `POST /api/detect`: Menganalisis frame secara realtime sebelum kalibrasi. Mengembalikan status kesiapan postur (`is_upright`), evaluasi (`alignment_feedback`), dan array 33 koordinat `landmarks`.
- `POST /api/calibrations`: Menerima 3 foto tegak dan parameter `camera_mode` (`"upper_body"`, `"full_torso"`, atau `"auto"`).
- `POST /api/predict`: Menerima snapshot webcam dan `calibration_id`. Mengembalikan klasifikasi (`tegak`, `condong_depan`, `condong_belakang`), metrik postur, dan array `landmarks`.
- `DELETE /api/calibrations/{calibration_id}`: Menghapus sesi kalibrasi setelah selesai.

---

## Menjalankan Test API

```powershell
$env:PYTHONPATH="."
.\.venv\Scripts\python -m pytest -v
```
