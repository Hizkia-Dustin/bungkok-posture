import { useRef, useState } from 'react';
import Dialog from '../common/Dialog';
import '../../styles/legal.css';

const documents = {
  terms: {
    title: 'Syarat & Ketentuan',
    intro: 'Kenali cara menggunakan Bungkok sebelum memulai kebiasaan duduk yang lebih baik.',
    summary: 'Bungkok membantu kamu memantau kebiasaan duduk. Hasil pemantauan adalah panduan, bukan diagnosis medis.',
    sections: [
      ['Tentang layanan', 'Bungkok menyediakan pemantauan postur melalui kamera, pengingat, riwayat latihan, serta pencatatan perkembangan. Gunakan informasi ini sebagai bahan refleksi untuk membangun kebiasaan duduk sehari-hari.'],
      ['Akun dan akses', 'Gunakan informasi akun yang benar dan jaga kerahasiaan kata sandimu. Kamu bertanggung jawab atas aktivitas pada akunmu. Jangan menggunakan akun orang lain atau membagikan akses tanpa izin.'],
      ['Penggunaan kamera', 'Fitur pemantauan membutuhkan izin kamera dari perangkatmu. Pastikan orang yang terlihat oleh kamera mengetahui dan menyetujui penggunaannya. Jika memasangkan kamera HP, gunakan perangkat yang kamu percaya dan jaga kerahasiaan kode ruang.'],
      ['Batas hasil pemantauan', 'Hasil deteksi dapat berbeda karena pencahayaan, posisi kamera, pakaian, dan kemampuan perangkat. Bungkok tidak menggantikan pemeriksaan atau saran tenaga kesehatan dan tidak menjanjikan hasil kesehatan tertentu.'],
      ['Penggunaan yang bertanggung jawab', 'Jangan menyalahgunakan layanan, mengakses data pengguna lain, mengganggu sistem, atau memanipulasi hasil latihan dan poin. Gunakan fitur sesuai tujuan dan hentikan sesi jika kamu merasa tidak nyaman.'],
      ['Pengaturan dan bantuan', 'Kamu dapat mengelola profil, menghapus riwayat, atau mengajukan penghapusan akun melalui Profil & Pengaturan. Untuk kendala penggunaan, masuk ke akun dan kirim laporan melalui menu Bantuan.'],
    ],
  },
  privacy: {
    title: 'Kebijakan Privasi',
    intro: 'Pahami data yang digunakan Bungkok, untuk apa data tersebut dipakai, dan pilihan yang kamu miliki.',
    summary: 'Kamera digunakan untuk pemantauan postur. Kamu dapat mengelola izin kamera dan data akun melalui perangkat serta pengaturan aplikasi.',
    sections: [
      ['Data akun dan aktivitas', 'Bungkok menggunakan nama, email, serta informasi profil yang kamu berikan untuk mengelola akun. Data sesi, durasi latihan, metrik postur, perkembangan, tantangan, dan reward digunakan untuk menampilkan aktivitasmu. Laporan yang kamu kirim melalui Bantuan juga diproses untuk menangani kendala.'],
      ['Kamera dan pemrosesan postur', 'Akses kamera mengikuti izin pada perangkatmu. Pemantauan dapat melibatkan pemrosesan di perangkat dan pengiriman gambar ke layanan pemrosesan Bungkok untuk deteksi atau kalibrasi, sesuai fitur yang digunakan. Saat kamera HP dipasangkan, aliran kamera dikirim ke perangkat yang terhubung dalam ruang tersebut.'],
      ['Tujuan penggunaan data', 'Data digunakan untuk menjalankan akun, menghitung hasil sesi, menyajikan riwayat dan perkembangan, serta menangani laporan bantuan. Ringkasan aktivitas disimpan agar dapat ditampilkan kembali saat kamu masuk.'],
      ['Layanan yang terhubung', 'Autentikasi akun menggunakan Supabase. Jika memilih masuk dengan Google, proses masuk juga melibatkan Google. Pemrosesan postur dan penyimpanan aktivitas melibatkan layanan backend Bungkok; pemasangan kamera HP menggunakan koneksi antarperangkat.'],
      ['Pilihan dan pengelolaan data', 'Kamu dapat memperbarui profil serta menggunakan Hapus riwayat atau Hapus akun di Profil & Pengaturan. Izin kamera dapat dicabut melalui pengaturan browser atau perangkat. Pencabutan izin akan membatasi fitur yang membutuhkan kamera.'],
      ['Pertanyaan tentang privasi', 'Untuk menyampaikan pertanyaan atau kendala terkait data akun, masuk ke Bungkok dan gunakan menu Bantuan. Jelaskan kebutuhanmu tanpa menyertakan kata sandi atau informasi sensitif yang tidak diperlukan.'],
    ],
  },
};

export default function LegalDialog({ initialDocument, onClose }) {
  const [selected, setSelected] = useState(initialDocument);
  const scrollArea = useRef(null);
  const document = documents[selected];

  const selectDocument = (key) => {
    setSelected(key);
    scrollArea.current?.scrollTo({ top: 0 });
  };

  return (
    <Dialog title={document.title} onClose={onClose} className="legal-dialog">
      <nav className="legal-navigation" aria-label="Dokumen Bungkok">
        {Object.entries(documents).map(([key, value]) => (
          <button type="button" key={key} aria-pressed={selected === key} onClick={() => selectDocument(key)}>
            {value.title}
          </button>
        ))}
      </nav>

      <article className="legal-reading" ref={scrollArea} tabIndex={0} aria-labelledby="legal-title" data-lenis-prevent>
        <header className="legal-heading">
          <span className="legal-brand">BUNGKOK<span>.</span></span>
          <h2 id="legal-title">{document.title}</h2>
          <p>{document.intro}</p>
        </header>
        <div className="legal-summary">
          <strong>{selected === 'terms' ? 'Sebelum kamu mulai' : 'Kendali ada di kamu'}</strong>
          <p>{document.summary}</p>
        </div>
        <div className="legal-sections">
          {document.sections.map(([title, body], index) => (
            <section className="legal-section" key={title}>
              <span className="legal-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </section>
          ))}
        </div>
      </article>

      <footer className="legal-footer">
        <p>Baca dengan tenang, lanjutkan saat kamu siap.</p>
        <button type="button" onClick={onClose}>Kembali ke formulir</button>
      </footer>
    </Dialog>
  );
}
