import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FigmaIcon, figmaAsset } from '../common/FigmaAsset';
import Dialog from '../common/Dialog';
import { supabase } from '../../services/supabaseClient';
import '../../styles/auth.css';
import '../../styles/app.css';

export default function AuthPage({ register = false }) {
  const navigate = useNavigate();
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form Fields (Kosong secara default untuk pengguna asli)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const showInfo = (type) => setNotice(type);

  const handleReset = async () => {
    setErrorMsg('');
    if (!email.trim()) {
      setErrorMsg('Masukkan email akun terlebih dahulu, lalu pilih Lupa kata sandi.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/app/profil`,
    });
    if (error) setErrorMsg(error.message);
    else setNotice('reset');
  };

  // Handle Form Submit (Real Login & Register via Database)
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const result = register
        ? await supabase.auth.signUp({
            email: email.trim(), password,
            options: { data: { name: name.trim(), full_name: name.trim() } },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (register && !result.data.session) {
        setErrorMsg('Akun dibuat tanpa progres awal. Periksa email untuk konfirmasi, lalu masuk.');
      } else {
        navigate('/app/dashboard');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memproses autentikasi. Silakan periksa koneksi atau data akun Anda.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Real Google OAuth via Supabase
  const handleGoogleSignInWithSupabase = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google OAuth error:', err);
      let msg = err.message || 'Gagal menghubungkan ke Google OAuth di Supabase.';
      if (
        msg.toLowerCase().includes('provider is not enabled') ||
        msg.toLowerCase().includes('unsupported provider')
      ) {
        msg = 'Provider Google belum diaktifkan di Supabase Dashboard. Silakan aktifkan di menu Auth > Providers > Google pada project gmasqrgtzceaariaucuw dengan memasukkan Google Client ID & Secret.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-left">
        <header className="auth-header">
          <Link className="auth-logo" to="/">
            BUNGKOK<span>.</span>
          </Link>
          <Link to="/" className="auth-back">
            <FigmaIcon file="6dc85.svg" />
            Beranda
          </Link>
        </header>

        <div className="auth-form-area">
          <span className="auth-eyebrow">TEMAN KEBIASAAN DUDUKMU</span>
          <h1>
            {register ? 'Daftar akun' : 'Halo lagi'}
            <span>{register ? '.' : '!'}</span>
          </h1>
          <p>
            {register ? (
              <>
                Mulai kebiasaan duduk yang lebih baik.
                <br />
                Buat akun dan tumbuh bersama Bungkok.
              </>
            ) : (
              <>
                Masuk untuk melanjutkan kebiasaan baikmu.
                <br />
                Duduk lebih sadar, satu hari demi satu hari.
              </>
            )}
          </p>

          {/* Tombol Login Google Resmi Supabase */}
          <button
            type="button"
            className="auth-google"
            onClick={handleGoogleSignInWithSupabase}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: loading ? 'wait' : 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            Lanjutkan dengan Google
          </button>

          <div className="auth-divider">atau {register ? 'daftar' : 'masuk'} dengan email</div>

          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '12px 16px',
                borderRadius: 12,
                fontSize: 13,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {register && (
              <label className="auth-field">
                Nama lengkap
                <span>
                  <FigmaIcon file="c2e77.svg" />
                  <input
                    required
                    autoComplete="name"
                    placeholder="Nama lengkap Anda"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </span>
              </label>
            )}

            <label className="auth-field">
              Email
              <span>
                <FigmaIcon file="32457.svg" />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>

            <label className="auth-field">
              Kata sandi
              <span>
                <FigmaIcon file="0c3e5.svg" />
                <input
                  required
                  minLength={8}
                  type={visiblePassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={visiblePassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={visiblePassword}
                  onClick={() => setVisiblePassword(!visiblePassword)}
                >
                  <FigmaIcon file="c943a.svg" />
                </button>
              </span>
            </label>

            {register && (
              <small className="auth-password-help">
                Gunakan minimal 8 karakter dengan kombinasi huruf dan angka.
              </small>
            )}

            <div className="auth-options">
              <label>
                <input type="checkbox" defaultChecked required={register} />
                {register ? (
                  <span>
                    Saya menyetujui <button type="button" onClick={() => showInfo('terms')}>Syarat & Ketentuan</button> serta<br />
                    <button type="button" onClick={() => showInfo('privacy')}>Kebijakan Privasi</button> Bungkok.
                  </span>
                ) : (
                  'Ingat saya'
                )}
              </label>
              {!register && (
                <button type="button" onClick={handleReset}>
                  Lupa kata sandi?
                </button>
              )}
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Memproses...' : register ? 'Daftar sekarang' : 'Masuk'}
            </button>
          </form>

          <p className="auth-switch">
            {register ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Masuk di sini' : 'Daftar sekarang'}
            </Link>
          </p>
        </div>

        <footer className="auth-footer">
          <span>© 2026 Bungkok</span>
          <div>
            <button onClick={() => showInfo('privacy')}>Privasi</button>
            <button onClick={() => showInfo('terms')}>Ketentuan</button>
          </div>
        </footer>
      </section>

      <aside className="auth-visual">
        <h2>
          Duduk lebih<br />sadar<span>.</span>
        </h2>
        <p className="auth-script">mulai dari kamu</p>
        <img
          className="auth-figure"
          src={figmaAsset('bbc54.webp')}
          alt="Ilustrasi keselarasan tulang belakang"
          width="609"
          height="801"
          fetchPriority="high"
        />
        <div className="auth-reminder">
          <FigmaIcon file="45564.svg" />Yuk, tegakkan posturmu!
        </div>
        <div className="auth-benefits">
          <h3>TEMAN DUDUK, BUKAN PENGHAKIM.</h3>
          <div>
            <span><FigmaIcon file="6e437.svg" />Pantau postur</span>
            <span><FigmaIcon file="c920b.svg" />Pengingat ramah</span>
            <span><FigmaIcon file="8be17.svg" />Lacak kebiasaan</span>
          </div>
        </div>
      </aside>

      {notice && (
        <Dialog title="Informasi akun" onClose={() => setNotice(null)}>
          <h2>
            {
              {
                reset: 'Lupa kata sandi?',
                privacy: 'Privasi Bungkok',
                terms: 'Syarat & Ketentuan',
              }[notice]
            }
          </h2>
          <p>
            {notice === 'reset'
              ? 'Tautan pemulihan kata sandi telah dikirimkan ke email Anda. Silakan periksa kotak masuk atau spam.'
              : notice === 'privacy'
                ? 'Data postur Anda diproses secara lokal di perangkat Anda menggunakan model MediaPipe 3D dan hanya ringkasan metrik yang disimpan.'
                : 'Bungkok adalah pendamping kebiasaan duduk ergonomis untuk mencegah bungkuk.'}
          </p>
          <button className="soft-button primary" onClick={() => setNotice(null)}>
            Tutup
          </button>
        </Dialog>
      )}
    </main>
  );
}
