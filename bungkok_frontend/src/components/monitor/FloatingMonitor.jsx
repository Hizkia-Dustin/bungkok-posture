import { Button } from '../common/SoftUI';
import { clockLabel } from '../../utils/exercise';
import { usePostureMonitor } from '../../context/PostureMonitorContext';
import { useLocation } from 'react-router-dom';

export default function FloatingMonitor() {
  const location = useLocation();
  const { mounted, isOpen, snapshot, restoreMonitor, togglePause, finish } = usePostureMonitor();
  if (location.pathname === '/app/dashboard' || !mounted || isOpen || !['monitoring', 'paused', 'interrupted'].includes(snapshot.status)) return null;
  const metrics = snapshot.metrics || {};
  const valid = (metrics.upright || 0) + (metrics.forward || 0) + (metrics.backward || 0);
  const upright = valid ? Math.round((metrics.upright || 0) / valid * 100) : 0;
  return <aside className={`floating-monitor ${snapshot.posture}`} aria-live="polite">
    <span className="floating-monitor-dot" />
    <div><strong>{snapshot.status === 'paused' ? 'Latihan dijeda' : 'Latihan aktif'}</strong><small>{clockLabel(metrics.total || 0)} · {upright}% tegak</small></div>
    <Button onClick={restoreMonitor}>Buka</Button>
    <Button onClick={togglePause}>{snapshot.status === 'paused' ? 'Lanjut' : 'Jeda'}</Button>
    <Button primary onClick={finish}>Selesai</Button>
  </aside>;
}
