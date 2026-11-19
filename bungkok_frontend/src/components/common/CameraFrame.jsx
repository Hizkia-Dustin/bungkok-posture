import '../../styles/camera-frames.css';

export const CAMERA_FRAMES = [
  { id: 'frame-sadar', name: 'Lebih Sadar', price: 180 },
  { id: 'frame-turns-on', name: 'Turns On', price: 220 },
];

export function activeCameraFrame(equippedItems = {}) {
  if (equippedItems['frame-turns-on']) return 'frame-turns-on';
  if (equippedItems['frame-sadar']) return 'frame-sadar';
  return '';
}

export function FrameArtwork({ frameId, userName = 'USER' }) {
  if (frameId === 'frame-sadar') return <div className="camera-frame-art camera-frame-art-sadar" aria-hidden="true">
    <i className="frame-dot-line top" /><strong>DUDUK <span>LEBIH SADAR</span></strong><small>SESI POSTUR</small><i className="frame-dot-line bottom" />
  </div>;
  if (frameId === 'frame-turns-on') return <div className="camera-frame-art camera-frame-art-turns" aria-hidden="true">
    <small className="frame-brand">BUNGKOK</small><small className="frame-message">DUDUK<br />LEBIH SADAR</small>
    <strong><span>({userName.split(' ')[0].toUpperCase()})</span> Turns On!</strong>
  </div>;
  return null;
}

export function CameraFramePreview({ frameId, src, name }) {
  return <div className={`camera-frame-preview ${frameId}`}>
    <img src={src} alt="" referrerPolicy="no-referrer" />
    <FrameArtwork frameId={frameId} userName={name} />
  </div>;
}
