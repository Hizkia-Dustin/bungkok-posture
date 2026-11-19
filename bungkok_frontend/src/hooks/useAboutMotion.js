import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useAboutMotion() {
  const root = useRef(null);

  useEffect(() => {
    const section = root.current;
    const media = gsap.matchMedia();

    media.add(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
      () => {
        const layers = [...section.querySelectorAll("[data-about-depth]")];
        const controls = layers.map((layer) => {
          const depth = Number(layer.dataset.aboutDepth);
          gsap.fromTo(
            layer.querySelector("img"),
            { yPercent: 7 * depth },
            {
              yPercent: -7 * depth,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top bottom",
                end: "bottom top",
                scrub: 1.2,
              },
            },
          );
          return {
            depth,
            x: gsap.quickTo(layer, "x", { duration: 1.8, ease: "power3.out" }),
            y: gsap.quickTo(layer, "y", { duration: 1.8, ease: "power3.out" }),
          };
        });

        gsap.to(section.querySelector(".about-collage"), {
          opacity: 0.2,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "bottom 70%",
            end: "bottom top",
            scrub: 1,
          },
        });

        let bounds = section.getBoundingClientRect();
        const measure = () => {
          bounds = section.getBoundingClientRect();
        };
        const move = (event) => {
          if (event.pointerType === "touch") return;
          const x = (event.clientX - bounds.left) / bounds.width - 0.5;
          const y = (event.clientY - bounds.top) / bounds.height - 0.5;
          controls.forEach((layer) => {
            layer.x(Math.tanh(x * 2) * 100 * layer.depth);
            layer.y(Math.tanh(y * 2) * 70 * layer.depth);
          });
        };
        const reset = () =>
          controls.forEach((layer) => {
            layer.x(0);
            layer.y(0);
          });
        section.addEventListener("pointerenter", measure);
        section.addEventListener("pointermove", move);
        section.addEventListener("pointerleave", reset);
        window.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure);

        return () => {
          section.removeEventListener("pointerenter", measure);
          section.removeEventListener("pointermove", move);
          section.removeEventListener("pointerleave", reset);
          window.removeEventListener("scroll", measure);
          window.removeEventListener("resize", measure);
        };
      },
      root,
    );

    return () => media.revert();
  }, []);

  return root;
}
