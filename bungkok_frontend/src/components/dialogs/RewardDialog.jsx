import { useApp } from '../../context/AppContext';
import { Button } from '../common/SoftUI';
import { FigmaIcon } from '../common/FigmaAsset';
import { CAMERA_FRAMES, CameraFramePreview } from '../common/CameraFrame';

export default function RewardDialog({ type, payload }) {
  const { user, ownedItems, equippedItems, closeModal, openModal, redeemItem, setEquippedItems } = useApp();
  const item = payload.item;
  const adminTesting = user.role === 'admin';
  const isCameraFrame = CAMERA_FRAMES.some((frame) => frame.id === item?.id);
  const cost = adminTesting ? 0 : item?.price || 0;
  const owned = Boolean(ownedItems[item?.id]);
  const equipped = Boolean(equippedItems[item?.id]);
  const avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0284c7&color=fff&bold=true`;
  if (type === 'frame-preview') {
    const canBuy = adminTesting || user.points >= item.price;
    const applyFrame = () => { setEquippedItems((previous) => ({ ...previous, 'frame-sadar': false, 'frame-turns-on': false, [item.id]: true })); closeModal(); };
    return <><h2>Coba {item.name}</h2><p>Pratinjau ini memakai avatar akun {user.name}. Saat latihan, area foto akan berubah menjadi kamera realtime di jendela PiP.</p><div className="reward-frame-dialog-preview"><CameraFramePreview frameId={item.id} src={avatar} name={user.name} /></div><div className="dialog-stack"><div className="data-pair"><span>Harga</span><strong>{adminTesting && !owned ? 'Gratis untuk admin' : `${item.price} poin`}</strong></div><div className="data-pair"><span>Saldo tersedia</span><strong>{user.points} poin</strong></div></div><div className="dialog-actions">{owned ? <Button primary disabled={equipped} onClick={applyFrame}>{equipped ? 'Sedang digunakan' : 'Gunakan frame ini'}</Button> : <Button primary={canBuy} onClick={() => openModal(canBuy ? 'tukar-konfirmasi' : 'poin-kurang', { item })}>{adminTesting ? 'Aktifkan untuk tes' : canBuy ? 'Tukar dengan poin' : `Kurang ${item.price - user.points} poin`}</Button>}<Button onClick={closeModal}>Kembali ke toko</Button></div></>;
  }
  if (type === 'saldo-tersedia') return <><h2>Saldo tersedia: {user.points} poin</h2><p>Poin diperoleh dari sesi latihan dengan postur tegak. Gunakan poin untuk menukarkan tema dan dekorasi avatar di Toko Hadiah.</p><div className="dialog-actions"><Button onClick={closeModal}>Kembali ke hadiah</Button></div></>;
  if (type === 'poin-kurang') return <><h2>Poin belum cukup</h2><p>{item.name} membutuhkan {item.price} poin.</p><div className="dialog-stack"><div className="data-pair"><span>Saldo tersedia</span><strong>{user.points} poin</strong></div><div className="data-pair"><span>Masih dibutuhkan</span><strong>{item.price - user.points} poin</strong></div><p>Kumpulkan poin melalui sesi valid. Mengambil jeda tidak mengurangi poinmu.</p></div><div className="dialog-actions"><Button onClick={closeModal}>Kembali ke hadiah</Button></div></>;
  if (type === 'hadiah-berhasil') return <><h2>{adminTesting && isCameraFrame ? 'Frame siap diuji.' : 'Hadiah berhasil ditukar.'}</h2><p>{item.name} sekarang menjadi milikmu.</p><div className="dialog-stack"><FigmaIcon className="self-start" file="feae8.svg" /><div className="data-pair"><span>{adminTesting ? 'Mode pengujian' : 'Poin digunakan'}</span><strong>{adminTesting ? 'Admin' : `−${payload.usedPoints}`}</strong></div><div className="data-pair"><span>Saldo tersedia</span><strong>{payload.newPoints} poin</strong></div><small>{user.totalPointsCumulative} poin kumulatif · Level {user.level}</small></div><div className="dialog-actions"><Button primary onClick={() => { setEquippedItems((previous) => isCameraFrame
    ? { ...previous, 'frame-sadar': false, 'frame-turns-on': false, [item.id]: true }
    : { ...previous, [item.id]: true }); closeModal(); }}>Terapkan hadiah</Button><Button onClick={() => openModal('saldo-tersedia')}>Lihat saldo</Button></div></>;
  return <><h2>{adminTesting ? `Aktifkan ${item.name} untuk pengujian?` : `Tukar ${item.id === 'bingkai-cloud' ? 'Bingkai Avatar Cloud' : item.name}?`}</h2><p>{adminTesting ? 'Akun admin dapat membuka frame tanpa mengurangi saldo.' : 'Hadiah virtual untuk akunmu.'}</p><div className="dialog-stack"><div className="data-pair"><span>Harga</span><strong>{adminTesting ? 'Gratis untuk admin' : `${item.price} poin`}</strong></div><div className="data-pair"><span>Saldo sekarang</span><strong>{user.points} poin</strong></div><hr className="soft-rule" /><div className="data-pair"><span>Saldo setelah tukar</span><strong>{user.points - cost} poin</strong></div><small>Total poin kumulatif tetap {user.totalPointsCumulative}. Level {user.level} tidak berubah.</small></div><div className="dialog-actions"><Button primary onClick={() => redeemItem(item.id)}>{adminTesting ? 'Aktifkan untuk tes' : 'Tukar poin'}</Button><Button onClick={closeModal}>Batal</Button></div></>;
}
