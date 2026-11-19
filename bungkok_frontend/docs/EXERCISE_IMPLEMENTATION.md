# Implementasi frontend latihan

## Pembaruan: latihan bebas

Atas arahan pengguna, pilihan target 15/25/30 menit dan penyelesaian otomatis dihapus. Latihan berjalan tanpa batas sampai pengguna mengakhirinya. Tampilan utama menghitung durasi postur tegak berturut-turut, disertai total waktu latihan, total waktu tegak, dan rekor tegak terlama. Postur berubah, tidak terpantau, jeda, atau tab tersembunyi mengakhiri rangkaian tegak saat ini; rekor dan total tetap tersimpan. Menutup dialog ketika latihan berjalan meminta konfirmasi penyelesaian, lalu menampilkan hasil. Hasil menyimpan `uprightSeconds` dan `longestUprightSeconds`. Ketentuan poin tetap sama. Penjelasan target durasi dan penyelesaian otomatis di bagian awal implementasi di bawah sudah digantikan oleh pembaruan ini.

Status: desktop siap ditinjau. Sumber kebutuhan: `EXERCISE_FLOW_SPEC.md`.

Dashboard → Mulai Latihan Sekarang membuka wizard persiapan, kalibrasi tiga detik, konfigurasi, sesi aktif, dan rekap. Kamera menggunakan getUserMedia tanpa audio. Checklist pencahayaan dan bahu dikonfirmasi pengguna. Pilihan simulasi tanpa kamera tersedia bila kamera tidak tersedia atau izinnya ditolak. Baseline 86° dan status postur diberi label simulasi; tidak ada klaim deteksi AI.

Mode kerja memakai toleransi 10 detik, koreksi aktif 3 detik, sesuai rincian konfigurasi dalam spesifikasi (mengutamakan nilai per mode dibanding contoh generik 5 detik). Sensitivitas dipakai untuk menampilkan deviasi simulasi melewati ambang terpilih. Pengingat dibunyikan sekali per episode postur condong, lalu diaktifkan ulang setelah kembali tegak. Toggle audio tidak mematikan umpan balik visual.

Timer memakai selisih performance.now, bukan menghitung banyaknya interval. Waktu valid, condong depan/belakang, jeda, dan tidak terpantau dicatat terpisah. Tab tersembunyi dihitung sebagai jeda. Target dihitung dari waktu valid. Pilihan 60× mempercepat waktu simulasi secara eksplisit. Menutup dialog membatalkan sesi yang belum disimpan; tidak ada poin. Kamera berhenti ketika dibatalkan, sesi selesai, atau komponen dilepas.

Poin mengikuti syarat aplikasi yang sudah ada: minimal 5 menit valid, coverage minimal 70%, satu poin per menit penuh, maksimum 25. Bonus tantangan menambah saldo tersedia; sesuai kontrak spesifikasi, poin kumulatif bertambah dari poin sesi saja. completeSession mencegah penyimpanan ulang ID sesi yang sama. Tantangan berbasis hari hanya bertambah satu kali per tanggal; hadiah tantangan dan badge tidak diberikan ulang. Badge yang sudah terbuka pada data awal tetap terbuka tanpa selebrasi palsu. Tantangan demo yang masih aktif dievaluasi sebagai skenario spesifikasi; periode Juli pada seed belum menjadi sistem kedaluwarsa produksi.

Dashboard, grafik tujuh hari terakhir, sesi terbaru, saldo, level, koleksi badge dan riwayat menggunakan hasil state baru. Data sesi bertanggal aktual Asia/Jakarta. Data tetap dalam memori AppContext dan kembali ke seed demo setelah refresh; backend, persistensi akun, dan model AI belum termasuk implementasi frontend ini.

## File implementasi

- `src/components/dialogs/StartExerciseModal.jsx`
- `src/styles/exercise.css`
- `src/utils/exercise.js`
- `src/context/AppContext.jsx`
- `src/components/common/GlobalModal.jsx`
- `src/components/common/SoftUI.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/RiwayatLatihan.jsx`
- `scripts/verify-exercise.mjs`

## Verifikasi

`node scripts/verify-exercise.mjs` lolos: checklist terkunci, kalibrasi, konfigurasi, status condong, jeda/lanjut, penyelesaian otomatis, +25 poin sesi, +15 bonus, saldo 225, kumulatif 210/250, dashboard terbaru dan tujuh baris riwayat. Unit checks mencakup batas 299/300 detik, batas 25 poin, dan bonus tantangan satu kali. Screenshot desktop 1440px tersimpan di `design-reference/verification/exercise-*.png`.

Pratinjau getUserMedia diuji memakai fake media device Chrome pada 1366×768: track aktif, track menjadi ended setelah dialog ditutup, dan saldo tetap 185 pada pembatalan. Kamera perangkat fisik tidak diuji. Build produksi dan TypeScript lolos. Pengujian visual mobile masih ditunda sesuai prioritas desktop.
