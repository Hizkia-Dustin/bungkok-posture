import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useApp } from '../context/AppContext';
import { Card, Button, PageHeader, Progress, WeekChart } from '../components/common/SoftUI';
import { FigmaIcon, figmaAsset } from '../components/common/FigmaAsset';
import UserAvatar from '../components/common/UserAvatar';
import '../styles/dashboard.css';
import { sessionWeek, clockLabel, dayKey } from '../utils/exercise';
import Dialog from '../components/common/Dialog';
import { usePostureMonitor } from '../context/PostureMonitorContext';
import { drawSkeletonOnCanvas, clearSkeletonCanvas, subscribePoseFrames } from '../utils/skeletonDrawer';

function LiveDashboardCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { stream, snapshot, restoreMonitor, togglePause, finish } = usePostureMonitor();
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  // Ikuti frame pose langsung dari pelacak (±18 fps), bukan snapshot 350 ms yang terasa patah-patah
  useEffect(() => {
    const draw = (landmarks, color, cameraMode) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      drawSkeletonOnCanvas(canvas, landmarks, color, cameraMode);
    };
    draw(snapshot.landmarks, snapshot.color, snapshot.cameraMode);
    return subscribePoseFrames(draw);
  }, []);

  useEffect(() => () => clearSkeletonCanvas(canvasRef.current), []);

  const statusText = snapshot.status === 'paused'
    ? 'Latihan dijeda'
    : snapshot.status === 'interrupted'
      ? 'Koneksi pemantauan terputus'
      : snapshot.message || 'Pemantauan postur aktif';

  return <div className="dashboard-live-camera">
    <video ref={videoRef} muted playsInline autoPlay aria-label="Kamera pemantauan postur aktif" />
    <canvas ref={canvasRef} aria-hidden="true" />
    <span className={`camera-status ${snapshot.posture}`}>● {statusText}</span>
    <div className="dashboard-live-actions">
      <button type="button" onClick={restoreMonitor}>Buka monitor</button>
      <button type="button" onClick={togglePause}>{snapshot.status === 'paused' ? 'Lanjut' : 'Jeda'}</button>
      <button type="button" onClick={() => setConfirmFinish(true)}>Selesai</button>
    </div>
    {confirmFinish && <Dialog title="Konfirmasi selesai latihan" onClose={() => setConfirmFinish(false)}>
      <h2>Selesaikan latihan?</h2>
      <p>Pemantauan akan berhenti dan hasil sesi langsung disimpan. Sesi yang sudah selesai tidak bisa dilanjutkan lagi.</p>
      <div className="dialog-actions">
        <Button primary onClick={() => { setConfirmFinish(false); finish(); }}>Ya, selesaikan</Button>
        <Button onClick={() => setConfirmFinish(false)}>Lanjut latihan</Button>
      </div>
    </Dialog>}
  </div>;
}

// ============================================================================
// KOMPONEN UTAMA: Dashboard
// Halaman beranda utama aplikasi Bungkok (/app/dashboard)
// Menampilkan ringkasan latihan, kamera, grafik mingguan, progres level, dan badge
// Menggunakan animasi Content Reveal langsung (tanpa page transition overlay)
// ============================================================================
export default function Dashboard() {
  const dashboardRef = useRef(null);
  const progressRef = useRef(null);
  const pendingRewardRef = useRef(null);
  const [rewardBurst, setRewardBurst] = useState(null);

  // Mengambil data global dari AppContext
  const { user, sessions, hasData, badges, challenges, openModal } = useApp();
  const monitor = usePostureMonitor();

  // Animasi Content Reveal: Konten dashboard muncul meluncur bertingkat secara instan & halus
  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.45 } });

      // 1. Header meluncur turun halus
      tl.from('.page-header', {
        y: -14,
        opacity: 0,
        duration: 0.38,
      })
      // 2. 4 Kartu Statistik Atas meluncur naik berurutan
      .from('.dashboard-stats > *', {
        y: 20,
        opacity: 0,
        stagger: 0.05,
        duration: 0.42,
      }, '-=0.18')
      // 3. Kartu Mulai Latihan & Status Kamera
      .from(['.dashboard-start', '.dashboard-camera'], {
        y: 22,
        opacity: 0,
        stagger: 0.07,
        duration: 0.42,
      }, '-=0.22')
      // 4. Kartu Durasi Mingguan & Level Poin
      .from(['.dashboard-week', '.dashboard-level'], {
        y: 22,
        opacity: 0,
        stagger: 0.07,
        duration: 0.42,
      }, '-=0.22')
      // 5. Tiga Kartu Bawah (Sesi Terbaru, Badge, Tantangan)
      .from('.dashboard-bottom > *', {
        y: 22,
        opacity: 0,
        stagger: 0.07,
        duration: 0.42,
      }, '-=0.22');
    }, dashboardRef);

    return () => ctx.revert();
  }, []);

  // Mencari tantangan yang sedang aktif diikuti user
  const activeChallenge = challenges.find((challenge) => challenge.type === 'diikuti');
  const latest = sessions[0];
  const week = sessionWeek(sessions);
  // Sesi yang benar-benar terjadi hari ini (zona Asia/Jakarta), bukan tanggal sesi terakhir
  const todayKey = dayKey(new Date());
  const today = sessions.filter((s) => {
    const started = s.startedAt || s.start_time;
    return (s.dateKey || (started ? dayKey(new Date(started)) : null)) === todayKey;
  });
  const claimableBadges = badges.filter((badge) => badge.unlocked && !badge.claimed);
  const liveMetrics = monitor.snapshot.metrics || {};
  const liveValid = (liveMetrics.upright || 0) + (liveMetrics.forward || 0) + (liveMetrics.backward || 0);
  const liveUpright = liveValid ? Math.round((liveMetrics.upright || 0) / liveValid * 100) : 0;
  const showLiveCamera = monitor.mounted && !monitor.isOpen
    && ['monitoring', 'paused', 'interrupted'].includes(monitor.snapshot.status);

  useEffect(() => {
    if (!monitor.isOpen && pendingRewardRef.current) {
      setRewardBurst(pendingRewardRef.current);
      pendingRewardRef.current = null;
      return undefined;
    }
    const current = { points: user.totalPointsCumulative, level: user.level, sessionId: latest?.id || null };
    if (!progressRef.current) {
      progressRef.current = current;
      return undefined;
    }
    const previous = progressRef.current;
    progressRef.current = current;
    if (current.sessionId === previous.sessionId && current.points <= previous.points) return undefined;

    const gain = Math.max(0, current.points - previous.points);
    const reward = { gain, leveledUp: current.level > previous.level };
    if (monitor.isOpen) {
      pendingRewardRef.current = reward;
      return undefined;
    }
    setRewardBurst(reward);
    return undefined;
  }, [user.totalPointsCumulative, user.level, latest?.id, monitor.isOpen]);

  useEffect(() => {
    if (!rewardBurst) return undefined;
    const timer = window.setTimeout(() => setRewardBurst(null), 3200);
    return () => window.clearTimeout(timer);
  }, [rewardBurst]);

  useLayoutEffect(() => {
    if (!rewardBurst || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo('.dashboard-reward-burst',
        { autoAlpha: 0, y: 14, scale: 0.82 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.8)' });
      gsap.fromTo('.dashboard-level', { scale: 0.985 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.55)' });
    }, dashboardRef);
    return () => ctx.revert();
  }, [rewardBurst]);

  // Data 4 kartu statistik ringkas di baris atas
  // Format: [Label Kartu, Nilai Angka, Catatan/Perubahan, Ikon SVG Figma]
  const stats = [
    ['Poin Hari Ini', today.reduce((sum, s) => sum + s.pointsEarned, 0), today.length ? `Dari ${today.length} sesi hari ini` : 'Belum ada sesi hari ini', '9ecd7.svg'],
    ['Saldo Poin', user.points, `${claimableBadges.length} pencapaian siap diklaim`, 'eba7f.svg'],
    ['Waktu Terpantau', latest?.validDuration || '0m', `dari ${latest?.totalDuration || '0m'} total sesi terakhir`, 'eec18.svg'],
    ['Postur Tegak', latest ? `${latest.uprightPercentage}%` : '—', `${latest?.uprightDuration || '0m'} tegak pada sesi terakhir`, '740fc.svg'],
  ];

  return (
    <div className="app-page dashboard-page" ref={dashboardRef}>
      {/* --------------------------------------------------------------------
          1. HEADER DASHBOARD: Salam pembuka, status sesi, profil & tombol exit
          -------------------------------------------------------------------- */}
      <PageHeader title={`Halo, ${user.name.split(' ')[0]}`} subtitle={latest ? `Sesi terakhir ${latest.fullDate} · ${latest.uprightPercentage}% waktu tegak` : 'Mulai sesi postur pertamamu saat sudah siap.'}>
        <div className="dashboard-user">
          {/* Link cepat ke halaman Profil */}
          <Link to="/app/profil" title="Buka profil">
            <UserAvatar src={user.avatar} name={user.name} size={40} alt="Buka profil" />
          </Link>

          {/* Tombol Cepat Exit / Keluar */}
          <button
            type="button"
            className="dashboard-exit-btn"
            onClick={() => openModal('keluar-akun')}
            title="Keluar akun"
            aria-label="Keluar akun"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Keluar</span>
          </button>
        </div>
      </PageHeader>

      {/* --------------------------------------------------------------------
          2. EMPAT KARTU STATISTIK RINGKAS (Poin Hari Ini, Total, Waktu, Tegak)
          -------------------------------------------------------------------- */}
      <div className="app-grid grid-four dashboard-stats">
        {stats.map(([label, value, note, icon], index) => (
          <Card key={label} className={index === 3 ? 'dashboard-stat pink-stat' : 'dashboard-stat'}>
            <div>
              <span>{label}</span>
              <FigmaIcon file={icon} />
            </div>
            <strong>{value}</strong>
            <small>{hasData ? note : 'Belum ada sesi tersimpan'}</small>
          </Card>
        ))}
      </div>

      {/* --------------------------------------------------------------------
          3. SEKSI MULAI LATIHAN & PRATINJAU KAMERA
          -------------------------------------------------------------------- */}
      <div className="app-grid grid-main-side">
        {/* Kartu CTA Mulai Latihan */}
        <Card sky className="dashboard-start stack">
          <span className="soft-tag">{hasData ? 'Aktif hari ini' : 'Mulai kebiasaan baik'}</span>
          <h2>Siap Berlatih?</h2>
          <p>{monitor.mounted ? 'Pemantauan postur sedang aktif. Buka monitor untuk melihat detailnya.' : 'Siapkan kamera dan posisi duduk, lalu mulai sesi saat kamu siap.'}</p>
          <Button primary onClick={monitor.mounted ? monitor.restoreMonitor : monitor.openMonitor}>
            {monitor.mounted ? 'Buka Monitor Latihan' : 'Mulai Latihan Sekarang'}
          </Button>
        </Card>

        {/* Kartu Status Kamera & Ilustrasi Postur */}
        <Card className="dashboard-camera">
          {showLiveCamera ? <LiveDashboardCamera /> : <div>
              <img src={figmaAsset('3835e.webp')} alt="Ilustrasi posisi duduk di depan komputer" width="340" height="178" />
              <span className="camera-status">● Kamera belum aktif</span>
              <span className="camera-caption"><FigmaIcon file="6da83.svg" />Ilustrasi posisi duduk</span>
            </div>}
          <div className="camera-stats">
            {[
              [showLiveCamera ? clockLabel(liveValid) : latest?.validDuration || '0m', 'Waktu valid'],
              [showLiveCamera ? `${liveUpright}%` : `${latest?.uprightPercentage || 0}%`, 'Tegak'],
              [latest?.pointsEarned || 0, 'Poin dapat']
            ].map(([value, label]) => (
              <span key={label}>
                <strong>{showLiveCamera || hasData ? value : '0'}</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------------------
          4. GRAFIK DURASI MINGGUAN & TOTAL POIN / LEVEL
          -------------------------------------------------------------------- */}
      <div className="app-grid grid-main-side">
        {/* Grafik Riwayat Waktu Mingguan */}
        <Card className="dashboard-week stack">
          <div className="data-pair">
            <strong>Durasi valid minggu ini</strong>
            <small>{week[0].day}–{week[6].day}</small>
          </div>
          <div>
            <strong className="dashboard-total">{Math.round(week.reduce((sum, day) => sum + day.value, 0) * 10) / 10} m</strong>
            <small className="dashboard-active-days">{week.filter(day => day.value > 0).length} dari 7 hari aktif</small>
          </div>
          {hasData ? <WeekChart compact data={week} /> : <p>Riwayat latihan akan muncul setelah sesi selesai.</p>}
        </Card>

        {/* Progres Level Pengguna */}
        <Card sky className="dashboard-level stack">
          {rewardBurst && <div className="dashboard-reward-burst" role="status" aria-live="polite">
            <div className="dashboard-reward-mark" aria-hidden="true">
              <span>{rewardBurst.leveledUp ? user.level : `+${rewardBurst.gain}`}</span>
              {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--spark': index }} />)}
            </div>
            <div>
              <strong>{rewardBurst.leveledUp ? `Level ${user.level} terbuka!` : rewardBurst.gain ? `${rewardBurst.gain} poin masuk` : 'Sesi tersimpan'}</strong>
              <small>{rewardBurst.leveledUp ? 'Kebiasaan baikmu naik tingkat.' : 'Progres hari ini sudah tercatat.'}</small>
            </div>
          </div>}
          <div className="data-pair">
            <span>Total Poin Kumulatif</span>
            <small>Level {user.level}</small>
          </div>
          <strong>{user.totalPointsCumulative}</strong>
          <div>
            <div className="data-pair">
              <small>Progres ke Level {user.targetLevel}</small>
              <small>{user.totalPointsCumulative} / {user.levelProgressMax}</small>
            </div>
            <Progress value={user.totalPointsCumulative} max={user.levelProgressMax} />
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------------------
          5. BARIS BAWAH: SESI TERBARU, KOLEKSI BADGE, & TANTANGAN AKTIF
          -------------------------------------------------------------------- */}
      <div className="dashboard-bottom">
        {/* Riwayat Sesi Terbaru */}
        <Card className="stack">
          <div className="data-pair">
            <strong>Sesi Terbaru</strong>
            <Link to="/app/riwayat">Lihat semua</Link>
          </div>
          {sessions.slice(0, 2).map((session) => (
            <Link className="recent-session" to={`/app/riwayat/${session.id}`} key={session.id}>
              <FigmaIcon file="e2026.svg" />
              <span>
                <strong>{session.fullDate}</strong>
                <small>{session.totalDuration} · {session.uprightPercentage}% tegak</small>
              </span>
              <em>+{session.pointsEarned} poin</em>
            </Link>
          ))}
          {!sessions.length && <p className="dashboard-empty">Belum ada sesi. Selesaikan latihan pertamamu dan ringkasannya akan muncul di sini.</p>}
        </Card>

        {/* Koleksi Badge yang Terbuka */}
        <Card sky className="stack">
          <div className="data-pair">
            <strong>Badge Koleksi</strong>
            <small>{badges.filter(b => b.unlocked).length} / {badges.length} diperoleh</small>
          </div>
          <div className="dashboard-badges">
            {badges.filter((badge) => badge.unlocked).slice(0, 3).map((badge, i) => (
              <button key={badge.id} onClick={() => openModal('badge-detail', badge)}>
                <FigmaIcon file={['ea386.svg', 'f4338.svg', 'd7505.svg', 'f4338.svg'][i % 4]} />
                <span>{badge.title}</span>
                {!badge.claimed && <small>+{badge.rewardPoints} poin</small>}
              </button>
            ))}
          </div>
          {!badges.some((badge) => badge.unlocked) && <p className="dashboard-empty">Belum ada badge. Badge pertama terbuka setelah sesi valid pertamamu.</p>}
          <Button to="/app/reward" primary={claimableBadges.length > 0}>
            {claimableBadges.length > 0 ? `Klaim ${claimableBadges.length} hadiah` : 'Lihat pencapaian'}
          </Button>
        </Card>

        {/* Tantangan yang Sedang Berjalan */}
        <Card sky className="stack">
          <div className="data-pair">
            <strong>Tantangan Aktif</strong>
            <span className="soft-tag">{challenges.filter((c) => c.type === 'diikuti').length} aktif</span>
          </div>
          {activeChallenge && (
            <button className="dashboard-challenge" onClick={() => openModal('tantangan-detail', activeChallenge)}>
              <strong>{activeChallenge.title}</strong>
              <small>Hadiah: {activeChallenge.rewardValue}</small>
              <div className="data-pair">
                <small>Progres</small>
                <small>{activeChallenge.current}/{activeChallenge.total} hari</small>
              </div>
              <Progress value={activeChallenge.current} max={activeChallenge.total} pink />
            </button>
          )}
          {!activeChallenge && <p className="dashboard-empty">Belum ada tantangan yang diikuti. Pilih satu tantangan untuk menambah hadiah dari latihanmu.</p>}
          <Button to="/app/tantangan" primary={!activeChallenge}>{activeChallenge ? 'Lihat semua tantangan' : 'Pilih tantangan'}</Button>
        </Card>
      </div>
    </div>
  );
}
