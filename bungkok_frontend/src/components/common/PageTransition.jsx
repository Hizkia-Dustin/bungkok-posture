import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import gsap from "gsap";
import { useApp } from "../../context/AppContext";
import "../../styles/page-transition.css";

const routeId = (location) => location.pathname + location.search;

export default function PageTransition({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { authReady, isAuthenticated } = useApp();

  const isAppRoute = location.pathname.startsWith("/app");

  // Jika membuka rute /app dan akun belum siap (refresh/buka pertama),
  // mulai langsung dari phase "loading" agar layar tertutup mulus oleh SVG overlay
  const [phase, setPhase] = useState(() => (isAppRoute && !authReady ? "loading" : "idle"));
  const [displayed, setDisplayed] = useState(location);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const overlay = useRef(null);
  const stroke = useRef(null);
  const content = useRef(null);
  const target = useRef(location);
  const scrollPositions = useRef(new Map());
  const hasNavigated = useRef(false);
  const destinationScroll = useRef(0);
  target.current = location;

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  // Sinkronisasi saat akun selesai dimuat (authReady berubah menjadi true)
  useEffect(() => {
    if (phase === "loading" && authReady) {
      setDisplayed(location);
      setPhase("reveal");
    }
  }, [authReady, phase, location]);

  useLayoutEffect(() => {
    const changed = routeId(location) !== routeId(displayed);
    const restoreScroll = () => {
      const anchor = location.hash
        ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
        : null;
      if (anchor) {
        if (window.lenis) {
          window.lenis.scrollTo(anchor, { immediate: true });
        } else {
          anchor.scrollIntoView({ behavior: "instant" });
        }
      } else {
        if (window.lenis) {
          window.lenis.scrollTo(destinationScroll.current, { immediate: true });
        } else {
          window.scrollTo({
            top: destinationScroll.current,
            behavior: "instant",
          });
        }
      }
    };

    // =========================================================================
    // FASE 1: LOADING (Menunggu akun & data postur selesai dimuat dari backend)
    // =========================================================================
    if (phase === "loading") {
      const panel = overlay.current;
      const path = stroke.current;
      if (!panel || !path) return;
      const length = path.getTotalLength();
      if (content.current) content.current.inert = true;

      if (reduced) {
        gsap.set(panel, { autoAlpha: 0 });
        if (content.current) content.current.inert = false;
        if (authReady) setPhase("idle");
        return;
      }

      gsap.set(panel, { autoAlpha: 1 });
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: 0,
        strokeWidth: 800,
      });

      // Animasi denyut halus pada stroke selama menunggu data selesai dimuat
      const pulseAnimation = gsap.to(path, {
        strokeWidth: 840,
        repeat: -1,
        yoyo: true,
        duration: 1.2,
        ease: "sine.inOut",
      });

      if (authReady) {
        pulseAnimation.kill();
        setDisplayed(target.current);
        setPhase("reveal");
      }

      return () => {
        pulseAnimation.kill();
      };
    }

    // =========================================================================
    // FASE 2: IDLE (Menunggu navigasi berikutnya)
    // =========================================================================
    if (phase === "idle") {
      if (!changed) {
        if (location.key !== displayed.key || location.hash !== displayed.hash)
          setDisplayed(location);
        return;
      }
      hasNavigated.current = true;
      scrollPositions.current.set(displayed.key, window.scrollY);
      destinationScroll.current =
        navigationType === "POP"
          ? scrollPositions.current.get(location.key) || 0
          : 0;

      const isInternalAppNavigation =
        location.pathname.startsWith("/app") &&
        displayed.pathname.startsWith("/app");
      const isOpeningDashboard = location.pathname === "/app/dashboard";

      if (reduced || (isInternalAppNavigation && !isOpeningDashboard)) {
        setDisplayed(location);
        restoreScroll();
        setPhase("idle");
      } else {
        setPhase("cover");
      }
      return;
    }

    // =========================================================================
    // FASE 3: COVER & REVEAL ANIMATION (GSAP Smooth SVG Swipe)
    // =========================================================================
    const panel = overlay.current;
    const path = stroke.current;
    if (!panel || !path) return;
    const length = path.getTotalLength();
    if (content.current) content.current.inert = !reduced;
    if (reduced) {
      gsap.set(panel, { autoAlpha: 0 });
      if (content.current) content.current.inert = false;
      if (changed) setDisplayed(location);
      else restoreScroll();
      setPhase(changed ? "reveal" : "idle");
      return;
    }

    let animation;
    if (phase === "cover") {
      gsap.set(panel, { autoAlpha: 1 });
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
        strokeWidth: 32,
      });
      animation = gsap.timeline({
        onComplete: () => {
          setDisplayed(target.current);
          // Jika membuka rute aplikasi dan akun masih dimuat, tahan di fase loading
          if (target.current.pathname.startsWith("/app") && !authReady) {
            setPhase("loading");
          } else {
            setPhase("reveal");
          }
        },
      });
      animation
        .to(
          path,
          { strokeDashoffset: 0, duration: 0.7, ease: "power1.inOut" },
          0,
        )
        .to(
          path,
          { strokeWidth: 780, duration: 0.38, ease: "power2.in" },
          0.32,
        );
    } else if (phase === "reveal") {
      restoreScroll();
      animation = gsap.timeline({
        onComplete: () => {
          gsap.set(panel, { autoAlpha: 0 });
          if (content.current) {
            content.current.inert = false;
            const heading = content.current.querySelector("h1, h2, main");
            if (heading) {
              const tabIndex = heading.getAttribute("tabindex");
              heading.setAttribute("tabindex", "-1");
              heading.focus({ preventScroll: true });
              if (tabIndex === null) heading.removeAttribute("tabindex");
              else heading.setAttribute("tabindex", tabIndex);
            }
          }
          if (window.lenis) {
            window.lenis.resize();
          }
          setPhase("idle");
        },
      });
      animation.to(path, {
        strokeDashoffset: -length,
        strokeWidth: 32,
        duration: 0.85,
        ease: "power1.inOut",
      });
    }

    return () => {
      animation?.kill();
      if (content.current) content.current.inert = false;
    };
  }, [location, displayed, navigationType, phase, reduced, authReady]);

  useLayoutEffect(() => {
    if (reduced || !displayed.pathname.startsWith('/app')) return undefined;
    const page = content.current?.querySelector('.app-main > .app-page');
    if (!page || page.classList.contains('dashboard-page')) return undefined;
    const heading = page.querySelector(':scope > .page-header');
    const sections = Array.from(page.children).filter((element) => element !== heading);
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (heading) {
        timeline.fromTo(heading, { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.48 }, 0);
      }
      if (sections.length) {
        timeline.fromTo(sections,
          { autoAlpha: 0, y: 18 },
          { autoAlpha: 1, y: 0, duration: 0.56, stagger: 0.055, clearProps: 'transform,opacity,visibility' },
          heading ? 0.08 : 0);
      }
    }, page);
    return () => ctx.revert();
  }, [displayed.pathname, displayed.search, reduced]);

  const handleInternalAnchor = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = event.target.closest("a[href]");
    if (
      !anchor ||
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")
    )
      return;
    const url = new URL(anchor.href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !/^\/(?:$|login\/?$|register\/?$|app(?:\/|$))/.test(url.pathname)
    )
      return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (!url.hash) {
        event.preventDefault();
        if (window.lenis) {
          window.lenis.scrollTo(0, { duration: reduced ? 0 : 1.2 });
        } else {
          window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
        }
      }
      return;
    }
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };

  return (
    <>
      <div
        ref={content}
        onClick={handleInternalAnchor}
        aria-busy={phase !== "idle"}
      >
        {children(displayed, !hasNavigated.current)}
      </div>
      <div
        ref={overlay}
        className="page-transition"
        data-phase={phase}
        aria-hidden="true"
      >
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path
            ref={stroke}
            d="M 130 140 C 400 20 960 80 840 300 S 80 260 150 530 S 960 520 850 780 S 350 980 140 860"
          />
        </svg>

        {/* Branding & Status Memuat Akun saat Buka / Refresh Dashboard */}
        <div className={`page-transition-brand ${(phase === "loading" || (phase === "cover" && !authReady)) ? "visible" : ""}`}>
          <div className="brand-spinner" />
          <div className="brand-logo">BUNGKOK</div>
          <div className="brand-subtitle">Memuat akun &amp; data postur…</div>
        </div>
      </div>
    </>
  );
}
