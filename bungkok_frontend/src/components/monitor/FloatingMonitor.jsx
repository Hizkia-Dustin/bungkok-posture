import { useState } from 'react';
import { Button } from '../common/SoftUI';
import Dialog from '../common/Dialog';
import { clockLabel } from '../../utils/exercise';
import { usePostureMonitor } from '../../context/PostureMonitorContext';

export default function FloatingMonitor() {
  const { mounted, isOpen, snapshot, restoreMonitor, togglePause, finish } = usePostureMonitor();
  const [confirmFinish, setConfirmFinish] = useState(false);
  if (!mounted || isOpen || !['monitoring', 'paused', 'interrupted'].includes(snapshot.status)) return null;
  const metrics = snapshot.metrics || {};
  const valid = (metrics.upright || 0) + (metrics.forward || 0) + (metrics.backward || 0);
  const upright = valid ? Math.round((metrics.upright || 0) / valid * 100) : 0;
  return <aside className={`floating-monitor ${snapshot.posture}`} aria-live="polite">
    <span className="floating-monitor-dot" />
    <div><strong>{snapshot.status === 'paused' ? 'Latihan dijeda' : 'Latihan aktif'}</strong><small>{clockLabel(metrics.total || 0)} · {upright}% tegak</small></div>
    <Button onClick={restoreMonitor}>Buka</Button>
    <Button onClick={togglePause}>{snapshot.status === 'paused' ? 'Lanjut' : 'Jeda'}</Button>
    <Button primary onClick={() => setConfirmFinish(true)}>Selesai</Button>
    {confirmFinish && <Dialog title="Konfirmasi selesai latihan" onClose={() => setConfirmFinish(false)}>
      <h2>Simpan hasil latihan?</h2>
      <p>Sesi {clockLabel(metrics.total || 0)} akan diakhiri dan hasilnya disimpan ke riwayat. Sesi yang sudah disimpan tidak bisa dilanjutkan.</p>
      <div className="dialog-actions">
        <Button primary onClick={() => { setConfirmFinish(false); finish(); }}>Ya, simpan hasil</Button>
        <Button onClick={() => setConfirmFinish(false)}>Lanjut latihan</Button>
      </div>
    </Dialog>}
  </aside>;
}
