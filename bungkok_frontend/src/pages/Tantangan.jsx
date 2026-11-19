import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button, Card, PageHeader, Progress, Tabs } from '../components/common/SoftUI';
import { FigmaIcon } from '../components/common/FigmaAsset';

export default function Tantangan() {
  const { challenges, badges, openModal } = useApp();
  const [tab, setTab] = useState('diikuti');
  const entries = challenges.filter((entry) => entry.type === tab);
  const completed = challenges.find((entry) => entry.type === 'selesai');
  const openChallenge = (entry) => {
    if (entry.type === 'tersedia') openModal('tantangan-konfirmasi', entry);
    else if (entry.completed) openModal('badge-detail', badges.find((badge) => badge.id === entry.id));
    else openModal('tantangan-detail', entry);
  };
  const renderChallenge = (entry, hero = false) => <Card key={entry.id} sky={hero} className={`stack challenge-card ${hero ? 'challenge-hero' : ''}`}><span className="soft-tag">{entry.period} · {entry.status}</span>{hero && <FigmaIcon file="79a7a.svg" className="challenge-medal" />}<h2>{entry.title}</h2><p>{entry.description}</p>{entry.type !== 'tersedia' && <><div className="data-pair"><span>{entry.id === 'ingat-jeda' ? 'Jeda yang diikuti' : 'Progres sejak bergabung'}</span><strong>{entry.current} / {entry.total} {entry.unit}</strong></div><Progress value={entry.current} max={entry.total} pink={entry.id !== 'ingat-jeda'} /></>}<div className="challenge-actions"><Button primary={hero || entry.type === 'tersedia'} onClick={() => openChallenge(entry)}>{entry.completed ? 'Lihat badge yang diperoleh' : entry.type === 'tersedia' ? 'Ikuti tantangan' : hero ? 'Lihat syarat tantangan' : 'Lihat detail'}</Button><strong>{entry.rewardText}</strong></div></Card>;
  return <div className="app-page"><PageHeader title="Tantangan" subtitle="Pilih target kecil yang sesuai dengan rutinitasmu." /><Tabs value={tab} onChange={setTab} label="Status tantangan" items={[["diikuti", `Diikuti · ${challenges.filter((entry) => entry.type === 'diikuti').length}`], ["tersedia", "Tersedia"], ["selesai", `Selesai · ${challenges.filter((entry) => entry.type === 'selesai').length}`]]} />{entries.length > 0 ? <><div className="app-grid grid-main-side">{renderChallenge(entries[0], true)}<Card className="stack"><h2>Langkahmu tetap berarti.</h2><p>Hadiah diberikan otomatis satu kali setelah target terpenuhi.</p><hr className="soft-rule" /><p>Jeda diperbolehkan.<br />Tidak ada pengurangan poin.<br />Tidak perlu menahan posisi.</p></Card></div><div className="app-grid grid-two">{entries.slice(1).map((entry) => renderChallenge(entry))}{tab === 'diikuti' && completed && renderChallenge(completed)}</div></> : <Card className="stack"><h2>Semua tantangan sudah kamu ikuti.</h2><p>Lihat progresmu di tab Diikuti.</p><Button onClick={() => setTab('diikuti')}>Lihat tantangan diikuti</Button></Card>}</div>;
}
