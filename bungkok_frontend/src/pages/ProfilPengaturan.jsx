import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button, Card, PageHeader } from '../components/common/SoftUI';
import UserAvatar from '../components/common/UserAvatar';

function Toggle({ label, description, checked, onChange }) {
  return <label className="setting-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

export default function ProfilPengaturan() {
  const { user, equippedItems, openModal, updateUserProfile, updatePreferences } = useApp();
  const [name, setName] = useState(user.name);
  const save = (event) => {
    event.preventDefault();
    if (!name.trim()) return openModal('profil-error');
    updateUserProfile({ name: name.trim() });
  };
  const preference = (key, value) => updatePreferences({ [key]: value });
  return <div className="app-page">
    <PageHeader title="Profil & Pengaturan" subtitle="Atur identitas, target pribadi, dan kenyamanan latihanmu." />
    <div className="app-grid grid-side-main">
      <Card sky className="stack profile-card">
        <UserAvatar src={user.avatar} name={user.name} size={72} className={equippedItems['bingkai-cloud'] ? 'avatar-framed' : ''} />
        <h2>{user.name}</h2><p>{user.email}</p>
        <span className="soft-tag">{user.role === 'admin' ? 'Administrator' : 'Level ' + user.level} · {user.points} poin</span>
        <small>Badge pilihan: {user.selectedBadge}</small>
        <Button onClick={() => openModal('pilih-avatar')}>Ubah avatar</Button>
      </Card>
      <Card className="stack">
        <h3>Informasi profil</h3>
        <form className="stack" onSubmit={save} noValidate>
          <label className="form-field">Nama tampilan<input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field">Email<input type="email" value={user.email} readOnly /><small>Email dikelola melalui Supabase Auth.</small></label>
          <div className="soft-tabs"><Button type="submit" primary>Simpan perubahan</Button><Button onClick={() => openModal('ubah-password')}>Ubah kata sandi</Button></div>
        </form>
      </Card>
    </div>
    <div className="app-grid grid-two">
      <Card className="stack">
        <h3>Latihan yang nyaman untukmu</h3>
        <label className="form-field">Target durasi pribadi<select value={user.targetDuration} onChange={(event) => preference('targetDuration', Number(event.target.value))}>{[5,10,15,20,30,45,60].map((duration) => <option value={duration} key={duration}>{duration} menit per sesi</option>)}</select></label>
        <Toggle label="Suara pengingat" description="Aktif saat postur perlu disesuaikan" checked={user.reminderSoundActive} onChange={(value) => preference('reminderSoundActive', value)} />
        <div className="volume-control"><label htmlFor="volume">Volume {user.reminderVolume}%</label><input id="volume" type="range" min="0" max="100" value={user.reminderVolume} onChange={(event) => preference('reminderVolume', Number(event.target.value))} /><Button onClick={() => openModal('tes-suara')}>Tes suara</Button></div>
        <Toggle label="Pengingat jeda" description="Ingatkan untuk beristirahat" checked={user.breakReminderActive} onChange={(value) => preference('breakReminderActive', value)} />
        <small>Target adalah preferensi kebiasaan, bukan anjuran medis.</small>
      </Card>
      <Card className="stack">
        <h3>Akun & privasi</h3>
        <p>Kamera digunakan saat persiapan, kalibrasi, dan latihan. Riwayat menyimpan ringkasan, bukan foto atau video.</p>
        <div className="soft-tabs"><Button onClick={() => openModal('unduh-data')}>Unduh data</Button><Button onClick={() => openModal('keluar-akun')}>Keluar akun</Button></div>
        <hr className="soft-rule" /><strong>Kelola data akun</strong><small>Tindakan ini membutuhkan konfirmasi terpisah.</small>
        <div className="soft-tabs"><Button onClick={() => openModal('hapus-riwayat')}>Hapus riwayat</Button><Button onClick={() => openModal('hapus-akun')}>Hapus akun</Button></div>
      </Card>
    </div>
  </div>;
}
