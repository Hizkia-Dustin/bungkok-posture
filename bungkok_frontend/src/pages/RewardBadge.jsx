import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button, Card, PageHeader, Progress, Stat, Tabs } from '../components/common/SoftUI';
import { FigmaIcon } from '../components/common/FigmaAsset';
import { CAMERA_FRAMES, CameraFramePreview } from '../components/common/CameraFrame';
import '../styles/rewards.css';

export default function RewardBadge() {
  const location = useLocation();
  const { user, badges, ownedItems, equippedItems, setEquippedItems, pointsHistory, openModal, claimAchievement, appConfig } = useApp();
  const virtualShopData = appConfig.shop;
  const [tab, setTab] = useState(location.state?.tab || 'pencapaian');
  const unlocked = badges.filter((badge) => badge.unlocked);
  const claimable = unlocked.filter((badge) => !badge.claimed);
  const claimed = unlocked.filter((badge) => badge.claimed);
  const spent = pointsHistory.filter((entry) => entry.type === 'out').reduce(
    (sum, entry) => sum + Number(String(entry.change).replace(/[^0-9]/g, '') || 0), 0,
  );
  const levelStart = Math.max(0, (user.level - 1) * 100);
  const levelEnd = user.levelProgressMax || user.level * 100;
  const levelValue = Math.max(0, user.totalPointsCumulative - levelStart);
  const levelMax = Math.max(1, levelEnd - levelStart);

  return (
    <div className="app-page rewards-page">
      <PageHeader title="Pencapaian & Hadiah" subtitle="Klaim pencapaian, kumpulkan poin, lalu pilih hadiah yang ingin digunakan." />
      <div className="rewards-overview">
        <Card sky className="reward-balance-card">
          <span>Saldo tersedia</span><strong>{user.points}</strong><small>poin yang dapat digunakan</small>
          <Button onClick={() => setTab('riwayat')}>Lihat riwayat</Button>
        </Card>
        <Card className="reward-level-card">
          <div className="reward-section-heading">
            <div><span className="soft-tag">Level {user.level}</span><h2>{user.levelTitle}</h2></div>
            <strong>{user.totalPointsCumulative} poin</strong>
          </div>
          <Progress value={levelValue} max={levelMax} pink label={`Progres menuju level ${user.targetLevel}`} />
          <div className="data-pair"><small>Poin kumulatif tidak berkurang saat hadiah ditukar.</small><small>{user.pointsToNextLevel} poin lagi</small></div>
        </Card>
      </div>
      <Tabs items={[
        ['pencapaian', `Pencapaian (${unlocked.length}/${badges.length})`],
        ['hadiah', 'Toko Hadiah'], ['riwayat', 'Riwayat Poin'],
      ]} value={tab} onChange={setTab} label="Pencapaian dan hadiah" />

      {tab === 'pencapaian' && <Card className="stack reward-section">
        <div className="reward-section-heading">
          <div><h3>Koleksi pencapaian</h3><p>{claimable.length ? `${claimable.length} hadiah siap masuk ke saldo.` : 'Semua hadiah yang terbuka sudah diklaim.'}</p></div>
          <span className={`claim-status ${claimable.length ? 'ready' : ''}`}>{claimed.length} diklaim</span>
        </div>
        <div className="achievement-grid">
          {badges.map((badge) => <article className={`achievement-card ${!badge.unlocked ? 'locked' : ''}`} key={badge.id}>
            <div className="achievement-icon" aria-hidden="true"><FigmaIcon file={badge.unlocked ? '79a7a.svg' : '362f7.svg'} /></div>
            <div className="achievement-copy">
              <span>{badge.unlocked ? (badge.claimed ? 'Sudah diklaim' : 'Siap diklaim') : 'Terkunci'}</span>
              <h4>{badge.title}</h4><p>{badge.description}</p>
              <small>{badge.unlocked ? `Terbuka ${badge.date}` : badge.progressText}</small>
            </div>
            <div className="achievement-action">
              <strong>+{badge.rewardPoints} poin</strong>
              {badge.unlocked && !badge.claimed
                ? <Button primary onClick={() => claimAchievement(badge.id)}>Klaim poin</Button>
                : <Button disabled={!badge.unlocked} onClick={() => openModal('badge-detail', badge)}>{badge.unlocked ? 'Lihat detail' : 'Belum tersedia'}</Button>}
            </div>
          </article>)}
        </div>
      </Card>}

      {tab === 'hadiah' && <section className="reward-shop" aria-label="Toko hadiah virtual">
        <div className="reward-section-heading"><div><h3>Toko hadiah</h3><p>Hadiah yang ditukar tetap menjadi milik akunmu.</p></div><span className="claim-status">{Object.keys(ownedItems).length} dimiliki</span></div>
        <div className="reward-shop-grid">
          {virtualShopData.map((item, index) => {
            const owned = Boolean(ownedItems[item.id]);
            const equipped = Boolean(equippedItems[item.id]);
            const affordable = user.role === 'admin' || user.points >= item.price;
            const isCameraFrame = CAMERA_FRAMES.some((frame) => frame.id === item.id);
            return <Card sky={index === 0} className="reward-product" key={item.id}>
              {isCameraFrame
                ? <button type="button" className="reward-frame-tryon" aria-label={`Lihat ${item.name} dengan avatar saya`} onClick={() => openModal('frame-preview', { item })}>
                    <CameraFramePreview frameId={item.id} src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0284c7&color=fff&bold=true`} name={user.name} />
                    <span>Lihat pada avatarku</span>
                  </button>
                : <div className="reward-product-icon" aria-hidden="true"><FigmaIcon file={['e3443.svg', 'ea386.svg', 'f4338.svg'][index % 3]} /></div>}
              <span>{item.type}</span><h3>{item.name}</h3><p>{item.description}</p>
              <div className="reward-product-footer"><strong>{item.price} poin</strong>
                {owned
                  ? <Button primary={!equipped} onClick={() => setEquippedItems((previous) => isCameraFrame
                    ? { ...previous, 'frame-sadar': false, 'frame-turns-on': false, [item.id]: !previous[item.id] }
                    : { ...previous, [item.id]: !previous[item.id] })}>{equipped ? 'Lepaskan' : 'Gunakan'}</Button>
                  : <Button primary={affordable} onClick={() => openModal(affordable ? 'tukar-konfirmasi' : 'poin-kurang', { item })}>{user.role === 'admin' ? 'Aktifkan untuk tes' : affordable ? 'Tukar hadiah' : `Kurang ${item.price - user.points}`}</Button>}
              </div>
            </Card>;
          })}
        </div>
      </section>}

      {tab === 'riwayat' && <>
        <div className="app-grid grid-three">
          <Stat sky label="Saldo tersedia" value={user.points} note="Dapat digunakan untuk hadiah" />
          <Stat label="Poin kumulatif" value={user.totalPointsCumulative} note="Menentukan level akun" />
          <Stat label="Poin ditukar" value={`−${spent}`} note="Total penukaran hadiah" />
        </div>
        <Card className="stack points-table">
          <div className="reward-section-heading"><div><h3>Riwayat poin</h3><p>Setiap pemasukan dan penggunaan saldo tercatat di sini.</p></div></div>
          <div className="table-scroll"><table className="soft-table"><thead><tr>{['Tanggal', 'Aktivitas', 'Perubahan', 'Keterangan'].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>
            {pointsHistory.map((entry, index) => <tr key={`${entry.date}-${entry.activity}-${index}`}><td>{entry.date}</td><td>{entry.activity}</td><td><strong className={entry.type === 'out' ? 'points-out' : 'points-in'}>{entry.change}</strong></td><td>{entry.note}</td></tr>)}
          </tbody></table></div>
        </Card>
      </>}
    </div>
  );
}
