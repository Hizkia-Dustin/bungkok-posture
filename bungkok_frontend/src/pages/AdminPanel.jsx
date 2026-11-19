import { useEffect, useMemo, useState } from 'react';
import { Camera, Inbox, Search, Store, Users } from 'lucide-react';
import { Button, Card, PageHeader, Stat, Tabs } from '../components/common/SoftUI';
import UserAvatar from '../components/common/UserAvatar';
import { CAMERA_FRAMES, CameraFramePreview, activeCameraFrame } from '../components/common/CameraFrame';
import { useApp } from '../context/AppContext';
import { usePostureMonitor } from '../context/PostureMonitorContext';
import { fetchAdminOverview, saveAdminConfiguration, updateAdminReport } from '../services/postureApi';
import { playReminder } from '../utils/exportData';
import '../styles/admin.css';

const EMPTY = { stats: {}, users: [], reports: [], configuration: { shop: [], reminder: {} } };
const TABS = [
  ['ringkasan', 'Ringkasan'], ['laporan', 'Laporan & Saran'], ['pengguna', 'Pengguna'],
  ['pengujian', 'Uji Kamera'], ['pengaturan', 'Toko & Pengingat'],
];

export default function AdminPanel() {
  const { user, equippedItems, setEquippedItems } = useApp();
  const monitor = usePostureMonitor();
  const [overview, setOverview] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY.configuration);
  const [tab, setTab] = useState('ringkasan');
  const [status, setStatus] = useState('Memuat data…');
  const [query, setQuery] = useState('');
  const [reportFilter, setReportFilter] = useState('Semua');
  const [selectedId, setSelectedId] = useState('');
  const [ticketStatus, setTicketStatus] = useState('Diterima');
  const [reply, setReply] = useState('');
  const [savingTicket, setSavingTicket] = useState(false);
  const [testFrame, setTestFrame] = useState(activeCameraFrame(equippedItems));

  const load = async () => {
    setStatus('Memuat data…');
    try {
      const data = await fetchAdminOverview();
      setOverview({ ...EMPTY, ...data, reports: data.reports || [] });
      setDraft(structuredClone(data.configuration));
      setSelectedId((current) => current || data.reports?.[0]?.id || '');
      setStatus('Data terbaru sudah dimuat.');
    } catch (error) { setStatus(error.message); }
  };
  useEffect(() => { load(); }, []);

  const selectedReport = overview.reports.find((report) => report.id === selectedId);
  useEffect(() => {
    if (!selectedReport) return;
    setTicketStatus(selectedReport.status);
    setReply(selectedReport.teamReply?.message || '');
  }, [selectedId, selectedReport?.status, selectedReport?.teamReply?.message]);

  const filteredReports = useMemo(() => overview.reports.filter((report) => {
    const haystack = `${report.id} ${report.title} ${report.category} ${report.user?.name} ${report.user?.email}`.toLowerCase();
    return (reportFilter === 'Semua' || report.status === reportFilter) && haystack.includes(query.toLowerCase());
  }), [overview.reports, query, reportFilter]);
  const filteredUsers = useMemo(() => overview.users.filter((account) =>
    `${account.name} ${account.email} ${account.role}`.toLowerCase().includes(query.toLowerCase())), [overview.users, query]);

  const selectReport = (report) => { setSelectedId(report.id); setTicketStatus(report.status); setReply(report.teamReply?.message || ''); };
  const saveTicket = async () => {
    if (!selectedReport) return;
    setSavingTicket(true); setStatus('Menyimpan tanggapan…');
    try {
      const updated = await updateAdminReport(selectedReport.id, { status: ticketStatus, message: reply.trim() || null });
      setOverview((current) => {
        const reports = current.reports.map((report) => report.id === updated.id ? updated : report);
        return { ...current, reports, stats: { ...current.stats, open_reports: reports.filter((report) => report.status !== 'Selesai').length } };
      });
      setStatus(`Tiket ${updated.id} berhasil diperbarui.`);
    } catch (error) { setStatus(error.message); }
    finally { setSavingTicket(false); }
  };
  const updateItem = (index, key, value) => setDraft((current) => ({
    ...current, shop: current.shop.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
  }));
  const addItem = () => setDraft((current) => ({ ...current, shop: [...current.shop, {
    id: 'hadiah-' + Date.now(), name: 'Hadiah baru', type: 'Hadiah digital', price: 0,
    description: 'Jelaskan hadiah ini.', enabled: false,
  }] }));
  const removeItem = (index) => setDraft((current) => ({ ...current, shop: current.shop.filter((_, itemIndex) => itemIndex !== index) }));
  const saveConfiguration = async () => {
    setStatus('Menyimpan konfigurasi…');
    try {
      const configuration = await saveAdminConfiguration(draft);
      setOverview((current) => ({ ...current, configuration }));
      setDraft(structuredClone(configuration)); setStatus('Toko dan pengingat berhasil disimpan.');
    } catch (error) { setStatus(error.message); }
  };
  const startCameraTest = async () => {
    setStatus('Menyiapkan frame pengujian…');
    try {
      await setEquippedItems((previous) => ({ ...previous,
        'frame-sadar': testFrame === 'frame-sadar', 'frame-turns-on': testFrame === 'frame-turns-on',
      }));
      setStatus('Kamera pengujian dibuka. Ikuti kalibrasi lalu coba posisi tegak dan bungkuk.');
      monitor.openMonitor({ testMode: true });
    } catch (error) { setStatus(error.message); }
  };

  const statusClass = (value) => value === 'Selesai' ? 'done' : value === 'Ditangani' ? 'handling' : 'new';
  return <div className="app-page admin-page">
    <PageHeader title="Pusat Kendali Admin" subtitle="Pantau pengguna, tangani laporan, uji kamera, dan kelola pengalaman aplikasi.">
      <Button onClick={load}>Muat ulang</Button>
    </PageHeader>
    <div className="admin-status" role="status" aria-live="polite">{status}</div>
    <Tabs items={TABS} value={tab} onChange={(next) => { setTab(next); setQuery(''); }} label="Menu dashboard admin" />

    {tab === 'ringkasan' && <>
      <div className="app-grid grid-four admin-stats">
        <Stat sky label="Pengguna" value={overview.stats.total_users ?? 0} note="Akun terdaftar" />
        <Stat label="Perlu ditangani" value={overview.stats.open_reports ?? 0} note="Laporan belum selesai" />
        <Stat label="Sesi latihan" value={overview.stats.total_sessions ?? 0} note="Sesi tersimpan" />
        <Stat sky label="Hadiah aktif" value={draft.shop.filter((item) => item.enabled).length} note={`${draft.shop.length} item tersedia`} />
      </div>
      <div className="admin-home-grid">
        <Card className="stack admin-priority">
          <div className="admin-section-title"><div><span className="soft-tag">PRIORITAS</span><h2>Laporan terbaru</h2></div><Button onClick={() => setTab('laporan')}>Buka inbox</Button></div>
          {overview.reports.slice(0, 4).map((report) => <button className="admin-report-row" key={report.id} onClick={() => { selectReport(report); setTab('laporan'); }}>
            <span className={`admin-ticket-status ${statusClass(report.status)}`}>{report.status}</span>
            <span><strong>{report.title}</strong><small>{report.user?.name} · {report.category}</small></span><time>{report.date}</time>
          </button>)}
          {!overview.reports.length && <p className="admin-empty">Belum ada laporan atau saran dari pengguna.</p>}
        </Card>
        <div className="admin-quick-grid">
          {[
            ['laporan', Inbox, 'Laporan & saran', `${overview.stats.open_reports || 0} tiket perlu dilihat`],
            ['pengguna', Users, 'Pengguna', 'Lihat akun, level, dan saldo poin'],
            ['pengujian', Camera, 'Uji kamera', 'Coba deteksi bungkuk dan frame'],
            ['pengaturan', Store, 'Toko & pengingat', 'Atur hadiah dan suara'],
          ].map(([id, Icon, title, note]) => <button className="admin-quick-card" key={id} onClick={() => setTab(id)}>
            <Icon aria-hidden="true" /><span><strong>{title}</strong><small>{note}</small></span>
          </button>)}
        </div>
      </div>
    </>}

    {tab === 'laporan' && <section className="admin-inbox-layout">
      <Card className="admin-inbox-list">
        <div className="admin-section-title"><div><span className="soft-tag">INBOX</span><h2>Laporan & saran</h2></div><strong>{filteredReports.length}</strong></div>
        <label className="admin-search"><Search aria-hidden="true" /><span className="sr-only">Cari laporan</span><input type="search" placeholder="Cari tiket, nama, atau isi…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="admin-filter-row">{['Semua', 'Diterima', 'Ditangani', 'Selesai'].map((value) => <button key={value} aria-pressed={reportFilter === value} onClick={() => setReportFilter(value)}>{value}</button>)}</div>
        <div className="admin-ticket-list">{filteredReports.map((report) => <button className={selectedId === report.id ? 'selected' : ''} key={report.id} onClick={() => selectReport(report)}>
          <span className={`admin-ticket-status ${statusClass(report.status)}`}>{report.status}</span><strong>{report.title}</strong>
          <small>{report.user?.name} · {report.category}</small><time>{report.id} · {report.date}</time>
        </button>)}</div>
        {!filteredReports.length && <p className="admin-empty">Tidak ada laporan yang cocok dengan filter ini.</p>}
      </Card>
      <Card className="stack admin-ticket-detail">
        {selectedReport ? <>
          <div className="admin-ticket-heading"><div><span className={`admin-ticket-status ${statusClass(selectedReport.status)}`}>{selectedReport.status}</span><h2>{selectedReport.title}</h2><small>{selectedReport.id} · {selectedReport.date}</small></div><UserAvatar src={selectedReport.user?.avatar} name={selectedReport.user?.name} size={48} /></div>
          <div className="admin-user-summary"><strong>{selectedReport.user?.name}</strong><span>{selectedReport.user?.email}</span><small>{selectedReport.category}</small></div>
          <div className="admin-message"><span>Pesan pengguna</span><p>{selectedReport.description}</p></div>
          <details className="admin-device"><summary>Informasi perangkat</summary><p>{selectedReport.device || 'Tidak dicantumkan'}</p></details>
          {selectedReport.teamReply?.userReply && <div className="admin-message user-reply"><span>Balasan lanjutan pengguna</span><p>{selectedReport.teamReply.userReply}</p></div>}
          <label className="form-field">Status<select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)}><option>Diterima</option><option>Ditangani</option><option>Selesai</option></select></label>
          <label className="form-field">Balasan admin<textarea value={reply} maxLength="5000" placeholder="Tulis solusi atau tanggapan yang akan dilihat pengguna…" onChange={(event) => setReply(event.target.value)} /></label>
          <small>Pengguna akan melihat status dan balasan ini di halaman Laporan Saya.</small>
          <Button primary disabled={savingTicket} onClick={saveTicket}>{savingTicket ? 'Menyimpan…' : 'Simpan & kirim tanggapan'}</Button>
        </> : <div className="admin-empty-detail"><Inbox aria-hidden="true" /><h2>Pilih laporan</h2><p>Detail dan area balasan akan muncul di sini.</p></div>}
      </Card>
    </section>}

    {tab === 'pengguna' && <Card className="stack admin-users-panel">
      <div className="admin-section-title"><div><span className="soft-tag">AKUN</span><h2>Pengguna terdaftar</h2></div><strong>{filteredUsers.length} pengguna</strong></div>
      <label className="admin-search"><Search aria-hidden="true" /><span className="sr-only">Cari pengguna</span><input type="search" placeholder="Cari nama atau email…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="table-scroll"><table className="soft-table admin-user-table"><thead><tr><th>Pengguna</th><th>Peran</th><th>Level</th><th>Saldo poin</th></tr></thead><tbody>{filteredUsers.map((account) => <tr key={account.id}><td><div><UserAvatar src={account.avatar} name={account.name} size={40} /><span><strong>{account.name}</strong><small>{account.email}</small></span></div></td><td><span className={`admin-role ${account.role}`}>{account.role === 'admin' ? 'Admin' : 'Pengguna'}</span></td><td>Level {account.level}</td><td>{account.points} poin</td></tr>)}</tbody></table></div>
      {!filteredUsers.length && <p className="admin-empty">Pengguna tidak ditemukan.</p>}
    </Card>}

    {tab === 'pengujian' && <section className="admin-test-layout">
      <Card sky className="stack admin-test-copy"><span className="soft-tag">LAB PENGUJIAN</span><h2>Uji deteksi postur dan frame</h2><p>Pilih frame, buka kamera, selesaikan kalibrasi, lalu coba duduk tegak dan bungkuk. Ini menggunakan alur yang sama persis dengan pengguna.</p><ol><li>Pastikan kepala dan kedua bahu terlihat.</li><li>Selesaikan hitung mundur kalibrasi.</li><li>Coba posisi tegak, melihat ke samping, lalu bungkuk.</li><li>Pastikan frame tidak menutupi peringatan postur.</li></ol><Button primary onClick={startCameraTest}>{monitor.mounted ? 'Buka kembali monitor uji' : 'Buka kamera & uji postur'}</Button></Card>
      <Card className="stack"><div className="admin-section-title"><div><span className="soft-tag">FRAME AKTIF</span><h2>Pilih tampilan uji</h2></div></div><div className="admin-frame-grid">
        <button className={!testFrame ? 'selected' : ''} onClick={() => setTestFrame('')}><span className="admin-no-frame"><Camera aria-hidden="true" /></span><strong>Tanpa frame</strong></button>
        {CAMERA_FRAMES.map((frame) => <button className={testFrame === frame.id ? 'selected' : ''} onClick={() => setTestFrame(frame.id)} key={frame.id}><CameraFramePreview frameId={frame.id} src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0284c7&color=fff&bold=true`} name={user.name} /><strong>{frame.name}</strong></button>)}
      </div><small>Mode admin tidak memotong poin dan tidak perlu membuka frame terlebih dahulu.</small></Card>
    </section>}

    {tab === 'pengaturan' && <div className="admin-layout">
      <Card className="stack admin-editor"><div className="admin-section-title"><div><span className="soft-tag">TOKO HADIAH</span><h2>Inventaris hadiah</h2></div><Button onClick={addItem}>Tambah hadiah</Button></div>
        {draft.shop.map((item, index) => <fieldset className="admin-shop-item" key={item.id}><legend>{item.name || 'Hadiah tanpa nama'}</legend><label>Nama<input value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} /></label><label>Kategori<input value={item.type} onChange={(event) => updateItem(index, 'type', event.target.value)} /></label><label>Harga poin<input type="number" min="0" value={item.price} onChange={(event) => updateItem(index, 'price', Number(event.target.value))} /></label><label className="wide">Deskripsi<textarea value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} /></label><label className="admin-toggle"><input type="checkbox" checked={item.enabled} onChange={(event) => updateItem(index, 'enabled', event.target.checked)} /> Tampilkan di toko</label><Button className="admin-danger" onClick={() => removeItem(index)}>Hapus</Button></fieldset>)}
      </Card>
      <Card sky className="stack admin-reminder"><span className="soft-tag">PENGINGAT POSTUR</span><h2>Suara yang didengar pengguna</h2><label>Mode<select value={draft.reminder.mode || 'speech'} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder, mode: event.target.value } })}><option value="speech">Ucapan Bahasa Indonesia</option><option value="tone">Nada singkat</option></select></label><label>Kalimat pengingat<textarea maxLength="180" value={draft.reminder.message || ''} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder, message: event.target.value } })} /></label><label>Kecepatan ucapan<input type="range" min=".6" max="1.5" step=".1" value={draft.reminder.rate || 1} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder, rate: Number(event.target.value) } })} /></label><Button onClick={() => playReminder(80, draft.reminder)}>Tes pengingat</Button></Card>
      <div className="admin-savebar"><span>Perubahan toko berlaku untuk semua pengguna.</span><Button primary onClick={saveConfiguration}>Simpan konfigurasi</Button></div>
    </div>}
  </div>;
}
