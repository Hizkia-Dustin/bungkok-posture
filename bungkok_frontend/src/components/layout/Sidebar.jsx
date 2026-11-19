import { useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { useApp } from '../../context/AppContext';
import { FigmaIcon } from '../common/FigmaAsset';
import UserAvatar from '../common/UserAvatar';

// ============================================================================
// DAFTAR MENU NAVIGASI SIDEBAR
// Format: [Nama Menu, Path URL, File Ikon SVG Figma]
// ============================================================================
const navigation = [
  ['Dashboard', 'dashboard', '847f4.svg'],
  ['Riwayat Latihan', 'riwayat', 'efdf3.svg'],
  ['Perkembangan', 'perkembangan', '13945.svg'],
  ['Tantangan', 'tantangan', 'f1afe.svg'],
  ['Pencapaian & Hadiah', 'reward', 'd93cf.svg'],
  ['Profil & Pengaturan', 'profil', 'e03c4.svg'],
  ['Bantuan', 'bantuan', 'd732c.svg'],
];

// ============================================================================
// KOMPONEN: Sidebar
// Panel navigasi samping untuk seluruh halaman aplikasi (/app/*)
// Parameter:
// - open: boolean (apakah menu terbuka pada mode mobile)
// - onNavClick: fungsi penutup menu saat link ditekan di mode mobile
// ============================================================================
export default function Sidebar({ open, onNavClick }) {
  // Mengambil data user, aksesoris terpasang, dan fungsi pembuka modal dari AppContext
  const { user, equippedItems, openModal } = useApp();
  const { pathname } = useLocation();
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const indicatorReady = useRef(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    const active = nav?.querySelector('.sidebar-link.active');
    if (!nav || !indicator || !active || !active.offsetHeight) return undefined;
    const position = { y: active.offsetTop, height: active.offsetHeight };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !indicatorReady.current) {
      gsap.set(indicator, position);
      indicatorReady.current = true;
    }
    gsap.set(indicator, { height: position.height });
    const movement = reduced ? null : gsap.to(indicator, { y: position.y, duration: 0.52, ease: 'power4.out', overwrite: true });
    const label = reduced ? null : gsap.fromTo(active, { x: -4 }, {
      x: 0, duration: 0.42, ease: 'power3.out', overwrite: true,
      onComplete: () => gsap.set(active, { clearProps: 'transform' }),
    });
    const syncPosition = () => gsap.set(indicator, { y: active.offsetTop, height: active.offsetHeight });
    window.addEventListener('resize', syncPosition);
    return () => {
      movement?.kill();
      label?.kill();
      gsap.set(active, { clearProps: 'transform' });
      window.removeEventListener('resize', syncPosition);
    };
  }, [pathname, open]);

  return (
    <aside className={`app-sidebar ${open ? 'open' : ''}`}>
      {/* --- 1. LOGO BRAND BUNGKOK --- */}
      <NavLink to="/" className="sidebar-brand">
        <strong>BUNGKOK</strong>
        <small>POSTURE TRACKER</small>
      </NavLink>

      {/* --- 2. DAFTAR LINK NAVIGASI UTAMA --- */}
      <nav ref={navRef} aria-label="Menu utama">
        <span ref={indicatorRef} className="sidebar-active-indicator" aria-hidden="true" />
        {navigation.map(([name, path, file]) => (
          <NavLink
            key={path}
            to={`/app/${path}`}
            onClick={onNavClick}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <FigmaIcon file={file} />
            {name}
          </NavLink>
        ))}

        {user.role === 'admin' && (
          <NavLink
            to="/app/admin"
            onClick={onNavClick}
            className={({ isActive }) => `sidebar-link sidebar-admin-link ${isActive ? 'active' : ''}`}
          >
            <FigmaIcon file="b6aae.svg" />
            Dashboard Admin
          </NavLink>
        )}
      </nav>

      {/* --- 3. BAGIAN BAWAH SIDEBAR: PROFIL USER & TOMBOL EXIT --- */}
      <div className="sidebar-bottom">
        {/* Kartu Profil Singkat User */}
        <NavLink to="/app/profil" onClick={onNavClick} className="sidebar-user">
          <UserAvatar
            className={equippedItems['bingkai-cloud'] ? 'avatar-framed' : ''}
            src={user.avatar}
            name={user.name}
            size={36}
            alt={user.name}
          />
          <div>
            {user.name}
            <small>
              {user.role === 'admin' ? 'Admin sistem' : `Level ${user.level}`} · {user.points} poin
            </small>
          </div>
        </NavLink>

        {/* Tombol Keluar (Exit) dengan Dialog Konfirmasi */}
        <button
          type="button"
          className="sidebar-exit-btn"
          onClick={() => {
            onNavClick?.();
            openModal('keluar-akun'); // Membuka modal konfirmasi keluar
          }}
          title="Keluar dari akun"
          aria-label="Keluar dari akun"
        >
          {/* Ikon Pintu / Logout SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}
