import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import SmoothScroll from './components/common/SmoothScroll';
import PageTransition from './components/common/PageTransition';

// Public Pages
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import MobileSideCamera from './pages/MobileSideCamera';

// App Layout & App Pages
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import RiwayatLatihan from './pages/RiwayatLatihan';
import Perkembangan from './pages/Perkembangan';
import Tantangan from './pages/Tantangan';
import RewardBadge from './pages/RewardBadge';
import ProfilPengaturan from './pages/ProfilPengaturan';
import Bantuan from './pages/Bantuan';
import AdminPanel from './pages/AdminPanel';
import { useApp } from './context/AppContext';
import { PostureMonitorProvider } from './context/PostureMonitorContext';

function RequireAccount({ admin = false, children }) {
  const { authReady, isAuthenticated, user } = useApp();
  if (!authReady) {
    return (
      <main className="route-loading" aria-live="polite" style={{ opacity: 0, pointerEvents: "none" }}>
        Memuat akun…
      </main>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AppProvider><PostureMonitorProvider>
      <BrowserRouter>
        <SmoothScroll>
          <PageTransition>{(location, initialEntry) => <Routes location={location}>
            {/* Public Marketing & Auth */}
            <Route path="/" element={<LandingPage allowIntro={initialEntry} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/cam/side" element={<MobileSideCamera />} />

            {/* Logged In App Routes */}
            <Route path="/app" element={<RequireAccount><AppLayout /></RequireAccount>}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="riwayat" element={<RiwayatLatihan />} />
              <Route path="riwayat/:sessionId" element={<RiwayatLatihan />} />
              <Route path="perkembangan" element={<Perkembangan />} />
              <Route path="tantangan" element={<Tantangan />} />
              <Route path="reward" element={<RewardBadge />} />
              <Route path="profil" element={<ProfilPengaturan />} />
              <Route path="bantuan" element={<Bantuan />} />
              <Route path="bantuan/laporan" element={<Bantuan />} />
              <Route path="admin" element={<RequireAccount admin><AdminPanel /></RequireAccount>} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>}</PageTransition>
        </SmoothScroll>
      </BrowserRouter>
    </PostureMonitorProvider></AppProvider>
  );
}

