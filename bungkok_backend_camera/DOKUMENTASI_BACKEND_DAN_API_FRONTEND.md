# 📘 Dokumentasi Backend BUNGKOK & Panduan Integrasi Frontend

Dokumen ini ditujukan untuk Anda dan rekan tim (yang sedang mengerjakan Frontend). Dokumen ini merangkum:
1. **Penjelasan Konseptual & Teori** (Arsitektur AI, ANN, Colab vs Backend, alasan tidak pakai OpenCV/YOLO).
2. **Cara Tuning Model & Parameter** (Tanpa perlu buka Google Colab).
3. **Spesifikasi API Endpoint Lengkap** (Kontrak REST API untuk pengembang Frontend).

---

## BAGIAN 1: Penjelasan Konseptual & Arsitektur AI

### 1. "Sekarang saya pakai apa ya?"
Sistem backend yang berjalan saat ini menggunakan kombinasi:
1. **MediaPipe Pose Landmarker Lite (`pose_landmarker_lite.task` ~5.7 MB):**
   - Deep Learning model dari Google yang mengekstrak **33 titik kerangka tubuh (keypoints 3D: X, Y, Z)** secara real-time.
   - Ringan, dirancang untuk CPU, waktu inferensi hanya **~25 - 35 milidetik per frame**.
2. **Biomechanics Kinematics & Adaptive Geometric Calibration (`PostureBackendV3`):**
   - Mengubah 33 titik keypoints menjadi metrik ergonomi:
     - **3D Cervical Sagittal Angle ($\theta_{\text{cervical}}$):** Sudut kemiringan leher terhadap bahu di sumbu Z untuk mendeteksi *Turtle Neck / Forward Head Posture*.
     - **Facial Vertical Pitch Ratio ($R_{\text{pitch}}$):** Rasio vertikal jarak mata-hidung terhadap hidung-bibir untuk membedakan mendongak (menengadah) vs menunduk.
     - **Shoulder Roll Angle:** Kemiringan bahu kanan vs kiri.
     - **Arm Activity Gate:** Toleransi saat tangan digerakkan/peregangan agar tidak salah dianggap bungkuk.
3. **Web Framework:**
   - **FastAPI (Python 3.13) + Uvicorn** asynchronous REST API server.

---

### 2. "ANN itu maksudnya apa ya?"
- **ANN (Artificial Neural Network / Jaringan Saraf Tiruan)** adalah model komputasi yang meniru cara kerja neuron di otak manusia.
- Terdiri dari:
  - **Input Layer:** Menerima data fitur (misal: koordinat keypoint).
  - **Hidden Layers:** Kumpulan node/neuron dengan bobot (*weights*) dan bias yang memproses pola non-linear (menggunakan fungsi aktivasi seperti ReLU).
  - **Output Layer:** Menghasilkan prediksi kelas (misal: Softmax probabilitas tegak, bungkuk, miring).
- **Di mana letak ANN dalam proyek ini?**
  - **MediaPipe Pose** itu sendiri dibangun di atas Neural Network (CNN / BlazePose) yang mengubah piksel kamera menjadi koordinat kerangka 3D.
  - Di riset Colab, Anda melatih ANN (MLP Classifier) di atas koordinat tersebut untuk mengklasifikasikan kelas postur statis.

---

### 3. "Terus selama ini saya melakukan di Colab buat apa untuk file ini? Apakah tuning harus dari Google Colab?"
- **JAWABAN: TIDAK! Tuning sistem ini TIDAK perlu dilakukan di Google Colab.**
- **Lalu fungsi Colab kemarin apa?**
  - **Fase Pembuktian Akademis (Riset UAS / Laporan):**
    Colab digunakan untuk melatih model klasifikasi pada dataset statis (seperti MultiPosture atau Roboflow) guna mendapatkan angka metrik laporan: **Akurasi (%), Precision, Recall, F1-Score, Confusion Matrix, dan Kurva Loss**.
  - **Kelemahan Model Colab jika dipakai langsung di Webcam:**
    Dataset foto statis di Colab tidak tahu posisi duduk Anda di laptop, jarak Anda ke meja, atau proporsi leher unik Anda. Model statis Colab gampang salah jika sudut laptop sedikit miring.
  - **Solusi di Backend Ini (Dynamic Personalized Calibration):**
    Backend menggunakan **kalibrasi adaptif**. Saat Anda duduk tegak di depan laptop Anda dan melakukan kalibrasi 3 detik, sistem merekam postur *spesifik Anda*.
- **Cara tuningnya sekarang:**
  Cukup ubah angka ambang batas (*thresholds*) di file lokal:  
  📁 [`model/posture_backend_v3_config.json`](file:///c:/Users/User/Desktop/Smester%205/bungkok_backend_camera/model/posture_backend_v3_config.json)  
  *Backend akan langsung membaca konfigurasi baru secara instan tanpa perlu melatih ulang.*

---

### 4. "Kenapa gak pakai YOLO dan kawan-kawan?"
1. **YOLO-Pose itu 2D, BUKAN 3D:**
   - YOLO-Pose hanya menghasilkan koordinat $(X, Y)$ di bidang gambar 2D datar.
   - Kamera laptop menatap Anda dari **depan**. Masalah utama postur laptop adalah **kepala maju ke arah layar (Turtle Neck)**. Pada bidang 2D, kepala maju terlihat seolah-olah tetap di tengah!
   - MediaPipe memberikan koordinat **$Z$ (depth/kedalaman)** dan pose world coordinates, sehingga jarak telinga ke bahu maju-mundur ($\Delta Z$) bisa dihitung secara 3D.
2. **Resource & Efisiensi Hardware Laptop:**
   - YOLO butuh framework PyTorch/ONNX yang besar (>500 MB) dan boros daya jika tanpa GPU NVIDIA (CUDA). Laptop akan cepat panas dan kipas berbunyi keras jika dipakai berjam-jam sebagai latar belakang.
   - MediaPipe Lite hanya **5.7 MB**, sangat hemat CPU, dan bisa memproses frame dalam ~30 milidetik di laptop standar sekalipun.
3. **Single-Person vs Multi-Person:**
   - YOLO didesain untuk mendeteksi puluhan orang sekaligus di jalanan/CCTV (*multi-person*).
   - Pengguna laptop hanya ada **1 orang** di depan webcam (*single-person ergonomi*). YOLO terlalu berlebihan (*overkill*).

---

### 5. "OpenCV dan lain-lain itu kenapa di projek ini tidak relevan?"
- OpenCV tradisional mengandalkan deteksi piksel warna (HSV, edge Canny, contour threshold).
- Jika pengguna berganti baju warna hitam, lampu kamar dimatikan, atau ada bayangan di tembok, deteksi contour OpenCV langsung gagal total (*false-positive* tinggi).
- Selain itu, fungsi GUI OpenCV seperti `cv2.imshow()` tidak dapat berjalan di browser web Next.js atau smartphone.

---

## BAGIAN 2: Cara Tuning Threshold di Backend

Buka file [`model/posture_backend_v3_config.json`](file:///c:/Users/User/Desktop/Smester%205/bungkok_backend_camera/model/posture_backend_v3_config.json). Berikut adalah parameter utama yang bisa diatur:

| Parameter | Default | Keterangan & Pengaruh |
| :--- | :---: | :--- |
| `max_cervical_angle_upright` | `14.0` | Sudut servikal leher maksimal (derajat). Jika lebih besar dari ini, dianggap *Forward Head* (kepala terlalu maju). Turunkan (misal `12.0`) jika ingin lebih ketat. |
| `max_ear_forward_z_upright` | `0.045` | Selisih kedalaman telinga ke bahu (meter). Jika telinga maju > 4.5 cm dari bahu, dianggap bungkuk ke depan. |
| `pitch_ratio_mendongak` | `0.78` | Rasio vertikal wajah. Jika $< 0.78$, pengguna dianggap menengadah / mendongak ke atas. |
| `pitch_ratio_menunduk` | `1.28` | Rasio vertikal wajah. Jika $> 1.28$, pengguna dianggap menunduk ke bawah. |
| `neck_drop_ratio` | `-0.14` | Toleransi penurunan leher relatif terhadap baseline tegak saat kalibrasi. |
| `shoulder_roll_max_deg` | `8.0` | Toleransi kemiringan bahu kanan-kiri (derajat) saat kalibrasi tegak. |

---

## BAGIAN 3: Kontrak REST API (Untuk Rekan Frontend)

Base URL: `http://localhost:8000` (atau IP server backend)

### 1. `GET /api/health`
Mengecek status backend dan model yang aktif.
- **Method:** `GET`
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "model": "BUNGKOK_BACKEND_V3_CALIBRATED",
  "model_status": "candidate",
  "model_version": "3.3.0-cervical-and-pitch-fix",
  "supported_modes": ["upper_body", "full_torso", "auto"],
  "active_calibrations": 0
}
```

---

### 2. `POST /api/detect` (Pre-Kalibrasi / Alignment Check)
Dipanggil secara periodik (misal tiap 250ms) dari frontend saat pengguna baru menyalakan kamera. Endpoint ini mengembalikan kerangka tubuh dan memeriksa apakah posisi pengguna sudah pas dan tegak untuk mulai kalibrasi.

- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body Form-Data:**
  - `image`: File gambar JPEG / PNG / WebP (1 frame dari video webcam)
  - `camera_mode`: `"upper_body"` (default untuk webcam depan laptop) atau `"full_torso"` (kamera samping)
- **Response `200 OK` (Contoh Posisi Pas):**
```json
{
  "status": "ok",
  "camera_mode": "upper_body",
  "is_upright": true,
  "alignment_feedback": "Posisi tegak dan seimbang! Siap kalibrasi.",
  "upper_shoulder_roll_deg": 3.4,
  "upper_cervical_angle_deg": 8.2,
  "upper_pitch_ratio": 0.94,
  "upper_is_arm_activity": false,
  "landmarks": [
    { "x": 0.51, "y": 0.32, "z": -0.15, "visibility": 0.99 },
    ...
  ]
}
```
- **Response `200 OK` (Contoh Posisi Belum Pas):**
```json
{
  "status": "ok",
  "camera_mode": "upper_body",
  "is_upright": false,
  "alignment_feedback": "Turunkan dagu, pandangan lurus sejajar layar (Jangan mendongak ke atas)",
  "upper_shoulder_roll_deg": 4.1,
  "upper_is_mendongak": true,
  "landmarks": [ ... ]
}
```
> **Panduan UI Frontend:**  
> Ketika `is_upright === true` bertahan konsisten selama 3 frame (sekitar 1 detik), frontend dapat otomatis memunculkan animasi countdown: `3.. 2.. 1.. 📸` lalu menembak endpoint `/api/calibrations`.

---

### 3. `POST /api/calibrations` (Simpan Baseline Postur Tegak)
Menyimpan baseline postur tubuh pengguna saat duduk tegak sempurna.
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body Form-Data:**
  - `images`: Minimal 3 file gambar tegak (bisa dikirim beruntun selama hitung mundur)
  - `camera_mode`: `"upper_body"` atau `"full_torso"`
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "calibration_id": "c3a9d4f0-46eb-460d-83b6-1eb836d5c58a",
  "camera_mode": "upper_body",
  "valid_samples": 3,
  "rejected_samples": [],
  "expires_in_seconds": 3600
}
```
> **Panduan Frontend:** Simpan `calibration_id` ini di state React/Next.js untuk digunakan pada setiap pemanggilan `/api/predict`.

---

### 4. `POST /api/predict` (Klasifikasi Postur Real-time / Sesi Latihan)
Dipanggil terus-menerus (misal interval 200 - 300ms) selama sesi monitoring/latihan postur berlangsung.
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body Form-Data:**
  - `calibration_id`: UUID dari hasil `/api/calibrations`
  - `image`: File frame gambar kamera saat ini
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "label": 0,
  "prediction": "tegak",
  "neck_drop_ratio": 0.02,
  "pitch_ratio": 0.95,
  "cervical_angle_deg": 8.5,
  "cervical_delta": 1.2,
  "ear_z_delta": 0.005,
  "shoulder_roll_deg": 2.1,
  "upper_is_arm_activity": false,
  "landmarks": [
    { "x": 0.51, "y": 0.32, "z": -0.15, "visibility": 0.99 },
    ...
  ]
}
```
- **Keterangan `prediction`:**
  - `"tegak"` (label 0): Postur duduk tegak dan proporsional. (Warna UI: Hijau `#22c55e`).
  - `"condong_depan"` (label 1): Kepala terlalu maju (*turtle neck*) atau leher melorot. (Warna UI: Merah `#ef4444`).
  - `"condong_belakang"` (label 2): Posisi mendongak ke atas atau rebahan ke belakang. (Warna UI: Kuning `#f59e0b`).
  - Jika `upper_is_arm_activity === true`: Pengguna sedang mengangkat tangan/peregangan, postur tidak dipenalti sebagai bungkuk. (Warna UI: Biru muda `#38bdf8`).

---

### 5. `DELETE /api/calibrations/{calibration_id}`
Menghapus session kalibrasi ketika pengguna menekan tombol "Berhenti" atau meninggalkan halaman.
- **Method:** `DELETE`
- **Response `200 OK`:**
```json
{
  "status": "deleted"
}
```

---

## BAGIAN 4: Indeks Landmark MediaPipe (Untuk Menggambar Garis Tulang)

Frontend dapat menggambar garis tulang pada `<canvas>` menggunakan indeks berikut:
- **Hidung:** `0`
- **Mata Kiri & Kanan:** `2, 5`
- **Telinga Kiri & Kanan:** `7, 8`
- **Bibir:** `9, 10`
- **Bahu Kiri & Kanan:** `11, 12`
- **Siku Kiri & Kanan:** `13, 14`
- **Pergelangan Tangan Kiri & Kanan:** `15, 16`
- **Pinggul Kiri & Kanan (jika mode samping):** `23, 24`

### Pasangan Garis Koneksi Tulang:
- **Wajah:** `(0-1)`, `(1-2)`, `(2-3)`, `(3-7)` dan `(0-4)`, `(4-5)`, `(5-6)`, `(6-8)`
- **Bahu:** `(11-12)`
- **Tulang Leher (Cervical Spine):** Garis dari Hidung (`0`) ke Titik Tengah Bahu (`(11 + 12) / 2`)
- **Lengan Kiri:** `(11-13)`, `(13-15)`
- **Lengan Kanan:** `(12-14)`, `(14-16)`

