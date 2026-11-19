import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, RefreshCw } from 'lucide-react';
import { connectPhoneToRoom } from '../services/peerService';
import { Button } from '../components/common/SoftUI';
import '../styles/phone-camera.css';

export default function MobileSideCamera() {
  const [params] = useSearchParams();
  const pairedRoom = (params.get('room') || '').trim();
  const [room, setRoom] = useState(pairedRoom);
  const [facing, setFacing] = useState('environment');
  const [attempt, setAttempt] = useState(0);
  const [stream, setStream] = useState(null);
  const [target, setTarget] = useState(pairedRoom);
  const [callAttempt, setCallAttempt] = useState(0);
  const [status, setStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const video = useRef(null);
  const secure = window.isSecureContext;

  useEffect(() => {
    let current = true;
    let media;
    const element = video.current;
    setStream(null);
    setCameraError('');
    async function openCamera() {
      if (!secure) {
        setCameraError('Buka BUNGKOK lewat HTTPS di laptop, lalu pindai kode QR yang baru.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Buka tautan ini di Safari atau Chrome untuk memakai kamera HP.');
        return;
      }
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!current) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        element.srcObject = media;
        await element.play();
        if (current) setStream(media);
      } catch (error) {
        media?.getTracks().forEach(track => track.stop());
        if (current) setCameraError(error.name === 'NotAllowedError'
          ? 'Izinkan kamera di pengaturan situs, lalu coba lagi.'
          : 'Kamera belum bisa dibuka. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.');
      }
    }
    openCamera();
    return () => {
      current = false;
      element.srcObject = null;
      media?.getTracks().forEach(track => track.stop());
    };
  }, [facing, attempt, secure]);

  useEffect(() => {
    if (!stream || !target) { setStatus('idle'); return; }
    let current = true;
    const peer = connectPhoneToRoom(target, stream, {
      onStatusChange: value => { if (current) setStatus(value); },
      onError: () => { if (current) setStatus('error'); },
    });
    return () => { current = false; peer.destroy(); };
  }, [stream, target, callAttempt]);

  const connected = status === 'connected';
  const connecting = ['initializing', 'calling'].includes(status);
  const failed = ['error', 'disconnected'].includes(status);
  return (
    <main className="phone-camera">
      <div className="phone-camera-body">
        <header className="phone-camera-head">
          <strong>BUNGKOK</strong>
          <span role="status">{connected ? 'Laptop terhubung' : connecting ? 'Menyambungkan…' : 'Belum terhubung'}</span>
        </header>
        <h1>Kamera samping</h1>
        <p className="phone-guide">Letakkan HP di samping kursi. Pastikan bahu hingga pinggul terlihat di layar.</p>
        <figure className="phone-finder">
          <div className="phone-image">
            <video ref={video} data-mirrored={facing === 'user'} autoPlay muted playsInline aria-label="Pratinjau kamera samping" />
            {!stream && <div className="phone-placeholder" role="status">
              <Camera size={27} aria-hidden="true" />
              <span>{cameraError ? 'Kamera belum terbuka' : 'Membuka kamera…'}</span>
            </div>}
          </div>
          <figcaption>
            <span>{facing === 'environment' ? 'Kamera belakang' : 'Kamera depan'}</span>
            <button type="button" disabled={!stream} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
              <RefreshCw size={16} aria-hidden="true" /> Balik kamera
            </button>
          </figcaption>
        </figure>
        {cameraError && <div className="phone-notice" role="alert">
          <p>{cameraError}</p>
          {secure && navigator.mediaDevices?.getUserMedia && <Button onClick={() => setAttempt(n => n + 1)}>Coba buka kamera</Button>}
        </div>}
        {connected ? <p className="phone-guide">Gambar kamera tersedia di laptop. Biarkan halaman ini terbuka selama latihan.</p> :
          <form className="phone-room-form" onSubmit={e => {
            e.preventDefault();
            if (!room.trim() || !stream) return;
            setTarget(room.trim());
            setCallAttempt(n => n + 1);
          }}>
            <label className="phone-field">Kode ruang
              <input value={room} onChange={e => setRoom(e.target.value)} autoCapitalize="none"
                spellCheck={false} autoComplete="off" placeholder="Kode di layar laptop" required />
            </label>
            <Button type="submit" primary disabled={!stream || !room.trim() || connecting}>
              {connecting ? 'Menyambungkan…' : 'Sambungkan ke laptop'}
            </Button>
            {failed && <p role="alert">Laptop belum tersambung. Periksa kode ruang atau pindai QR terbaru dari laptop.</p>}
          </form>}
      </div>
    </main>
  );
}
