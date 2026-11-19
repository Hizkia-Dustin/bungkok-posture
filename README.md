# 🧘 BUNGKOK — Real-Time Ergonomic Sitting Posture Detection

> **BUNGKOK** adalah sistem pemantauan postur duduk membungkuk secara *real-time* berbasis **Computer Vision (MediaPipe 3D Keypoints)** dan **Artificial Neural Network (ANN)** dengan dukungan **Dual-POV Camera** (Webcam Laptop + Smartphone via WebRTC QR Code).

---

## ✨ Fitur Utama

1. **Dual-POV Posture Tracking:**
   * **POV Depan (`upper_body`):** Webcam laptop untuk memantau kelurusan kepala, leher, kompresi servikal, dan *Forward Head Posture* (FHP).
   * **POV Samping (`full_torso`):** Smartphone sebagai kamera samping nirkabel via **scan QR Code** (WebRTC P2P) tanpa perlu menginstal aplikasi di HP.
2. **AI & Biomechanical Feature Extraction:**
   * Ekstraksi 33 titik sendi 3D MediaPipe BlazePose.
   * 6 Vektor Geometris Biomekanika ($f_1$ s/d $f_6$) yang dinormalisasi terhadap lebar bahu ($W_{sh}$).
   * Klasifikasi cerdas ANN + Random Forest baseline (akurasi 93,1% – 98,1%).
3. **Smart-Calib 5 Detik:**
   * Rekam acuan postur tegak netral personal pengguna untuk menghindari *false alarm*.
4. **Interactive Dashboard & Background Alert:**
   * Pratinjau kamera real-time dengan kanvas *skeleton tracking* adaptif (Hijau = Tegak, Merah = Bungkuk).
   * Peringatan audio ramah dan popup Picture-in-Picture (PiP) saat berpindah tab.

---

## 🚀 Panduan Memakai Aplikasi

### 1. Prasyarat Sistem
* Node.js $\ge$ 18 & npm
* Python $\ge$ 3.10
* Browser modern (Google Chrome / Edge / Safari)

---

### 2. Menjalankan Backend (FastAPI + MediaPipe)
```powershell
# Masuk ke folder backend
cd bungkok_backend_camera

# Buat virtual environment (jika belum ada)
python -m venv .venv
.\.venv\Scripts\activate

# Install dependensi
pip install -r requirements.txt

# Jalankan server
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
Server backend akan aktif di: `http://localhost:8000`.

---

### 3. Menjalankan Frontend (React + Vite)
```powershell
# Buka terminal baru, masuk ke folder frontend
cd bungkok_frontend

# Install dependensi
npm install

# Jalankan frontend
npm run dev
```
Buka browser di: `http://localhost:5173`.

---

### 📱 4. Cara Menggunakan Kamera Samping HP (QR Code)

1. Di web BUNGKOK, klik menu **Mulai Latihan**.
2. Pilih radio button **"Samping"**.
3. Modal **QR Code** akan otomatis terbuka di layar laptop.
4. Buka kamera di smartphone Anda, lalu **scan QR Code** di layar laptop.
5. Browser HP akan langsung membuka kamera belakang dan mengalirkan video secara *real-time* ke laptop via WebRTC P2P (bisa menggunakan koneksi Wi-Fi maupun kuota 4G/5G).
6. Letakkan smartphone di samping meja berjarak 1 – 1.5 meter sejajar bahu/pinggul.
7. Lanjutkan ke tahap **Kalibrasi 5 Detik**, dan mulai sesi latihan!

---

## 📁 Struktur Direktori Proyek

```
VISCOM/
├── bungkok_frontend/          # Web Client (React 18 + Vite + GSAP + PeerJS)
│   ├── src/
│   │   ├── components/        # Komponen UI, Dialog, & Modal QR Code
│   │   ├── pages/             # Dashboard, Latihan, & MobileSideCamera (/cam/side)
│   │   └── services/          # Posture API & WebRTC Peer Service
│   └── public/                # Aset gambar, font, & icon
├── bungkok_backend_camera/    # API Server (FastAPI + MediaPipe + SQLite/Postgres)
│   ├── model/                 # Model MediaPipe Lite & Config V3
│   ├── tests/                 # Unit test Pytest (10 passed)
│   ├── app.py                 # Endpoint API (/detect, /calibrations, /predict)
│   └── Dockerfile             # Konfigurasi container produksi
├── figma_designs/             # Desain SVG & Mockup UI
└── README.md                  # Panduan Proyek & Dokumentasi Utama
```

---

## 👥 Kelompok 16
* **Muhammad Dzaky** - `J0403241010`
* **Alif Al Fitrah** - `J0403231017`
* **Hizkia Dustin Sitepu** - `J0403241019`
