# Bahan Presentasi & Naskah Slide Progress UAS
## Klasifikasi Postur Duduk Realtime Berbasis MediaPipe 3D & FastAPI

Dokumen ini disusun sebagai panduan isi slide presentasi PowerPoint / Canva beserta **naskah yang harus diucapkan (*speaker notes*)** di depan dosen penguji. 

Alur presentasi ini dirancang agar menonjolkan **kedalaman riset (R&D di Colab)** dan **keberhasilan implementasi nyata (Backend Webcam Realtime)**.

---

### Slide 1 — Judul Proyek
- **Judul**: Pengembangan Prototipe Klasifikasi Postur Duduk Tiga Kelas Berbasis Keypoint 3D MediaPipe dan Kalibrasi Adaptif untuk Integrasi Webcam
- **Subjudul**: Laporan Progres Riset Model, Evaluasi Domain Shift, dan Implementasi Backend Kamera Realtime
- **Identitas**: Nama Anggota, NIM, Kelas, Mata Kuliah (Visual Komputer Cerdas / Semester 5)
- **Status Proyek**: Tahap Implementasi Kandidat V3.3 Dual-Mode

> 🗣️ **Naskah Presentasi (Speaker Notes):**  
> *"Selamat pagi/siang Bapak/Ibu dosen penguji. Pada kesempatan ini, kami mempresentasikan progres proyek kami, yaitu pengembangan sistem klasifikasi postur duduk tiga kelas menggunakan titik tubuh 3D MediaPipe. Proyek ini berfokus pada masalah kebiasaan postur duduk saat bekerja di depan komputer, dengan memanfaatkan webcam bawaan tanpa memerlukan sensor perangkat keras tambahan yang mahal."*

---

### Slide 2 — Latar Belakang & Masalah
- **Masalah**:
  - Duduk lama di depan laptop sering memicu *Forward Head Posture* (leher maju / *turtle neck*), punggung membungkuk, atau posisi miring tanpa disadari.
  - Pengamatan manual sulit dilakukan terus-menerus.
  - Webcam laptop adalah sensor yang murah dan mudah diakses, namun memiliki tantangan besar: variasi jarak, sudut kamera, pencahayaan, dan bentuk tubuh setiap orang berbeda-beda.
- **Batasan Penting**:
  - Sistem ini mengklasifikasikan bentuk pose duduk yang tertangkap kamera, **bukan alat diagnosis medis kifosis atau kelainan tulang belakang**.

> 🗣️ **Naskah Presentasi:**  
> *"Kebiasaan postur duduk buruk seperti membungkuk dan leher maju sering terjadi tanpa disadari saat seseorang bekerja di depan laptop. Webcam adalah sensor yang paling ekonomis untuk memantau postur. Namun, tantangan terbesarnya adalah sudut kamera dan proporsi tubuh setiap orang sangat bervariasi. Komputer tidak bisa langsung menebak 'bungkuk' hanya dari gambar mentah tanpa pemahaman geometri anatomi tubuh."*

---

### Slide 3 — Jurnal Acuan Ilmiah
- **Jurnal Utama**:
  - **Penulis**: Carneros-Prado, dkk.
  - **Publikasi**: *IEEE Access*, 2024.
  - **DOI**: `10.1109/ACCESS.2024.3510034`
  - **Dataset Acuan**: *MultiPosture Dataset* (13 partisipan, 4.800 frame, 11 sendi 3D).
- **Hal yang Diadaptasi**:
  - Pemanfaatan keypoint sendi tubuh 3D $(x, y, z)$ dari MediaPipe Pose.
  - Evaluasi pemisahan data berdasarkan subjek (*Subject-wise split*) untuk mencegah data leakage.
- **Pengembangan Baru oleh Tim Kami**:
  - Menambahkan kalibrasi tegak personal (*user-adaptive baseline*).
  - Mengembangkan mode khusus tubuh atas (*Upper Body Mode*) agar tetap bekerja saat pinggul dan lutut tertutup meja kerja.

> 🗣️ **Naskah Presentasi:**  
> *"Riset kami mengacu pada jurnal IEEE Access tahun 2024 oleh Carneros-Prado dkk. yang meneliti klasifikasi postur tubuh menggunakan keypoint MediaPipe. Dari jurnal tersebut, kami mengadopsi representasi koordinat 3D sendi tubuh. Namun, kami mengembangkan sistem ini lebih jauh dengan menambahkan mekanisme kalibrasi dinamis dan biomekanika tubuh atas agar dapat digunakan di meja kerja nyata di mana bagian pinggul tertutup meja."*

---

### Slide 4 — Perjalanan Riset di Google Colab: V1 ➔ V2 ➔ Reality Check
- **Eksperimen di Colab (Tahap Riset)**:
  - **Model V1**: Klasifikasi biner (Tegak vs Bungkuk) menggunakan dataset Roboflow.
  - **Model V2**: Klasifikasi 3 kelas (*Tegak*, *Condong Depan*, *Condong Belakang*) menggunakan *Artificial Neural Network* (ANN/MLP) di Google Colab.
- **Hasil Awal di Colab (Sangat Tinggi)**:
  - Roboflow Test Accuracy: **93,1%** (Macro F1: **0,929**).
  - MultiPosture Test Accuracy: **98,1%** (Macro F1: **0,981**).
- **Temuan Kritis (*Reality Check*)**:
  - Saat model ANN V2 diuji menggunakan foto eksternal orang nyata di kamera laptop berbeda, akurasinya anjlok ke **44,4%**!
  - **Penyebab**: Terjadi *Domain Shift* — model ANN kaku di Colab overfit terhadap sudut kamera dan jarak partisipan di dataset statis.

> 🗣️ **Naskah Presentasi:**  
> *"Di Google Colab, kami awalnya melatih model ANN/MLP dan memperoleh akurasi pengujian yang sangat tinggi, yaitu 98%. Namun, kami tidak berhenti di angka di atas kertas. Saat kami menguji model tersebut dengan foto orang nyata di kamera laptop kami, akurasinya anjlok ke 44%. Fenomena ini disebut 'domain shift', di mana neural network kaku tidak mampu beradaptasi ketika sudut kamera pengguna berbeda dari foto dataset di Colab."*

---

### Slide 5 — Terobosan Kandidat V3: Kalibrasi Personal & Biomekanika 3D
- **Solusi dari Evaluasi Colab**:
  - Mengganti model ANN statis dengan **Aturan Geometri 3D Terkalibrasi (*Calibrated Rule-Based Biomechanics*)**.
- **Cara Kerja Kalibrasi**:
  1. Pengguna mengambil 3 foto duduk tegak di awal sesi.
  2. Sistem menyimpan *baseline* individual pengguna: rasio panjang leher, sudut servikal, dan kesejajaran bahu.
  3. Prediksi dihitung berdasarkan **perubahan relatif (*delta*) terhadap posisi tegak pengguna sendiri**, bukan membandingkannya dengan orang asing di dataset.
- **Hasil Evaluasi V3**:
  - Held-out Roboflow Macro F1: **0,8786**
  - Held-out MultiPosture Macro F1: **0,9022**
  - Akurasi foto nyata terkontrol: **88,9% – 94,1%**

> 🗣️ **Naskah Presentasi:**  
> *"Berdasarkan kegagalan model statis tersebut, kami merancang kandidat V3. Kuncinya adalah kalibrasi personal: sebelum prediksi dimulai, sistem mengambil 3 snapshot posisi tegak pengguna untuk dijadikan baseline. Dengan cara ini, perbedaan bentuk tubuh, tinggi badan, dan sudut kemiringan laptop otomatis terkompensasi."*

---

### Slide 6 — Inovasi Dual-Mode: Webcam Depan vs Kamera Samping
- **Masalah Nyata di Meja Kerja**:
  - Kamera samping ideal untuk melihat kelengkungan punggung dan pinggul, tetapi pengguna jarang memiliki tripod/kamera tambahan.
  - Webcam laptop hanya menangkap **Tubuh Atas (*Upper Body*)**: Kepala, Leher, dan Bahu. Bagian pinggul dan lutut tertutup meja kerja.
- **Arsitektur Dual-Mode**:
  1. **Mode Webcam Depan (`upper_body`)**:
     - Memantau sudut leher servikal, pitch wajah, dan kemiringan bahu. Pinggul tertutup meja tidak lagi ditolak.
  2. **Mode Kamera Samping (`full_torso`)**:
     - Memantau kemiringan batang tubuh (*torso inclination*) penuh terhadap pinggul.
  3. **Mode Otomatis (`auto`)**:
     - Sistem otomatis beralih mode berdasarkan sendi tubuh yang terlihat di kamera.

> 🗣️ **Naskah Presentasi:**  
> *"Dalam pengujian meja kerja nyata, kami menemukan masalah krusial: backend sebelumnya selalu menolak frame karena pinggul tertutup meja laptop. Oleh karena itu, kami menciptakan Dual-Mode: Mode Webcam Depan yang khusus menganalisis kepala, leher, dan bahu tanpa membutuhkan pinggul, serta Mode Kamera Samping jika pengguna memakai kamera eksternal."*

---

### Slide 7 — Solusi Masalah Nyata: Turtle Neck, Mendongak, & Angkat Tangan
Tiga penyempurnaan utama hasil pengujian langsung:
1. **Deteksi *Forward Head Posture* (Leher Maju / *Turtle Neck*)**:
   - Memantau sudut 3D leher-ke-telinga (*Cervical Sagittal Angle*).
   - Jika kepala maju lebih dari $14^\circ$, sistem langsung menandai *Condong Depan* meskipun badan masih tegak.
2. **Deteksi Mendongak ke Atas (*Facial Vertical Pitch*)**:
   - Membandingkan rasio vertikal wajah (Mata–Hidung vs Hidung–Mulut).
   - Jika kepala mendongak ke langit-langit (rasio $< 0.78$), sistem menandai *Condong Belakang*.
3. **Toleransi Peregangan Tangan (*Arm Activity*)**:
   - Mengangkat tangan untuk peregangan/garuk kepala tidak lagi dianggap bungkuk palsu (*false positive*).

> 🗣️ **Naskah Presentasi:**  
> *"Saat kami menguji sistem pada pengguna, kami menemukan tiga kasus unik: pertama, pengguna memajukan kepala seperti kura-kura tetapi badannya tetap tegak. Kami menyelesaikannya dengan mengukur sudut servikal 3D telinga terhadap bahu. Kedua, saat kepala mendongak ke atas, kami mendeteksinya lewat rasio vertikal mata-hidung-mulut. Ketiga, saat pengguna mengangkat tangan untuk peregangan, sistem cerdas membedakannya sehingga tidak salah menghukum sebagai postur bungkuk."*

---

### Slide 8 — Rekayasa Stabilitas: Anti-Gemetar (*Landmark Smoothing*)
- **Tantangan Noise Kamera**:
  - Koordinat sendi MediaPipe di webcam bergeser $\pm 5\text{--}10$ piksel antar-frame (*jitter*), menyebabkan garis kerangka bergetar dan status berkedip.
- **Penerapan Algoritma Penghalusan**:
  1. **Landmark EMA Smoothing**:
     $$L_{\text{smooth}}(t) = 0.65 \cdot L(t) + 0.35 \cdot L_{\text{smooth}}(t-1)$$
     Garis kerangka menjadi sangat halus (*silky smooth*) di layar.
  2. **Majority Voting Temporal (5 Frame)**:
     Status postur hanya berganti jika minimal 3 dari 5 frame konsisten, mencegah status berkedip (*flickering*).

> 🗣️ **Naskah Presentasi:**  
> *"Webcam memiliki noise piksel yang membuat titik koordinat sendi bergetar setiap frame. Kami menerapkan Exponential Moving Average (EMA) pada koordinat landmark dan Majority Voting pada hasil klasifikasi. Hasilnya, kerangka tubuh yang ditampilkan sangat stabil, mulus, dan tidak melompat-lompat."*

---

### Slide 9 — Arsitektur Sistem & Alur Kerja (*System Architecture*)

```text
[Webcam Browser]
      │ Capture Snapshot (tiap 200ms)
      ▼
[FastAPI REST API Backend]
      │ MediaPipe Pose Landmarker (Inferensi ~35 ms)
      │ Ekstraksi Fitur 3D Geometri
      ▼
[Kondisi 1: Pre-Kalibrasi (/api/detect)]
      │ Jika posisi tegak stabil ➔ Hitung Mundur 3.. 2.. 1..
      │ Ambil 3 snapshot baseline personal
      ▼
[Kondisi 2: Mode Pelatihan (/api/predict)]
      │ Realtime Posture Score (% Tegak)
      │ Stopwatch Waktu Duduk
      │ Audio Chime Peringatan Lembut jika Bungkuk
```

> 🗣️ **Naskah Presentasi:**  
> *"Secara arsitektur, sistem kami terdiri dari Frontend antarmuka kamera dan Backend FastAPI yang memproses model MediaPipe dengan latensi sangat rendah, yaitu sekitar 35 milidetik per frame. Sistem ini dilengkapi alur pintar: deteksi posisi siap, hitung mundur otomatis 3 detik untuk kalibrasi, lalu langsung berpindah ke Mode Pelatihan Postur dengan skor dan audio peringatan."*

---

### Slide 10 — Fitur Antarmuka Studio Kamera (*Live Demo Highlights*)
- **Kerangka Tulang Realtime (*Live Wireframe Canvas*)**:
  - 🟢 **Hijau**: Postur tegak, seimbang, dan ideal.
  - 🟡 **Kuning/Oranye**: Mulai miring atau condong ringan.
  - 🔴 **Merah**: Bungkuk (*forward head / slouch*).
- **Hitung Mundur Otomatis (*Auto Countdown 3.. 2.. 1..*)**:
  - Mengeliminasi kebutuhan menekan tombol manual saat sedang mengatur posisi duduk.
- **Dasbor Sesi Pelatihan (*Training Dashboard*)**:
  - Durasi latihan, persentase skor tegak, akumulasi durasi sehat, dan peringatan suara (*Web Audio API* sintetis).

> 🗣️ **Naskah Presentasi:**  
> *"Pada tampilan antarmuka, pengguna mendapatkan umpan balik visual instan. Garis kerangka tulang akan berubah warna secara dinamis: hijau saat tegak dan merah saat bungkuk. Begitu pengguna duduk tegak, hitung mundur otomatis berjalan tanpa perlu menekan tombol, dan sesi latihan langsung aktif mencatat skor postur."*

---

### Slide 11 — Kesimpulan & Pekerjaan Selanjutnya
- **Kesimpulan**:
  1. Berhasil mengadaptasi konsep landmark 3D dari jurnal IEEE Access 2024 menjadi prototipe webcam realtime.
  2. Berhasil mengatasi masalah *domain shift* model Colab dengan menerapkan kalibrasi personal adaptif dan aturan biomekanika tubuh atas.
  3. Menghasilkan sistem dengan latensi inferensi rendah (~35 ms) yang stabil, bebas *jitter*, dan memiliki antarmuka latihan interaktif.
- **Pekerjaan Selanjutnya**:
  1. Membungkus antarmuka ke dalam komponen frontend **Next.js** penuh.
  2. Mengumpulkan *final holdout* dataset uji pada minimal 5–10 pengguna baru.
  3. Menambahkan fitur riwayat harian dan integrasi database untuk pemantauan jangka panjang.

> 🗣️ **Naskah Presentasi:**  
> *"Sebagai kesimpulan, proyek kami berhasil membuktikan bahwa kelemahan model statis dapat diselesaikan melalui kalibrasi adaptif dan biomekanika tubuh atas. Sistem ini telah berjalan realtime dan siap digunakan. Pekerjaan selanjutnya adalah menyelesaikan integrasi komponen Next.js dan pengujian holdout akhir. Terima kasih, kami membuka sesi tanya jawab."*

