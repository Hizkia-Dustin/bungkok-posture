import { useEffect, useState } from 'react';

/**
 * UserAvatar: Komponen Avatar antiputus untuk Google OAuth & Profil
 * Foto eksternal yang gagal dimuat diganti dengan inisial lokal.
 */
export default function UserAvatar({
  src,
  name = 'User',
  className = '',
  size = 40,
  style = {},
  alt = 'Foto profil',
}) {
  const imageUrl = src && !src.includes('default-user') ? src : '';
  const [imageFailed, setImageFailed] = useState(false);
  const initials = (name || 'User')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'U';
  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    ...style,
  };

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!imageUrl || imageFailed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`user-avatar-img user-avatar-fallback ${className}`}
        style={{
          ...avatarStyle,
          background: '#c9e8fa',
          color: '#153b59',
          fontSize: Math.max(11, Math.round(size * 0.34)),
          fontWeight: 750,
          letterSpacing: '-0.03em',
        }}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      width={size}
      height={size}
      className={`user-avatar-img ${className}`}
      referrerPolicy="no-referrer"
      loading="eager"
      onError={() => setImageFailed(true)}
      style={avatarStyle}
    />
  );
}
