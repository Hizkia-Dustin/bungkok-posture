import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ============================================================================
// HOOK: useLandingMotion
// Mengatur animasi scroll reveal dua arah (bisa scroll back) & parallax
// Menggunakan toggleActions: "play reverse play reverse" + start/end terkalibrasi
// ============================================================================
export function useLandingMotion() {
  const root = useRef(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      // ======================================================================
      // 1. SCROLL REVEAL BIDIRECTIONAL (BISA SCROLL DOWN & SCROLL BACK)
      // ======================================================================
      media.add('(prefers-reduced-motion: no-preference)', () => {
        // --------------------------------------------------------------------
        // A. HERO ENTRANCE (Animasi pertama kali saat halaman dimuat)
        // --------------------------------------------------------------------
        const heroTl = gsap.timeline({ paused: el.dataset.introActive === 'true', defaults: { ease: 'power3.out' } });
        const revealHero = () => heroTl.play();
        el.addEventListener('bungkok:intro-reveal', revealHero);

        // Navbar meluncur halus dari atas
        heroTl.from('.landing-nav', {
          y: -25,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
        })
        // Headline teks hero bertingkat
        .from('.hero-type > span', {
          y: 40,
          opacity: 0,
          duration: 1,
          stagger: 0.12,
          ease: 'power3.out',
        }, '-=0.5')
        // Figur ilustrasi perempuan meluncur naik lembut
        .from('.hero-figure', {
          y: 50,
          scale: 0.96,
          opacity: 0,
          duration: 1.1,
          ease: 'power3.out',
        }, '-=0.8');

        // --------------------------------------------------------------------
        // B. SCROLL REVEAL: SEKSI ABOUT BUNGKOK (SCROLL BACK AKTIF)
        // --------------------------------------------------------------------
        const aboutSection = el.querySelector('.landing-about');
        if (aboutSection) {
          // Judul dan paragraf About
          gsap.from(aboutSection.querySelectorAll('.about-copy h2, .about-copy p'), {
            scrollTrigger: {
              trigger: aboutSection,
              start: 'top 82%',
              end: 'bottom top',
              toggleActions: 'play reverse play reverse',
            },
            y: 35,
            opacity: 0,
            duration: 0.85,
            stagger: 0.15,
            ease: 'power3.out',
          });

          // 3 Pilar manfaat (Product Benefits)
          const benefitsEl = aboutSection.querySelector('.product-benefits');
          if (benefitsEl) {
            gsap.from(benefitsEl.querySelectorAll('span'), {
              scrollTrigger: {
                trigger: benefitsEl,
                start: 'top 88%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              y: 25,
              opacity: 0,
              duration: 0.7,
              stagger: 0.12,
              ease: 'back.out(1.4)',
            });
          }

          // Foto rontgen tulang belakang di tengah
          const centerPhoto = aboutSection.querySelector('.about-center-photo');
          if (centerPhoto) {
            gsap.from(centerPhoto, {
              scrollTrigger: {
                trigger: aboutSection,
                start: 'top 80%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              scale: 0.92,
              opacity: 0,
              duration: 1,
              ease: 'power2.out',
            });
          }
        }

        // --------------------------------------------------------------------
        // C. SCROLL REVEAL: SEKSI CARA KERJA (STEPS) (SCROLL BACK AKTIF)
        // --------------------------------------------------------------------
        const stepsSection = el.querySelector('.landing-steps');
        if (stepsSection) {
          // Judul "CARA KERJA"
          const stepsTitle = stepsSection.querySelector('h2');
          if (stepsTitle) {
            gsap.from(stepsTitle, {
              scrollTrigger: {
                trigger: stepsSection,
                start: 'top 85%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              y: 35,
              opacity: 0,
              duration: 0.8,
              ease: 'power3.out',
            });
          }

          // 3 Kartu Langkah (Animasi bergantian / Staggered)
          const stepCards = stepsSection.querySelectorAll('.step-card');
          if (stepCards.length > 0) {
            gsap.from(stepCards, {
              scrollTrigger: {
                trigger: stepsSection.querySelector('.step-grid') || stepsSection,
                start: 'top 82%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              y: 50,
              opacity: 0,
              duration: 0.85,
              stagger: 0.16,
              ease: 'power3.out',
            });
          }
        }

        // --------------------------------------------------------------------
        // D. SCROLL REVEAL: SEKSI FITUR UTAMA (SCROLL BACK AKTIF)
        // --------------------------------------------------------------------
        const featuresSection = el.querySelector('.landing-features');
        if (featuresSection) {
          // Judul "FITUR UTAMA"
          const featuresTitle = featuresSection.querySelector('h2');
          if (featuresTitle) {
            gsap.from(featuresTitle, {
              scrollTrigger: {
                trigger: featuresSection,
                start: 'top 82%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              y: 35,
              opacity: 0,
              duration: 0.8,
              ease: 'power3.out',
            });
          }

          // Baris Atas Kiri: Posture Tracking
          const trackingCard = featuresSection.querySelector('.feature-tracking');
          if (trackingCard) {
            gsap.from(trackingCard, {
              scrollTrigger: {
                trigger: trackingCard,
                start: 'top 82%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              x: -35,
              y: 20,
              opacity: 0,
              duration: 0.9,
              ease: 'power3.out',
            });
          }

          // Baris Atas Kanan: Reminder Ramah
          const reminderCard = featuresSection.querySelector('.feature-reminder');
          if (reminderCard) {
            gsap.from(reminderCard, {
              scrollTrigger: {
                trigger: reminderCard,
                start: 'top 82%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              x: 35,
              y: 20,
              opacity: 0,
              duration: 0.9,
              delay: 0.1,
              ease: 'power3.out',
            });
          }

          // Baris Bawah: Riwayat Kebiasaan + Poin & Badge
          const bottomFeatures = featuresSection.querySelector('.feature-bottom');
          if (bottomFeatures) {
            gsap.from(bottomFeatures.querySelectorAll('.landing-card'), {
              scrollTrigger: {
                trigger: bottomFeatures,
                start: 'top 82%',
                end: 'bottom top',
                toggleActions: 'play reverse play reverse',
              },
              y: 45,
              opacity: 0,
              duration: 0.85,
              stagger: 0.18,
              ease: 'power3.out',
            });

            // Animasi batang grafik tumbuh tinggi ke atas
            const chartBars = bottomFeatures.querySelectorAll('.sample-bars i');
            if (chartBars.length > 0) {
              gsap.from(chartBars, {
                scrollTrigger: {
                  trigger: bottomFeatures.querySelector('.sample-bars'),
                  start: 'top 85%',
                  end: 'bottom top',
                  toggleActions: 'play reverse play reverse',
                },
                scaleY: 0,
                transformOrigin: 'bottom',
                duration: 0.7,
                stagger: 0.07,
                ease: 'power2.out',
              });
            }

            // Animasi badge ikon membal halus (bounce)
            const badges = bottomFeatures.querySelectorAll('.badge-item');
            if (badges.length > 0) {
              gsap.from(badges, {
                scrollTrigger: {
                  trigger: bottomFeatures.querySelector('.sample-medals'),
                  start: 'top 85%',
                  end: 'bottom top',
                  toggleActions: 'play reverse play reverse',
                },
                scale: 0.75,
                opacity: 0,
                duration: 0.65,
                stagger: 0.12,
                ease: 'back.out(1.6)',
              });
            }
          }
        }

        // --------------------------------------------------------------------
        // E. SCROLL REVEAL: SEKSI PENUTUP (CTA / CLOSING) (SCROLL BACK AKTIF)
        // --------------------------------------------------------------------
        const closingSection = el.querySelector('.landing-closing');
        if (closingSection) {
          const closingElements = [
            closingSection.querySelector('.closing-eyebrow'),
            closingSection.querySelector('h2'),
            closingSection.querySelector('p'),
            closingSection.querySelector('.closing-actions'),
            closingSection.querySelector('small'),
          ].filter(Boolean);

          gsap.from(closingElements, {
            scrollTrigger: {
              trigger: closingSection,
              start: 'top 78%',
              end: 'bottom top',
              toggleActions: 'play reverse play reverse',
            },
            y: 35,
            opacity: 0,
            duration: 0.8,
            stagger: 0.12,
            ease: 'power3.out',
          });
        }

        // --------------------------------------------------------------------
        // F. SCROLL REVEAL: FOOTER (SCROLL BACK AKTIF)
        // --------------------------------------------------------------------
        const footer = el.querySelector('.meadow-rise-footer') || document.querySelector('.meadow-rise-footer');
        if (footer) {
          gsap.from(footer, {
            scrollTrigger: {
              trigger: footer,
              start: 'top 92%',
              end: 'bottom bottom',
              toggleActions: 'play reverse play reverse',
            },
            y: 35,
            opacity: 0,
            duration: 0.85,
            ease: 'power2.out',
          });
        }
        return () => el.removeEventListener('bungkok:intro-reveal', revealHero);
      });

      // ======================================================================
      // 2. PARALLAX SCRUB EFEK (Khusus Layar Desktop >= 1024px)
      // ======================================================================
      media.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const hero = el.querySelector('.landing-hero');
        if (hero) {
          gsap.to('.hero-type', {
            y: 130,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.8 },
          });
          gsap.to('.hero-figure', {
            y: 220,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.8 },
          });
        }

        // Parallax foto kolase pada seksi About
        el.querySelectorAll('[data-parallax]').forEach((element) => {
          const distance = Number(element.dataset.parallax);
          gsap.fromTo(element, { y: -distance }, {
            y: distance,
            ease: 'none',
            scrollTrigger: {
              trigger: element.closest('[data-motion-section]'),
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.8,
            },
          });
        });

        // Efek kipas kartu visual di seksi penutup (Closing Fan)
        el.querySelectorAll('[data-fan-angle]').forEach((card) => {
          const angle = Number(card.dataset.fanAngle);
          gsap.fromTo(card, { rotation: angle * 1.6, x: Math.sign(angle) * 40, y: 50 }, {
            rotation: angle,
            x: 0,
            y: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: '.closing-fan',
              start: 'top bottom',
              end: 'center center',
              scrub: 0.8,
            },
          });
        });
      });
    }, root);

    let mounted = true;
    document.fonts.ready.then(() => {
      if (mounted) ScrollTrigger.refresh();
    });

    return () => {
      mounted = false;
      media.revert();
      context.revert();
    };
  }, []);

  return root;
}
