import { Link } from 'react-router-dom';
import { useCallback, useState } from 'react';
import LandingIntro from '../components/landing/LandingIntro';
import AboutBungkok from '../components/landing/AboutBungkok';
import BungkokFooter from '../components/landing/BungkokFooter';
import { FigmaIcon, figmaAsset } from '../components/common/FigmaAsset';
import { useLandingMotion } from '../hooks/useLandingMotion';
import '../styles/landing.css';

// ============================================================================
// DATA STATIS: LANGKAH CARA KERJA (SEKSI "CARA KERJA")
// ============================================================================
const steps = [
  { 
    title: 'Siapkan Kamera', 
    description: 'Izinkan akses webcam di browser untuk memulai pemantauan.', 
    file: '9042e.webp' 
  },
  { 
    title: 'Kalibrasi Posisi Duduk', 
    description: 'Ambil posisi duduk tegak yang nyaman sebagai acuan posturmu.', 
    file: 'calibration-crop.webp', 
    crop: true 
  },
  { 
    title: 'Pantau & Lihat Ringkasan', 
    description: 'Dapatkan pemantauan real-time, pengingat saat postur mulai buruk, dan ringkasan kebiasaanmu.', 
    file: '07370.webp' 
  },
];

// ============================================================================
// DATA STATIS: DAFTAR BADGE PADA KARTU "POIN & BADGE"
// Digunakan pada seksi Fitur Utama untuk menampilkan progres pencapaian user
// ============================================================================
const badges = [
  { file: 'a0622.svg', title: '7 Hari', sub: 'Konsisten', active: true },   // Badge aktif (lingkaran pink + icon kursi putih)
  { file: '59db3.svg', title: '14 Hari', sub: 'Konsisten', active: false }, // Badge belum terbuka (lingkaran abu-abu + kalender)
  { file: 'c2a4e.svg', title: '30 Hari', sub: 'Konsisten', active: false }, // Badge belum terbuka (lingkaran abu-abu + gembok)
];

// ============================================================================
// KOMPONEN: PosturePhoto
// Menampilkan foto ilustrasi tracking posisi duduk beserta titik sensor & label
// Parameter: closing (boolean) -> true jika ditampilkan di seksi penutup / CTA
// ============================================================================
function PosturePhoto({ closing = false }) {
  return (
    <div className={`posture-photo ${closing ? 'posture-photo-closing' : ''}`}>
      {/* Gambar sumber foto postur */}
      <img className="posture-source" src={figmaAsset('2c710.webp')} alt="Ilustrasi pemantauan posisi duduk" width="500" height="500" loading="lazy" />
      
      {/* Label status postur hijau/pink */}
      <span className="posture-label"><FigmaIcon file="92a51.svg" />Postur Baik</span>
      
      {/* Garis keselarasan tulang belakang */}
      <img className="posture-alignment" src={figmaAsset(closing ? '4bccb.svg' : '32646.svg')} alt="" />
      
      {/* Titik estimasi postur atas & bawah */}
      <img className="posture-points point-top" src={figmaAsset(closing ? '2c071.svg' : 'b4a4d.svg')} alt="" />
      <img className="posture-points point-bottom" src={figmaAsset(closing ? '2c071.svg' : 'b4a4d.svg')} alt="" />
      
      {/* Keterangan melayang di bagian bawah foto */}
      <span className="posture-caption"><FigmaIcon file="b6729.svg" />Estimasi postur real-time</span>
    </div>
  );
}

// ============================================================================
// KOMPONEN: LandingFeatures
// Menampilkan seksi "FITUR UTAMA" (Posture Tracking, Reminder, Riwayat, Poin & Badge)
// ============================================================================
function LandingFeatures() {
  return (
    <section id="fitur" className="landing-features landing-content">
      {/* Judul Seksi Fitur Utama */}
      <h2>FITUR UTAMA</h2>

      <div className="feature-layout">
        {/* Kartu Fitur 1: Posture Tracking (Sisi Kiri Besar) */}
        <article className="landing-card feature-tracking">
          <h3>Posture Tracking</h3>
          <p>Pantau posisi dudukmu secara real-time melalui webcam dengan estimasi postur.</p>
          <PosturePhoto />
        </article>

        {/* Kolom Fitur Sisi Kanan */}
        <div className="feature-side">
          {/* Kartu Fitur 2: Reminder Ramah */}
          <article className="landing-card feature-reminder">
            <div>
              <FigmaIcon file="af74a.svg" />
              <h3>Reminder Ramah</h3>
              <p>Dapatkan pengingat yang sopan dan tidak mengganggu saat postur mulai membungkuk.</p>
            </div>
            {/* Contoh notifikasi popup reminder */}
            <div className="reminder-example">
              <FigmaIcon file="af74a.svg" />
              <div>
                <strong>Ayo tegakkan posturmu! 🌿</strong>
                <p>Kamu mulai membungkuk. Yuk, kembali ke posisi yang lebih tegak.</p>
              </div>
              <span aria-hidden="true">×</span>
            </div>
          </article>

          {/* Baris Bawah: Riwayat Kebiasaan + Poin & Badge */}
          <div className="feature-bottom">
            {/* Kartu Fitur 3: Riwayat Kebiasaan (Grafik Batang) */}
            <article className="landing-card">
              <h3>Riwayat Kebiasaan</h3>
              <p>Lihat perkembangan kebiasaan dudukmu dari hari ke hari.</p>
              <div className="sample-chart">
                <small>Konsistensi Postur Baik</small>
                <div><strong>82%</strong><span>+8% minggu ini</span></div>
                <div className="sample-bars" aria-label="Grafik konsistensi postur">
                  {[45, 61, 55, 72, 67, 87, 95].map((height, i) => (
                    <i key={i} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="sample-days">
                  {'SMTJKSM'.split('').map((d, i) => <span key={i}>{d}</span>)}
                </div>
              </div>
            </article>

            {/* Kartu Fitur 4: Poin & Badge (Poin Harian + Koleksi Badge) */}
            <article className="landing-card">
              <h3>Poin & Badge</h3>
              <p>Bangun kebiasaan baik dengan poin dan pencapaian sederhana.</p>
              <div className="sample-rewards">
                {/* Baris Saldo Poin */}
                <small className="reward-label">Poin Kamu</small>
                <div className="reward-points-bar">
                  <FigmaIcon file="0a1b8.svg" />
                  <span className="reward-points-value">720</span>
                  <span className="reward-points-unit">poin</span>
                </div>

                {/* Deretan Badge Lingkaran (Icon Kursi, Kalender, Gembok) */}
                <div className="sample-medals">
                  {badges.map((b) => (
                    <div key={b.title} className="badge-item">
                      <div className={`badge-icon-circle ${b.active ? 'badge-active' : ''}`}>
                        <FigmaIcon file={b.file} />
                      </div>
                      <strong className="badge-title">{b.title}</strong>
                      <span className="badge-sub">{b.sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// KOMPONEN UTAMA: LandingPage
// Menggabungkan seluruh seksi Landing Page dari Hero sampai CTA Closing
// ============================================================================
export default function LandingPage({ allowIntro = true }) {
  const [introActive, setIntroActive] = useState(() => allowIntro && !window.location.hash && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const motionRoot = useLandingMotion(); // Hook animasi transisi dan interaksi scroll reveal
  const revealHero = useCallback(() => {
    motionRoot.current?.dispatchEvent(new Event('bungkok:intro-reveal'));
  }, [motionRoot]);
  const finishIntro = useCallback(() => setIntroActive(false), []);

  return (
    <div className="landing-wrapper" ref={motionRoot} data-intro-active={introActive}>
      {introActive && <LandingIntro onReveal={revealHero} onComplete={finishIntro} />}
      <main id="top" className="landing-page">
      {/* --------------------------------------------------------------------
          SEKSI 1: HERO
          Bagian paling atas: Navbar, Headline utama, dan figur perempuan
          -------------------------------------------------------------------- */}
      <section className="landing-hero">
        <header className="landing-nav">
          <nav aria-label="Navigasi utama">
            <a href="#about">ABOUT</a>
            <a href="#cara-kerja">HOW IT WORKS</a>
          </nav>
          <Link className="landing-logo" to="/">BUNGKOK</Link>
          <Link className="nav-start" to="/register">LET’S START</Link>
        </header>

        <div className="hero-stage">
          <h1 className="hero-type">
            <span>Duduk lebih sadar</span>
            <span className="hero-second">
              <span>Mulai</span>
              <em>dari</em>
              <span>hari ini</span>
            </span>
          </h1>
          <img
            className="hero-figure"
            src={figmaAsset('bbc54.webp')}
            alt="Perempuan dengan ilustrasi keselarasan tulang belakang"
            width="609"
            height="801"
            fetchPriority="high"
          />
        </div>
      </section>

      {/* Pembatas Fog 1: Menghubungkan Hero dengan About secara lembut */}
      <div className="landing-divider-fog divider-hero-about" aria-hidden="true" />

      {/* --------------------------------------------------------------------
          SEKSI 2: ABOUT BUNGKOK
          Kolase foto postur dan penjelasan misi BUNGKOK
          -------------------------------------------------------------------- */}
      <AboutBungkok />

      {/* Pembatas Fog 2: Menghubungkan About dengan Cara Kerja */}
      <div className="landing-divider-fog divider-about-steps" aria-hidden="true" />

      {/* --------------------------------------------------------------------
          SEKSI 3: CARA KERJA
          3 langkah mudah mulai menggunakan aplikasi
          -------------------------------------------------------------------- */}
      <section id="cara-kerja" className="landing-steps landing-content">
        <h2>CARA KERJA</h2>
        <div className="step-grid">
          {steps.map((step, index) => (
            <article className="landing-card step-card" key={step.title}>
              <div className="step-visual">
                <span className="step-number">0{index + 1}</span>
                <div className={step.crop ? 'step-crop' : 'step-illustration'}>
                  <img src={figmaAsset(step.file)} alt={step.title} width="274" height="218" loading="lazy" />
                </div>
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Pembatas Fog 3: Menghubungkan Cara Kerja dengan Fitur Utama */}
      <div className="landing-divider-fog divider-steps-features" aria-hidden="true" />

      {/* --------------------------------------------------------------------
          SEKSI 4: FITUR UTAMA
          Detail 4 fitur utama: Tracking, Reminder, Riwayat, Poin & Badge
          -------------------------------------------------------------------- */}
      <LandingFeatures />

      {/* Pembatas Fog 4: Menghubungkan Fitur Utama dengan Seksi Penutup (CTA) */}
      <div className="landing-divider-fog divider-features-closing" aria-hidden="true" />

      {/* --------------------------------------------------------------------
          SEKSI 5: CTA / CLOSING (PENUTUP)
          Ajakan bertindak ("Mulai Sekarang") & galeri kipas kartu visual
          -------------------------------------------------------------------- */}
      <section className="landing-closing" data-motion-section>
        <span className="closing-eyebrow">LANGSUNG DARI BROWSER</span>
        <h2>DUDUK LEBIH BAIK,<br />MULAI SEKARANG</h2>
        <p>Pantau posturmu langsung dari browser.<br />Tanpa download, tanpa ribet, cukup kamera dan kamu.</p>
        
        <div className="closing-actions">
          <Link to="/register" className="landing-button">MULAI PANTAU POSTUR</Link>
          <a href="#cara-kerja" className="landing-button secondary">LIHAT CARA KERJA</a>
        </div>
        
        <small>Siapkan kamera, duduk nyaman, dan mulai pantau posturmu.</small>

        {/* Efek visual kipas kartu miring di bawah tombol CTA */}
        <div className="closing-fan">
          <div className="closing-fan-outer-left" data-fan-angle="-14"><img src={figmaAsset('2c710.webp')} alt="" width="500" height="500" loading="lazy" /></div>
          <div className="closing-fan-left" data-fan-angle="-7"><img src={figmaAsset('calibration-fan.webp')} alt="Kalibrasi posisi duduk" width="335" height="413" loading="lazy" /></div>
          <div className="closing-fan-center"><PosturePhoto closing /></div>
          <div className="closing-fan-right" data-fan-angle="7"><img src={figmaAsset('bbc54.webp')} alt="Pemantauan real-time" width="609" height="801" loading="lazy" /></div>
          <div className="closing-fan-outer-right" data-fan-angle="14"><img src={figmaAsset('9042e.webp')} alt="" width="500" height="500" loading="lazy" /></div>
        </div>
      </section>
      </main>
      <BungkokFooter />
    </div>
  );
}
