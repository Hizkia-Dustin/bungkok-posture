import { useState, useEffect } from 'react';

/**
 * UserAvatar: Komponen Avatar antiputus untuk Google OAuth & Profil
 * Menggunakan referrerPolicy="no-referrer" agar foto profil Google (lh3.googleusercontent.com)
 * tidak diblokir oleh browser (seperti Brave / Chrome) karena referer localhost.
 * Otomatis fallback ke inisial nama jika gambar gagal dimuat.
 */
export default function UserAvatar({
  src,
  name = 'User',
  className = '',
  size = 40,
  style = {},
  alt = 'Foto profil',
}) {
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || 'User'
  )}&background=0284c7&color=fff&bold=true`;

  const [imgSrc, setImgSrc] = useState(() => {
    if (!src || src.includes('default-user')) return fallbackUrl;
    return src;
  });

  useEffect(() => {
    if (src && !src.includes('default-user')) {
      setImgSrc(src);
    } else {
      setImgSrc(fallbackUrl);
    }
  }, [src, fallbackUrl]);

  return (
    <img
      src={imgSrc}
      alt={alt}
      width={size}
      height={size}
      className={`user-avatar-img ${className}`}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      loading="eager"
      onError={() => {
        if (imgSrc !== fallbackUrl) {
          setImgSrc(fallbackUrl);
        }
      }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'inline-block',
        ...style,
      }}
    />
  );
}
