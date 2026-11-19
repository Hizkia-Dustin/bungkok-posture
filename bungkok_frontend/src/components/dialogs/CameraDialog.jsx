import { useEffect, useRef, useState } from 'react';
import { Button } from '../common/SoftUI';
import { useApp } from '../../context/AppContext';

export default function CameraDialog() {
  const { closeModal } = useApp();
  const video = useRef(null);
  const stream = useRef(null);
  const alive = useRef(true);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; stream.current?.getTracks().forEach((track) => track.stop()); }; }, []);
  const start = async () => {
    setStatus('loading');
    try {
      const media = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if (!alive.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      video.current.srcObject = media;
      setStatus('active');
    } catch { if (alive.current) {setError('Kamera tidak dapat diakses. Periksa izin browser atau tutup aplikasi lain yang memakai kamera.'); setStatus('idle');} }
  };
  return <><h2>Siapkan kamera</h2><p>Pratinjau kamera berjalan di perangkatmu. Buka menu Latihan untuk memulai kalibrasi postur dengan model AI MediaPipe 3D.</p><video ref={video} autoPlay muted playsInline style={{width:'100%',aspectRatio:'4/3',background:'#d6e4ef',borderRadius:16}} /><p role="status">{error || (status === 'active' ? 'Pratinjau aktif. Kamera siap digunakan untuk deteksi postur.' : status === 'loading' ? 'Menunggu izin kamera…' : 'Izinkan kamera saat kamu siap.')}</p><div className="dialog-actions"><Button primary disabled={status !== 'idle'} onClick={start}>Aktifkan pratinjau</Button><Button onClick={closeModal}>Tutup kamera</Button></div></>;
}
