# 📋 BUNGKOK SYSTEM: MASTER EXECUTION PLAN (.MD)
> **Target:** Mengubah prototipe BUNGKOK dari frontend simulasi dummy menjadi aplikasi Computer Vision full-stack terintegrasi (React + FastAPI + MediaPipe 3D + Database SQLite/PostgreSQL) yang siap dideploy.

---

## 📌 DAFTAR FASE EKSEKUSI

```
[FASE 1: Integrasi API Realtime] ──► [FASE 2: Database & Riwayat] ──► [FASE 3: Siap Deploy Cloud]
   (Webcam ↔ FastAPI /predict)          (SQLAlchemy + PostgreSQL)         (Render + Vercel + HTTPS)
```

---

### 🚀 FASE 1: Integrasi Kamera & Real API (Frontend ↔ Backend)
**Status Saat Ini:** `StartExerciseModal.jsx` masih menggunakan data simulasi timer, belum memanggil endpoint API FastAPI.

- [ ] **1.1. Buat Service API Frontend (`src/services/postureApi.js`)**
  - Definisikan base URL dari environment variable `VITE_API_URL` (default `http://localhost:8000`).
  - Fungsi `checkBackendHealth()` untuk cek apakah server FastAPI aktif.
  - Fungsi `calibrateUser(blobArray, mode)` untuk kirim 3-5 frame ke `POST /calibrate`.
  - Fungsi `predictPosture(blob, calibrationId)` untuk kirim 1 frame ke `POST /predict`.

- [ ] **1.2. Capture Frame Canvas Otomatis (`src/utils/cameraCapture.js`)**
  - Fungsi konversi `<video>` stream menjadi `Blob` (format `image/jpeg`, kualitas 0.85).
  - Optimasi ukuran gambar (maks 640x480) agar latency inferensi di bawah 30 ms.

- [ ] **1.3. Hubungkan Kalibrasi Real di `StartExerciseModal.jsx`**
  - Ganti countdown dummy menjadi pengambilan 3-5 frame foto saat pengguna duduk tegak.
  - Kirim ke `POST /calibrate` dan simpan `calibration_id` ke state React.

- [ ] **1.4. Hubungkan Looping Deteksi Realtime (Interval 1 Detik)**
  - Jalankan interval setiap 1000 ms selama sesi latihan aktif:
    1. Capture frame dari webcam.
    2. Kirim ke `POST /predict` bersama `calibration_id`.
    3. Update status UI (`Tegak` / `Condong depan` / `Condong belakang`).
    4. Mainkan audio reminder jika terdeteksi condong depan lebih dari threshold.

---

### 💾 FASE 2: Integrasi Database (Simpan Sesi & Riwayat Pengguna)
**Status Saat Ini:** Data sesi hanya tersimpan di memori sementara (RAM) dan hilang saat refresh.

- [ ] **2.1. Setup Database Layer di FastAPI (`bungkok_backend_camera/database.py`)**
  - Gunakan **SQLAlchemy** (support SQLite untuk lokal, PostgreSQL untuk cloud).
  - Tentukan koneksi dari env `DATABASE_URL`.

- [ ] **2.2. Buat Skema Tabel ORM (`bungkok_backend_camera/models_db.py`)**
  - **Tabel `User`**: `id`, `name`, `email`, `created_at`.
  - **Tabel `Session`**: `id`, `user_id`, `start_time`, `end_time`, `duration_seconds`, `upright_percentage`, `avg_cervical_angle`.
  - **Tabel `PostureLog`**: `id`, `session_id`, `timestamp`, `posture_label`, `angle_cervical`.

- [ ] **2.3. Buat Endpoint CRUD Riwayat di FastAPI**
  - `POST /api/sessions/start`: Mulai pencatatan sesi baru.
  - `POST /api/sessions/{id}/finish`: Menyimpan ringkasan akhir sesi ke database.
  - `GET /api/sessions/history`: Mengambil riwayat latihan untuk ditampilkan di tab `RiwayatLatihan.jsx`.
  - `GET /api/dashboard/stats`: Menghitung total jam latihan dan skor ergonomi untuk `Dashboard.jsx`.

- [ ] **2.4. Sinkronisasi Data ke Halaman Riwayat & Dashboard Frontend**
  - Hubungkan tabel di `RiwayatLatihan.jsx` ke endpoint `GET /api/sessions/history`.
  - Hubungkan kartu metrik di `Dashboard.jsx` ke endpoint `GET /api/dashboard/stats`.

---

### ☁️ FASE 3: Konfigurasi Deployment Cloud (FastAPI + Supabase + Vercel)
**Status Saat Ini:** Backend dan Frontend masih berjalan di lokal komputer.

- [ ] **3.1. Konfigurasi Backend Production**
  - Buat `Dockerfile` yang memuat Python 3.11/3.13, OpenCV-headless, MediaPipe, dan dependencies.
  - Setup script start production: `uvicorn app:create_app --host 0.0.0.0 --port $PORT`.
  - Konfigurasi CORS agar menerima domain Vercel.

- [ ] **3.2. Setup Database Cloud di Supabase / Neon**
  - Buat instance PostgreSQL gratis di Supabase.
  - Masukkan connection string ke konfigurasi backend.

- [ ] **3.3. Konfigurasi Frontend Production**
  - Buat `bungkok_frontend/.env.production` dengan `VITE_API_URL=https://<nama-backend>.onrender.com`.
  - Buat file `vercel.json` untuk konfigurasi Single Page Application (SPA) routing.

---

### 🧪 FASE 4: Pengujian & Validasi End-to-End
- [ ] **4.1. Uji Alur Lengkap (E2E):**
  1. Buka browser -> Masuk ke menu Latihan Postur.
  2. Kamera menyala -> Lakukan Kalibrasi 3 detik (dapat `calibration_id`).
  3. Simulasi duduk bungkuk -> Sistem mendeteksi `Condong depan` dan alarm berbunyi.
  4. Duduk tegak kembali -> Sistem mendeteksi `Tegak`.
  5. Selesai sesi -> Rekap skor muncul dan data otomatis tersimpan di Database.
  6. Buka tab Riwayat -> Sesi yang baru saja selesai tercatat dengan benar.
