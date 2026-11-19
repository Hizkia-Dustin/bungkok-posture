import { Link } from 'react-router-dom';

// ============================================================================
// KOMPONEN: PageHeader
// Header halaman aplikasi dashboard dengan judul, subjudul, dan slot aksi sebelah kanan
// ============================================================================
export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children || null}
    </header>
  );
}

// ============================================================================
// KOMPONEN: Card
// Kontainer kartu putih / biru langit dengan rounded corner dan bayangan lembut
// ============================================================================
export function Card({ children, className = '', sky = false, ...props }) {
  return (
    <section className={`soft-card ${sky ? 'sky-card' : ''} ${className}`} {...props}>
      {children}
    </section>
  );
}

// ============================================================================
// KOMPONEN: Button
// Tombol serbaguna: jika diberi properti `to` akan merender Link (routing),
// jika tidak akan merender <button>. `primary` memberi background pink & tulisan putih.
// ============================================================================
export function Button({ children, to, primary = false, className = '', ...props }) {
  const classes = `soft-button ${primary ? 'primary' : ''} ${className}`;
  return to ? (
    <Link to={to} className={classes} {...props}>{children}</Link>
  ) : (
    <button className={classes} type="button" {...props}>{children}</button>
  );
}

// ============================================================================
// KOMPONEN: Stat
// Kartu statistik ringkas yang menampilkan label, nilai angka tebal, dan catatan kecil
// ============================================================================
export function Stat({ label, value, note, sky = false, className = '', children }) {
  return (
    <Card sky={sky} className={`stat-card ${className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      {children}
    </Card>
  );
}

// ============================================================================
// KOMPONEN: Progress
// Progress bar dengan animasi bar horizontal (opsi pink untuk aksen)
// ============================================================================
export function Progress({ value, max = 100, pink = false, label = 'Progres' }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className={`soft-progress ${pink ? 'pink-progress' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

// ============================================================================
// KOMPONEN: Tabs
// Komponen tab switcher untuk berganti filter/kategori
// ============================================================================
export function Tabs({ items, value, onChange, label }) {
  return (
    <div className="soft-tabs" aria-label={label}>
      {items.map(([id, title]) => (
        <button
          key={id}
          className={`soft-button ${value === id ? 'primary' : ''}`}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {title}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// KOMPONEN: WeekChart
// Diagram batang mingguan (Senin - Minggu) untuk melihat durasi postur tegak harian
// ============================================================================
export function WeekChart({ compact = false, data = [] }) {
  return (
    <div
      className={`week-chart ${compact ? 'compact-chart' : ''}`}
      role="img"
      aria-label={`Durasi valid: ${data.map(day => `${day.day}: ${day.value} menit`).join(', ')}`}
    >
      {data.map((day) => (
        <div className="chart-column" key={day.day}>
          <div className="chart-track">
            <span
              style={{ height: `${(day.value / Math.max(30, ...data.map(item => item.value))) * 100}%` }}
              className={day.isCurrent ? 'current' : ''}
            />
          </div>
          {!compact && <strong>{day.value} m</strong>}
          <small>{day.day}{compact && ` · ${day.value}m`}</small>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KOMPONEN: EmptyState
// Tampilan placeholder ramah ketika belum ada sesi latihan yang terekam
// ============================================================================
export function EmptyState({ title, children, history = false }) {
  return (
    <Card sky className="empty-state">
      {history && <span className="soft-tag">Belum ada data</span>}
      <h2>{title}</h2>
      <p>{children}</p>
      {!history && <Button to="/app/riwayat">Lihat riwayat latihan</Button>}
      <Button to="/app/dashboard" primary>Mulai latihan</Button>
      {history && <small>Kembali ke Dashboard untuk menyiapkan webcam.</small>}
    </Card>
  );
}

// ============================================================================
// KOMPONEN: Distribution
// Menampilkan rincian persentase postur tegak vs condong depan / belakang
// ============================================================================
export function Distribution({ session }) {
  return (
    <>
      <div className="data-pair">
        <span>Tegak</span>
        <strong>{session.uprightDuration} · {session.uprightPercentage}%</strong>
      </div>
      <Progress value={session.uprightPercentage} label="Persentase tegak" />
      <div className="data-pair">
        <span>Condong ke depan</span>
        <strong>{session.forwardLean}</strong>
      </div>
      <div className="data-pair">
        <span>Condong ke belakang</span>
        <strong>{session.backwardLean}</strong>
      </div>
    </>
  );
}
