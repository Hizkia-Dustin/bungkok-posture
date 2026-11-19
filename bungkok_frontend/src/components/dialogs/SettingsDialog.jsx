import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../common/SoftUI';
import { activeCameraFrame, CAMERA_FRAMES, CameraFramePreview } from '../common/CameraFrame';
import { downloadAccountData, playReminder } from '../../utils/exportData';

export default function SettingsDialog({ type }) {
  const app = useApp();
  const { user, closeModal, openModal, clearHistory, deleteAccount, logout, updateUserProfile, appConfig,
    ownedItems, equippedItems, setEquippedItems } = app;
  const navigate = useNavigate();
  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [error, setError] = useState('');
  const [played, setPlayed] = useState(false);
  const [avatar, setAvatar] = useState(user.avatar);
  const [selectedFrame, setSelectedFrame] = useState(activeCameraFrame(equippedItems));
  const back = (label = 'Kembali ke profil') => <div className="dialog-actions"><Button primary onClick={closeModal}>{label}</Button></div>;

  if (type === 'profil-disimpan') return <><h2>Perubahan berhasil disimpan</h2><p>Profil dan preferensi latihanmu sudah diperbarui.</p>{back()}</>;
  if (type === 'profil-error') return <><h2>Nama belum valid</h2><p>Nama tampilan tidak boleh kosong.</p>{back('Perbaiki isian')}</>;
  if (type === 'ubah-password') return <><h2>Ubah kata sandi</h2><p>Kata sandi baru minimal delapan karakter.</p><form onSubmit={async (event) => {
    event.preventDefault(); setError('');
    if (passwords.next !== passwords.confirm) return setError('Konfirmasi kata sandi belum sama.');
    if (passwords.next.length < 8) return setError('Gunakan minimal delapan karakter.');
    const { error: failure } = await supabase.auth.updateUser({ password: passwords.next });
    if (failure) return setError(failure.message);
    openModal('profil-disimpan');
  }}><div className="dialog-stack">{[['next','Kata sandi baru'],['confirm','Konfirmasi kata sandi']].map(([key,label]) => <label className="form-field" key={key}>{label}<input type="password" required minLength={8} autoComplete="new-password" value={passwords[key]} onChange={(event) => setPasswords({...passwords,[key]:event.target.value})} /></label>)}{error && <p role="alert" className="form-error">{error}</p>}</div><div className="dialog-actions"><Button type="submit" primary>Simpan kata sandi</Button><Button onClick={closeModal}>Batal</Button></div></form></>;
  if (type === 'pilih-avatar') {
    const previewAvatar = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0284c7&color=fff&bold=true`;
    return <><h2>Pilih avatar & frame kamera</h2><p>Unggah fotomu, lalu pilih frame yang sudah dibuka dari Toko Hadiah.</p><div className="dialog-stack"><img src={previewAvatar} alt="Pratinjau avatar" width="88" height="88" style={{borderRadius:18,objectFit:'cover',height:88}} /><label className="form-field">Pilih gambar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError('Pilih gambar maksimal 2 MB.');
    const reader = new FileReader(); reader.onload = () => { setAvatar(reader.result); setError(''); }; reader.readAsDataURL(file);
  }} /></label><strong>Frame kamera</strong><div className="avatar-frame-picker">
    <button type="button" className={`avatar-frame-option ${!selectedFrame ? 'selected' : ''}`} onClick={() => setSelectedFrame('')}>
      <span className="avatar-frame-none">Tanpa frame</span><strong>Standar</strong><small>Selalu tersedia</small>
    </button>
    {CAMERA_FRAMES.map((frame) => {
      const owned = Boolean(ownedItems[frame.id]);
      const shopItem = appConfig.shop.find((item) => item.id === frame.id) || frame;
      return <button type="button" disabled={!owned} className={`avatar-frame-option ${selectedFrame === frame.id ? 'selected' : ''} ${!owned ? 'locked' : ''}`} onClick={() => setSelectedFrame(frame.id)} key={frame.id}>
        <CameraFramePreview frameId={frame.id} src={previewAvatar} name={user.name} /><strong>{shopItem.name}</strong><small>{owned ? 'Sudah dibuka' : `${shopItem.price} poin · masih terkunci`}</small>
      </button>;
    })}
  </div>{CAMERA_FRAMES.some((frame) => !ownedItems[frame.id]) && <Button onClick={() => { closeModal(); navigate('/app/reward', { state: { tab: 'hadiah' } }); }}>Buka Toko Hadiah</Button>}{error && <p className="form-error" role="alert">{error}</p>}</div><div className="dialog-actions"><Button primary onClick={async () => {
    await setEquippedItems((previous) => ({ ...previous,
      'frame-sadar': selectedFrame === 'frame-sadar',
      'frame-turns-on': selectedFrame === 'frame-turns-on',
    }));
    await updateUserProfile({ avatar });
  }}>Simpan avatar & frame</Button><Button onClick={closeModal}>Batal</Button></div></>;
  }
  if (type === 'tes-suara') return <><h2>Tes pengingat suara</h2><p>Volume {user.reminderVolume}% · {appConfig.reminder.mode === 'speech' ? 'ucapan' : 'nada'}.</p><p role="status">{played ? 'Pengingat berhasil diputar.' : 'Tekan tombol untuk mendengar konfigurasi dari admin.'}</p>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><Button primary onClick={async () => { try { await playReminder(user.reminderVolume, appConfig.reminder); setPlayed(true); } catch (failure) { setError(failure.message); } }}>Putar suara</Button><Button onClick={closeModal}>Selesai</Button></div></>;
  if (type === 'unduh-data') return <><h2>Unduh data akun</h2><p>CSV berisi profil, preferensi, sesi, dan riwayat poin. Tidak ada foto atau video kamera.</p><div className="dialog-actions"><Button primary onClick={() => downloadAccountData(app)}>Unduh CSV</Button><Button onClick={closeModal}>Selesai</Button></div></>;

  const config = {
    'keluar-akun': ['Keluar dari akun?', 'Kamu dapat masuk kembali untuk melanjutkan progres.', 'Keluar', async () => { await logout(); navigate('/login'); }],
    'hapus-riwayat': ['Hapus riwayat latihan?', 'Ringkasan sesi akan dihapus permanen. Progres poin tetap tersimpan.', 'Hapus riwayat', async () => { await clearHistory(); closeModal(); }],
    'hapus-akun': ['Hapus akun ' + user.name.split(' ')[0] + '?', 'Profil, riwayat, poin, dan hadiah akan dihapus permanen dari aplikasi serta Supabase Auth.', 'Hapus akun', async () => { await deleteAccount(); navigate('/'); }],
  }[type];
  if (!config) return null;
  return <><h2>{config[0]}</h2><p>{config[1]}</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><Button primary onClick={async () => { try { await config[3](); } catch (failure) { setError(failure.message); } }}>{config[2]}</Button><Button onClick={closeModal}>Batal</Button></div></>;
}
