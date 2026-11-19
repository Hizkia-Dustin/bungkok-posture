import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Sidebar from './Sidebar';
import GlobalModal from '../common/GlobalModal';
import AchievementToast from '../common/AchievementToast';
import ExerciseHost from '../monitor/ExerciseHost';
import FloatingMonitor from '../monitor/FloatingMonitor';
import '../../styles/app.css';
import { usePostureMonitor } from '../../context/PostureMonitorContext';

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { equippedItems } = useApp();
  const { closeMonitor } = usePostureMonitor();
  useEffect(() => () => closeMonitor(), [closeMonitor]);
  return <div className={`app-stage ${equippedItems['sky-morning'] ? 'sky-theme' : ''}`}><div className="app-shell"><div className="app-mobile-header"><strong>BUNGKOK</strong><button onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>Menu</button></div><Sidebar open={menuOpen} onNavClick={() => setMenuOpen(false)} /><main className="app-main"><Outlet /></main></div><GlobalModal /><ExerciseHost /><FloatingMonitor /><AchievementToast /></div>;
}
