import { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FigmaIcon } from './FigmaAsset';
import '../../styles/rewards.css';

export default function AchievementToast() {
  const { achievementToast, dismissAchievement } = useApp();
  useEffect(() => {
    if (!achievementToast?.visible) return undefined;
    const timer = window.setTimeout(dismissAchievement, 4500);
    return () => window.clearTimeout(timer);
  }, [achievementToast?.visible, dismissAchievement]);
  if (!achievementToast?.visible) return null;
  const badge = achievementToast.badge;
  return <aside className="achievement-toast" role="status" aria-live="polite">
    <span className="achievement-toast-icon"><FigmaIcon file="79a7a.svg" /></span>
    <div><small>{badge?.message ? 'Hadiah berhasil diklaim' : 'Pencapaian baru'}</small><strong>{badge?.title || 'Pencapaian terbuka'}</strong><p>{badge?.message || badge?.description}</p></div>
    <button onClick={dismissAchievement} aria-label="Tutup pemberitahuan">×</button>
  </aside>;
}
