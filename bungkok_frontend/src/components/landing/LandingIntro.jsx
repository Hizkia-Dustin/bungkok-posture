import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import "../../styles/landing-intro.css";

export default function LandingIntro({ onReveal, onComplete }) {
  const root = useRef(null);
  const skip = useRef(() => {});

  useLayoutEffect(() => {
    const element = root.current;
    const page = element.parentElement;
    const content = [...page.children].filter((child) => child !== element);
    const previousOverflow = document.body.style.overflow;
    const previousRestoration = window.history.scrollRestoration;
    const previousFocus = document.activeElement;
    const inertState = content.map((child) => child.inert);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let finished = false;
    let revealed = false;
    let timer;
    let timeline;
    let disposed = false;

    document.body.style.overflow = "hidden";
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "instant" });
    content.forEach((child) => {
      child.inert = true;
    });

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      onReveal();
    };
    const restore = () => {
      document.body.style.overflow = previousOverflow;
      window.history.scrollRestoration = previousRestoration;
      content.forEach((child, i) => {
        child.inert = inertState[i];
      });
    };
    const finish = () => {
      if (finished || disposed) return;
      finished = true;
      clearTimeout(timer);
      timeline?.kill();
      reveal();
      const hadFocus = element.contains(document.activeElement);
      restore();
      if (hadFocus)
        page.querySelector(".landing-logo")?.focus({ preventScroll: true });
      onComplete();
    };
    skip.current = finish;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
    };
    const onPreference = () => {
      if (preference.matches) finish();
    };
    window.addEventListener("keydown", onKey);
    preference.addEventListener("change", onPreference);

    const context = gsap.context(() => {
      timeline = gsap.timeline({ paused: true, onComplete: finish });
      timeline
        .fromTo(
          ".intro-group-label, .intro-group-number",
          { yPercent: 115 },
          { yPercent: 0, duration: 0.75, stagger: 0.1, ease: "power4.out" },
          0.1,
        )
        .to(
          ".intro-group",
          { y: -35, autoAlpha: 0, duration: 0.45, ease: "power3.in" },
          1.25,
        )
        .to(".intro-panel", { backgroundColor: "#58aadd", duration: 0.6 }, 1.3)
        .fromTo(
          ".intro-word",
          { y: 50, opacity: 0, scale: 0.94 },
          { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "power4.out" },
          1.55,
        )
        .call(
          () => {
            element.dataset.stage = "bungkok";
          },
          [],
          1.55,
        )
        .call(
          () => {
            element.dataset.stage = "hero";
            reveal();
          },
          [],
          2.8,
        )
        .to(
          ".intro-panel-top",
          { yPercent: -50, duration: 1.2, ease: "power4.inOut" },
          2.8,
        )
        .to(
          ".intro-panel-bottom",
          { yPercent: 50, duration: 1.2, ease: "power4.inOut" },
          2.8,
        )
        .to(".intro-skip", { opacity: 0, duration: 0.2 }, 2.8);
    }, root);

    // Local fonts may be cold on the first visit; never hold the page indefinitely.
    const fontTimeout = new Promise((resolve) => {
      timer = setTimeout(resolve, 700);
    });
    Promise.race([document.fonts.ready, fontTimeout]).then(() => {
      clearTimeout(timer);
      if (!disposed && !finished) timeline.play();
    });
    if (preference.matches) finish();

    return () => {
      disposed = true;
      clearTimeout(timer);
      context.revert();
      restore();
      window.removeEventListener("keydown", onKey);
      preference.removeEventListener("change", onPreference);
      if (
        element.contains(document.activeElement) &&
        previousFocus instanceof HTMLElement
      )
        previousFocus.focus({ preventScroll: true });
    };
  }, [onReveal, onComplete]);

  return (
    <div
      ref={root}
      className="landing-intro"
      data-stage="kelompok"
      aria-label="Pembuka BUNGKOK oleh Kelompok 16"
    >
      <div className="intro-panel intro-panel-top" aria-hidden="true">
        <span className="intro-word">BUNGKOK</span>
      </div>
      <div className="intro-panel intro-panel-bottom" aria-hidden="true">
        <span className="intro-word">BUNGKOK</span>
      </div>
      <div className="intro-group" aria-hidden="true">
        <div className="intro-mask">
          <span className="intro-group-label">KELOMPOK</span>
        </div>
        <div className="intro-mask">
          <span className="intro-group-number">16</span>
        </div>
      </div>
      <button
        type="button"
        className="intro-skip"
        onClick={() => skip.current()}
      >
        Lewati intro <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
