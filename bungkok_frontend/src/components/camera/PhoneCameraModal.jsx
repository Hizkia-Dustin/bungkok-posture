import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createLaptopPeer, generateRoomId } from '../../services/peerService';
import Dialog from '../common/Dialog';
import { Button } from '../common/SoftUI';
import '../../styles/phone-camera.css';

const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost');

function pairingLink(origin, room) {
  try {
    const url = new URL('/cam/side', origin);
    if (url.protocol !== 'https:' || loopback(url.hostname) || !room) return '';
    url.searchParams.set('room', room);
    return url.href;
  } catch {
    return '';
  }
}

export default function PhoneCameraModal({ isOpen, onClose, onStreamConnected }) {
  const [room, setRoom] = useState('');
  const [status, setStatus] = useState('initializing');
  const [stream, setStream] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const [customHost, setCustomHost] = useState('');
  const receiver = useRef(null);
  const accepted = useRef(null);
  const preview = useRef(null);
  const linkInput = useRef(null);
  const needsHost = location.protocol !== 'https:' || loopback(location.hostname);
  const link = pairingLink(needsHost ? customHost.trim() : location.origin, room);

  useEffect(() => {
    if (!isOpen) return;
    let open = true;
    const id = generateRoomId();
    setRoom(id);
    setStream(null);
    setCopyStatus('');
    const peer = createLaptopPeer(id, {
      onStatusChange: value => { if (open) setStatus(value); },
      onStream: value => {
        if (open) setStream(value);
        else if (accepted.current === peer) onStreamConnected(value, peer);
      },
    });
    receiver.current = peer;
    return () => {
      open = false;
      if (receiver.current === peer) {
        receiver.current = null;
        peer.destroy();
      }
    };
  }, [isOpen, attempt]);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [status, stream]);

  if (!isOpen) return null;
  const connected = status === 'connected' && stream;
  const failed = ['error', 'disconnected'].includes(status);
  const ready = status === 'ready' || status === 'connecting';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Tautan tersalin.');
    } catch {
      linkInput.current?.select();
      setCopyStatus('Pilih Salin pada tautan yang disorot.');
    }
  };

  return (
    <Dialog title="Kamera samping" className="phone-pair" onClose={onClose}>
      <h2>{connected ? 'Periksa gambar HP' : 'Hubungkan kamera HP'}</h2>
      {connected ? <>
        <video className="phone-pair-preview" ref={preview} autoPlay muted playsInline />
        <p>Letakkan HP di samping kursi sampai bahu dan pinggul terlihat.</p>
        <Button primary onClick={() => {
          const peer = receiver.current;
          accepted.current = peer;
          receiver.current = null;
          onStreamConnected(stream, peer);
          onClose();
        }}>Gunakan kamera ini</Button>
      </> : failed ? <>
        <p role="status">Sambungan terputus. Buat kode baru, lalu pindai kembali dari HP.</p>
        <Button primary onClick={() => setAttempt(n => n + 1)}>Buat kode baru</Button>
      </> : <>
        {needsHost && <label className="phone-field">Alamat HTTPS yang bisa dibuka di HP
          <input type="url" value={customHost} onChange={e => { setCustomHost(e.target.value); setCopyStatus(''); }}
            placeholder="https://domain-anda.com" />
        </label>}
        {ready && link ? <>
          <p>Pindai dengan kamera HP, buka tautannya, lalu izinkan akses kamera.</p>
          <figure className="phone-qr">
            <QRCodeSVG value={link} size={192} marginSize={4} title="Kode QR untuk kamera samping" />
            <figcaption role="status">{status === 'connecting' ? 'Menghubungkan kamera…' : 'Menunggu kamera HP'}</figcaption>
          </figure>
          <div className="phone-room"><span>Kode ruang</span><code>{room}</code></div>
          <div className="phone-link">
            <input ref={linkInput} aria-label="Tautan kamera HP" value={link} readOnly />
            <Button onClick={copy}>Salin tautan</Button>
          </div>
          {copyStatus && <small role="status">{copyStatus}</small>}
        </> : <p role="status">{needsHost && !link ? 'Masukkan alamat situs untuk menampilkan kode QR.' : 'Menyiapkan kode QR…'}</p>}
      </>}
    </Dialog>
  );
}
