import { createContext, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

const LenisContext = createContext(null);

export function useSmoothScroll() {
  return useContext(LenisContext);
}

export default function SmoothScroll({ children }) {
  const lenisRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Inisialisasi Lenis dengan inertia smooth scroll premium & natural
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: !isReduced,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });

    lenisRef.current = lenis;
    window.lenis = lenis;

    // Sinkronkan event scroll Lenis ke GSAP ScrollTrigger
    const onScroll = () => {
      ScrollTrigger.update();
    };
    lenis.on('scroll', onScroll);

    // Sambungkan render loop Lenis ke GSAP high-precision ticker
    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0); // Menghilangkan loncatan jitter / desinkronisasi

    // Listener preferensi reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e) => {
      if (e.matches) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };
    motionQuery.addEventListener('change', handleMotionChange);

    // Handler klik anchor internal (#about, #cara-kerja, dll)
    const handleAnchorClick = (e) => {
      const anchor = e.target.closest('a[href*="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      const hashIndex = href.indexOf('#');
      if (hashIndex === -1) return;

      const targetPath = href.slice(0, hashIndex);
      const targetHash = href.slice(hashIndex);

      // Jika anchor berada pada halaman yang sama
      const isCurrentPage =
        !targetPath ||
        targetPath === window.location.pathname ||
        targetPath === '/' && window.location.pathname === '/';

      if (isCurrentPage && targetHash.length > 1) {
        const targetElement = document.querySelector(targetHash);
        if (targetElement) {
          e.preventDefault();
          lenis.scrollTo(targetElement, {
            offset: -30,
            duration: isReduced ? 0 : 1.2,
          });
          window.history.pushState(null, '', targetHash);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);

    return () => {
      document.removeEventListener('click', handleAnchorClick);
      motionQuery.removeEventListener('change', handleMotionChange);
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      lenisRef.current = null;
      if (window.lenis === lenis) {
        delete window.lenis;
      }
    };
  }, []);

  // Update dimensi layout Lenis & refresh ScrollTrigger setiap pergantian halaman
  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.resize();
      ScrollTrigger.refresh();
    }
  }, [location.pathname, location.search]);

  return (
    <LenisContext.Provider value={lenisRef.current}>
      {children}
    </LenisContext.Provider>
  );
}

