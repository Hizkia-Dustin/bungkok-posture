# Panduan Development dan Isi PPT Progress

## Sistem Klasifikasi Postur Duduk — Next.js + FastAPI

Dokumen ini menjadi panduan pengembangan aplikasi sekaligus bahan membuat PPT report progress. Report mencakup jurnal acuan, metodologi, progres model, rancangan frontend–backend, dan pekerjaan berikutnya.

---

## 1. Target aplikasi

Aplikasi menerima gambar dari webcam dan memberikan salah satu hasil:

- `Tegak`
- `Condong depan`
- `Condong belakang`
- `Ditolak`, jika gambar tidak memenuhi syarat

Sebelum prediksi, pengguna melakukan kalibrasi menggunakan minimal tiga foto tegak pada kamera yang sama.

Sistem hanya mengklasifikasikan pose yang terlihat kamera. Sistem **bukan alat diagnosis medis**.

---

## 2. Tech stack

### Frontend

- **Next.js** dengan App Router
- **React**
- **TypeScript**
- Browser `MediaDevices/getUserMedia` untuk webcam
- CSS Modules atau Tailwind CSS; pilih salah satu, tidak perlu keduanya
- `fetch` bawaan browser untuk komunikasi API

### Backend

- **Python 3.11**
- **FastAPI** untuk REST API
- **Uvicorn** sebagai server development
- **MediaPipe Pose Landmarker** untuk landmark tubuh
- **NumPy** untuk perhitungan fitur
- `posture_backend_v3.py` sebagai mesin klasifikasi yang sudah tersedia
- `posture_backend_v3_config.json` sebagai konfigurasi threshold dan guard

### Penyimpanan MVP

- Kalibrasi disimpan sementara di memori backend berdasarkan `calibration_id`.
- Gambar disimpan sebagai file sementara lalu dihapus setelah prediksi.
- Belum menggunakan database.

Database baru diperlukan jika aplikasi harus menyimpan akun, histori, laporan, atau kalibrasi secara permanen.

### Apakah database memengaruhi model?

Tidak secara langsung. Prediksi tetap sama, baik hasil dan kalibrasi disimpan di database maupun hanya disimpan sementara di memori.

| Kebutuhan | Perlu database? | Pengaruh ke prediksi model |
|---|---:|---|
| Prediksi satu foto | Tidak | Tidak ada |
| Kalibrasi selama aplikasi aktif | Tidak | Kalibrasi dapat disimpan di memori |
| Kalibrasi tetap ada setelah server restart | Ya | Hanya menjaga data kalibrasi tetap tersedia |
| Akun pengguna | Ya | Tidak ada |
| Histori postur dan grafik harian | Ya | Tidak ada |
| Laporan untuk pengguna | Ya | Tidak ada |
| Mengumpulkan dataset berlabel untuk retraining | Ya atau penyimpanan file lain | Dapat membantu versi model berikutnya setelah data divalidasi |

Keputusan MVP:

> Tidak memakai database. Kalibrasi disimpan di memori dengan masa berlaku, misalnya 60 menit. Jika server restart, pengguna melakukan kalibrasi ulang.

Database dapat ditambahkan pada fase berikutnya jika aplikasi membutuhkan akun dan histori. Pilihan sederhana pada saat itu adalah PostgreSQL. Jangan menyimpan foto pengguna secara permanen tanpa persetujuan yang jelas.

### Deployment awal

- Frontend Next.js: lokal terlebih dahulu, kemudian dapat dipasang di Vercel.
- Backend FastAPI dan model MediaPipe: lokal, VPS, Railway, Render, atau layanan container lain yang mendukung Python.
- Untuk demo paling aman, jalankan frontend dan backend pada laptop yang sama.

---

## 3. Mengapa Next.js dan FastAPI dipisah

Next.js bertanggung jawab untuk:

- Mengakses webcam.
- Mengambil foto kalibrasi.
- Menampilkan status kamera.
- Mengirim gambar ke backend.
- Menampilkan prediksi dan peringatan.
- Menyimpan riwayat singkat pada tampilan.

FastAPI bertanggung jawab untuk:

- Menerima gambar.
- Menjalankan MediaPipe.
- Memeriksa apakah input valid.
- Membuat baseline kalibrasi.
- Menghitung fitur postur.
- Menentukan kelas postur.
- Mengembalikan hasil dalam JSON.

Alasan pemisahan:

> Kode model V3 sudah tersedia dalam Python. Memindahkan seluruh model ke JavaScript sekarang akan menambah pekerjaan dan berisiko menghasilkan perbedaan perhitungan.

---

## 4. Arsitektur sistem

```text
┌──────────────────────────────────────┐
│ Next.js Frontend                     │
│                                      │
│ Webcam → Capture → Preview           │
│               ↓                      │
│       FormData berisi gambar         │
└──────────────────┬───────────────────┘
                   │ HTTP/REST
                   ▼
┌──────────────────────────────────────┐
│ FastAPI Backend                      │
│                                      │
│ Validasi file                        │
│      ↓                               │
│ MediaPipe Pose Landmarker            │
│      ↓                               │
│ Landmark → fitur geometri            │
│      ↓                               │
│ Kalibrasi + aturan kandidat V3       │
│      ↓                               │
│ Label atau alasan penolakan          │
└──────────────────┬───────────────────┘
                   │ JSON
                   ▼
┌──────────────────────────────────────┐
│ Tampilan hasil                       │
│ Tegak / Depan / Belakang / Ditolak   │
└──────────────────────────────────────┘
```

---

## 5. Alur pengguna

### A. Membuka aplikasi

1. Pengguna membuka halaman deteksi.
2. Browser meminta izin webcam.
3. Frontend menampilkan panduan posisi kamera.
4. Pengguna harus duduk dan memastikan bahu, pinggul, serta bagian lutut terlihat.

### B. Kalibrasi

1. Pengguna duduk tegak.
2. Frontend mengambil tiga gambar dengan jeda singkat.
3. Ketiga gambar dikirim ke endpoint kalibrasi.
4. Backend memvalidasi setiap gambar.
5. Backend menghitung median `torso_forward_ratio`.
6. Backend mengembalikan `calibration_id`.

### C. Prediksi

1. Frontend mengambil snapshot webcam setiap 1–2 detik.
2. Gambar dan `calibration_id` dikirim ke backend.
3. Backend menjalankan prediksi.
4. Frontend menampilkan label, status, atau alasan penolakan.
5. Hasil beberapa prediksi terakhir digunakan untuk smoothing tampilan.

### D. Selesai

1. Pengguna menghentikan deteksi.
2. Frontend menghentikan webcam dan timer.
3. Frontend meminta backend menghapus sesi kalibrasi.

---

## 6. Kontrak input model

Input yang didukung:

- Tepat satu orang.
- Posisi duduk.
- Kamera dari depan atau menyerong maksimal sekitar 45°.
- Bahu dan pinggul terlihat.
- Sebagian lutut terlihat.
- Kamera tidak berubah posisi setelah kalibrasi.

Input yang harus ditolak:

- Tidak ada orang.
- Lebih dari satu orang.
- Orang berdiri.
- Tampak samping 90°.
- Pinggul tertutup meja atau benda lain.
- Landmark tidak terbaca dengan cukup baik.
- File bukan gambar atau ukuran file melebihi batas.

---

## 7. Rancangan API FastAPI

### `GET /api/health`

Memeriksa apakah backend dan model berhasil dimuat.

Contoh response:

```json
{
  "status": "ok",
  "model": "BUNGKOK_BACKEND_V3_CALIBRATED",
  "version": "3.0.0-candidate"
}
```

### `POST /api/calibrations`

Menerima minimal tiga gambar tegak dengan `multipart/form-data`.

Field:

- `images`: tiga atau lebih file gambar

Contoh response berhasil:

```json
{
  "status": "ok",
  "calibration_id": "uuid-session",
  "valid_samples": 3,
  "rejected_samples": []
}
```

Contoh response gagal:

```json
{
  "status": "error",
  "message": "Kalibrasi membutuhkan minimal tiga foto tegak valid"
}
```

### `POST /api/predict`

Menerima satu gambar dan ID kalibrasi.

Field:

- `image`: file gambar
- `calibration_id`: ID dari proses kalibrasi

Contoh hasil prediksi:

```json
{
  "status": "ok",
  "prediction": "condong_depan",
  "label": 1,
  "confidence": null,
  "decision_margin": 0.14
}
```

`decision_margin` bukan probabilitas dan tidak boleh ditampilkan sebagai persentase keyakinan.

Contoh hasil ditolak:

```json
{
  "status": "rejected",
  "prediction": "tidak_yakin",
  "label": null,
  "reason": "Bahu atau pinggul kurang terlihat"
}
```

### `DELETE /api/calibrations/{calibration_id}`

Menghapus data kalibrasi ketika sesi deteksi selesai.

---

## 8. Struktur folder yang disarankan

```text
bungkok-app/
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── CameraView.tsx
│   │   ├── CalibrationPanel.tsx
│   │   ├── PredictionCard.tsx
│   │   └── StatusGuide.tsx
│   ├── hooks/
│   │   └── usePostureCamera.ts
│   ├── lib/
│   │   └── posture-api.ts
│   ├── types/
│   │   └── posture.ts
│   ├── public/
│   ├── .env.local
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   └── session_store.py
│   ├── model/
│   │   ├── posture_backend_v3.py
│   │   ├── posture_backend_v3_config.json
│   │   └── pose_landmarker_lite.task
│   ├── tests/
│   │   └── test_api.py
│   ├── requirements.txt
│   └── README.md
│
├── docs/
│   ├── evaluation.md
│   └── api.md
└── README.md
```

Jangan membuat microservice, database, autentikasi, dan dashboard admin pada versi pertama.

---

## 9. Komponen frontend Next.js

### `CameraView`

Tanggung jawab:

- Meminta izin webcam.
- Menampilkan elemen `<video>`.
- Menggambar frame ke `<canvas>`.
- Mengubah canvas menjadi `Blob` JPEG.
- Mengirim blob ke fungsi kalibrasi atau prediksi.

### `CalibrationPanel`

Tanggung jawab:

- Memberikan instruksi duduk tegak.
- Menampilkan hitung mundur.
- Mengambil tiga gambar.
- Menampilkan jumlah gambar valid.
- Menyimpan `calibration_id` di state React.

### `PredictionCard`

Tanggung jawab:

- Menampilkan hasil terakhir.
- Warna hijau untuk tegak.
- Warna oranye untuk condong depan/belakang.
- Warna abu-abu atau merah untuk input ditolak.
- Menampilkan alasan penolakan dalam bahasa sederhana.

### `StatusGuide`

Tanggung jawab:

- Menampilkan apakah backend tersedia.
- Memberi panduan jika kamera terlalu samping atau tubuh tertutup.
- Menjelaskan bahwa sistem bukan diagnosis medis.

### `usePostureCamera`

Hook ini mengelola:

- `MediaStream` webcam.
- Status izin kamera.
- Timer pengambilan snapshot.
- Status kalibrasi.
- Prediksi terakhir.
- Pembersihan stream dan timer ketika halaman ditutup.

---

## 10. State utama frontend

```ts
type AppPhase =
  | "camera_permission"
  | "ready_to_calibrate"
  | "calibrating"
  | "ready"
  | "predicting"
  | "error";
```

State minimum:

- `phase`
- `cameraStream`
- `calibrationId`
- `prediction`
- `rejectionReason`
- `isBackendReady`
- `recentPredictions`

Tidak perlu global state library untuk MVP. React state dan custom hook sudah cukup.

---

## 11. Smoothing prediksi

Jangan langsung mengubah tampilan berdasarkan satu frame karena landmark dapat bergetar.

Versi pertama:

1. Simpan lima hasil valid terakhir.
2. Abaikan hasil `rejected` dari voting kelas.
3. Tampilkan kelas yang muncul minimal tiga kali dari lima hasil.
4. Jika belum ada mayoritas, tampilkan “Mengamati postur”.
5. Berikan peringatan hanya jika postur condong bertahan, misalnya 10–20 detik.

Durasi peringatan harus menjadi parameter yang dapat diuji, bukan klaim medis.

---

## 12. Keamanan dan privasi

- Batasi tipe file ke JPEG/PNG/WebP.
- Batasi ukuran file, misalnya 5 MB.
- Gunakan nama file acak, bukan nama asli dari pengguna.
- Simpan gambar hanya di folder sementara.
- Hapus gambar setelah proses selesai, termasuk ketika terjadi error.
- Jangan menyimpan foto atau video tanpa persetujuan pengguna.
- Jangan mencatat gambar di log.
- Gunakan HTTPS ketika aplikasi dipasang online agar akses webcam browser bekerja dengan aman.
- Batasi CORS hanya ke alamat frontend.
- Tampilkan disclaimer bahwa hasil bukan diagnosis medis.

---

## 13. Environment variable

Frontend `.env.local`:

```env
NEXT_PUBLIC_POSTURE_API_URL=http://localhost:8000
```

Backend `.env` jika diperlukan:

```env
FRONTEND_ORIGIN=http://localhost:3000
MAX_UPLOAD_MB=5
CALIBRATION_TTL_MINUTES=60
```

Path model sebaiknya ditentukan dari lokasi proyek backend, bukan path Drive atau path laptop tertentu.

---

## 14. Tahapan coding

### Tahap 1 — Membungkus model sebagai API

Hasil yang harus tersedia:

- FastAPI dapat dijalankan.
- Model MediaPipe dimuat sekali saat backend mulai.
- Endpoint health berfungsi.
- Endpoint kalibrasi menerima tiga foto.
- Endpoint predict mengembalikan JSON.
- File sementara selalu dibersihkan.

Status: **belum dikerjakan sebagai API**, tetapi mesin `PostureBackendV3` sudah tersedia.

### Tahap 2 — Membuat frontend Next.js

Hasil yang harus tersedia:

- Halaman utama dapat meminta izin webcam.
- Preview webcam tampil.
- Pengguna dapat mengambil tiga foto kalibrasi.
- Frontend dapat mengirim `FormData` ke FastAPI.
- Hasil prediksi muncul pada layar.

Status: **belum dikerjakan**.

### Tahap 3 — Prediksi berkala

Hasil yang harus tersedia:

- Snapshot dikirim setiap 1–2 detik.
- Request tidak tumpang tindih.
- Request berikutnya baru dikirim setelah request sebelumnya selesai.
- Lima hasil terakhir digunakan untuk smoothing.
- Alasan penolakan ditampilkan.

Status: **belum dikerjakan**.

### Tahap 4 — Pengujian pengguna baru

Hasil yang harus tersedia:

- Minimal 5 orang baru.
- Masing-masing 3 kelas × 3 foto.
- Total minimal 45 foto final holdout.
- Dataset final tidak dipakai untuk mengubah threshold.
- Laporkan confusion matrix, macro F1, dan recall setiap kelas.

Status: **belum dikerjakan**.

### Tahap 5 — Uji real-time

Ukur:

- Latensi request.
- Prediksi per menit.
- Stabilitas label.
- FPS preview webcam.
- Persentase input ditolak.
- Dampak pencahayaan dan jarak kamera.

Status: **belum dikerjakan**.

### Tahap 6 — Deployment demo

Hasil yang harus tersedia:

- Frontend dan backend dapat diakses melalui HTTPS.
- Variabel environment produksi terpasang.
- CORS dibatasi.
- File foto tidak tersimpan setelah prediksi.
- Ada halaman petunjuk dan disclaimer.

Status: **tahap akhir setelah pengujian lokal**.

---

## 15. Progress proyek saat ini

### Sudah selesai

- Audit dan persiapan dataset.
- Ekstraksi landmark MediaPipe.
- Baseline V1 dua kelas.
- Kandidat V2 tiga kelas.
- Evaluasi Roboflow dan MultiPosture.
- Pengujian foto eksternal.
- Analisis domain shift.
- Kalibrasi tegak kandidat V3.
- Guard untuk jumlah orang, visibility, dan posisi berdiri.
- Paket `posture_backend_v3.py` dan konfigurasi JSON.

### Sedang menuju implementasi

- FastAPI sebagai pembungkus backend V3.
- Next.js sebagai antarmuka webcam.
- Kontrak request/response API.

### Belum selesai

- Integrasi Next.js–FastAPI.
- Prediksi berkala dari webcam.
- Smoothing antar-prediksi.
- Final holdout orang nyata yang baru.
- Pengukuran latensi dan performa real-time.
- Deployment aplikasi demo.

---

## 16. Hasil model yang dapat dilaporkan

### Hasil internal V2

- Roboflow test accuracy: **93,1%**.
- Roboflow macro F1: **0,929**.
- MultiPosture test accuracy: **98,1%**.
- MultiPosture macro F1: **0,981**.

### Reality check foto eksternal V2

- Akurasi foto berlabel tiga kelas: **44,4%**.
- Keberhasilan penolakan input di luar syarat: **66,7%**.
- Banyak kesalahan memiliki confidence sangat tinggi.

### Kandidat backend V3

- Held-out Roboflow macro F1: **0,879**.
- Held-out MultiPosture macro F1: **0,902**.
- Foto eksternal terdeteksi: **94,1%**.
- Akurasi operasional development: **88,9%**.

Catatan wajib:

> Hasil foto eksternal V3 masih development metric dari data sintetis kecil. Hasil tersebut belum menggantikan final holdout pengguna nyata.

---

## 17. Jurnal acuan

Jurnal utama:

- Carneros-Prado dkk., IEEE Access, 2024.
- DOI: [10.1109/ACCESS.2024.3510034](https://doi.org/10.1109/ACCESS.2024.3510034)
- Dataset: MultiPosture.

Konsep yang diadaptasi:

- Landmark tubuh sebagai representasi postur.
- Pemanfaatan koordinat 3D.
- ANN/MLP untuk klasifikasi.
- Evaluasi yang memperhatikan pemisahan subjek.

Perbedaan:

| Aspek | Jurnal | Proyek ini |
|---|---|---|
| Target | Postur tubuh atas dan bawah | Tiga kelas batang tubuh |
| Input | 33 koordinat dari 11 sendi | Empat fitur geometri utama |
| Data | MultiPosture | Roboflow + MultiPosture + foto eksternal |
| Model | MLP dibandingkan KAN | ANN/MLP, lalu aturan V3 terkalibrasi |
| Penggunaan | Evaluasi dataset | Target integrasi aplikasi webcam |
| Validasi input | Fokus klasifikasi dataset | Menolak berdiri, samping, tertutup, dan multi-orang |
| Tambahan | — | Kalibrasi per kamera/pengguna dan paket backend |

---

## 18. Susunan PPT report progress

### Slide 1 — Judul

**Pengembangan Prototipe Klasifikasi Postur Duduk Tiga Kelas Berbasis MediaPipe, Next.js, dan FastAPI**

Subjudul:

> Report progress model, kandidat backend V3, dan rencana integrasi webcam.

### Slide 2 — Masalah dan tujuan

- Mengapa postur duduk perlu dipantau.
- Mengapa menggunakan webcam.
- Target tiga kelas.
- Sistem bukan diagnosis medis.

### Slide 3 — Jurnal acuan

- Nama jurnal, penulis, tahun, DOI.
- Dataset dan metode jurnal.
- Bagian yang diadaptasi.

### Slide 4 — Perbedaan jurnal dan proyek

Gunakan tabel pada bagian 17.

### Slide 5 — Metodologi model

```text
Gambar → MediaPipe → landmark → fitur → klasifikasi → hasil
```

### Slide 6 — Dataset

- Roboflow: 938 gambar.
- MultiPosture: 4.800 frame, 13 partisipan.
- Jelaskan train, validation, dan test.

### Slide 7 — Evolusi V1 sampai V3

- V1: baseline dua kelas.
- V2: tiga kelas dan dua dataset.
- V3: kalibrasi dan penolakan input.

### Slide 8 — Hasil internal

- Tampilkan accuracy dan macro F1 V2.
- Gunakan grafik batang sederhana.

### Slide 9 — Masalah pada foto eksternal

- V2 hanya 44,4% pada foto berlabel eksternal.
- Jelaskan domain shift.
- Tampilkan contoh benar dan salah.

### Slide 10 — Perbaikan kandidat V3

- Minimal tiga foto tegak.
- Baseline median.
- Kamera tetap.
- Input yang tidak layak ditolak.

### Slide 11 — Arsitektur aplikasi

Tampilkan diagram:

```text
Next.js Webcam → FastAPI → MediaPipe/V3 → JSON → Next.js UI
```

### Slide 12 — Tech stack

- Next.js, React, TypeScript.
- FastAPI, MediaPipe, NumPy.
- REST API dan `multipart/form-data`.
- Tidak memakai database pada MVP.

### Slide 13 — Progress implementasi

Gunakan tiga kolom:

| Selesai | Berikutnya | Belum final |
|---|---|---|
| Model V1–V3 | API FastAPI | Final holdout |
| Evaluasi internal | Webcam Next.js | Uji real-time |
| Backend candidate | Integrasi API | Deployment |

### Slide 14 — Rencana kerja

1. FastAPI wrapper.
2. UI webcam Next.js.
3. Kalibrasi dan prediksi.
4. Smoothing.
5. Final holdout.
6. Pengujian real-time.
7. Deployment demo.

### Slide 15 — Kesimpulan

> Model dan kandidat backend sudah tersedia. Progres berikutnya adalah membungkusnya sebagai FastAPI, menghubungkannya ke webcam Next.js, lalu memvalidasi sistem menggunakan orang nyata yang belum pernah digunakan untuk tuning.

---

## 19. Kriteria aplikasi dapat disebut selesai

Aplikasi belum selesai hanya karena webcam sudah menampilkan label.

Kriteria minimum:

- Kalibrasi tiga foto berjalan.
- Input di luar syarat dapat ditolak.
- Webcam tidak mengalami request tumpang tindih.
- File sementara selalu dihapus.
- Smoothing mengurangi label yang berkedip.
- Final holdout minimal 45 foto selesai.
- Macro F1 minimal 0,80.
- Recall setiap kelas minimal 0,75.
- Penolakan input di luar syarat minimal 90%.
- Latensi dan perangkat pengujian dilaporkan.
- Disclaimer bukan diagnosis medis terlihat.

---

## 20. Prioritas pengerjaan

Urutan yang paling aman:

1. Pastikan backend V3 dapat memprediksi satu foto lokal.
2. Buat tiga endpoint FastAPI.
3. Uji endpoint menggunakan foto, belum webcam.
4. Buat Next.js dengan tombol ambil foto.
5. Tambahkan kalibrasi tiga foto.
6. Setelah stabil, tambahkan prediksi otomatis setiap 1–2 detik.
7. Tambahkan smoothing dan timer peringatan.
8. Lakukan final holdout.
9. Baru lakukan deployment.

Jangan langsung membuat streaming video atau WebSocket. Snapshot berkala sudah cukup untuk MVP dan lebih mudah dievaluasi.

---

## 21. Kalimat laporan progress

> Sampai tahap ini, penelitian telah menghasilkan pipeline ekstraksi pose, model tiga kelas, evaluasi pada dua dataset, analisis kegagalan pada foto eksternal, serta kandidat backend V3 dengan kalibrasi dan input rejection. Tahap implementasi aplikasi berikutnya menggunakan Next.js untuk antarmuka webcam dan FastAPI untuk menjalankan MediaPipe serta klasifikasi V3. Sistem belum dinyatakan final karena integrasi webcam, final holdout pengguna baru, dan pengujian performa real-time masih harus diselesaikan.

