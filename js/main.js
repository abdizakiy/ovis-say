(() => {
  const root = document.documentElement;

  /* Nav turns solid after a short scroll (no GSAP needed) */
  const nav = document.querySelector('[data-nav]');
  const syncNav = () => nav && nav.classList.toggle('is-solid', window.scrollY > 40);
  syncNav();
  window.addEventListener('scroll', syncNav, { passive: true });

  /* If GSAP failed to load, never leave content hidden */
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('motion');
    return;
  }
  /* Same if the motion layer (motion.js) did not start */
  window.addEventListener('load', () => { if (!window.__motionReady) root.classList.remove('motion'); });

  gsap.registerPlugin(ScrollTrigger);
  const q = (s, c = document) => gsap.utils.toArray(s, c);
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    root.classList.add('motion');

    /* ---------- Hero: glow → fan out → headline → text (waits for the shutter intro) ---------- */
    const heroFrames = q('.hero__stack .frame');
    const hero = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
    hero
      .to('.hero__glow', { opacity: 1, duration: 1.4 }, 0)
      // frames start stacked (x 0, no rotation) and fan out to their CSS position
      .from(heroFrames, { x: 0, rotation: 0, y: 70, duration: 1.2, stagger: 0.1 }, 0.1)
      .to(heroFrames, { opacity: 1, duration: 0.8, stagger: 0.1 }, 0.1)
      .fromTo('.hero .mask__in', { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: 0.9, stagger: 0.12 }, 0.5)
      .fromTo('[data-hero-fade]', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, 1);

    const startHero = () => hero.play(0);
    if (root.classList.contains('is-intro')) document.addEventListener('intro:done', startHero, { once: true });
    else startHero();

    /* ---------- Generic reveals ---------- */
    q('[data-reveal]').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    /* Frame groups: staggered entrance */
    ['.triptych', '.commercial__frames', '.others__grid', '.process__frames'].forEach((sel) => {
      q(sel).forEach((group) => {
        const frames = q('.frame', group);
        if (!frames.length) return;
        gsap.fromTo(frames, { opacity: 0, y: 60 }, {
          opacity: 1, y: 0, duration: 1, stagger: 0.14, ease: 'power3.out',
          scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        });
      });
    });

    /* Process hairlines draw in */
    const steps = q('.step');
    if (steps.length) {
      gsap.fromTo(steps, { '--rule': 0 }, {
        '--rule': 1, duration: 0.9, stagger: 0.1, ease: 'power3.inOut',
        scrollTrigger: { trigger: '.steps', start: 'top 85%', once: true },
      });
    }

    /* ---------- Gradient sweep: scrubbed, transform only ---------- */
    q('[data-sweep]').forEach((sec) => {
      const rtl = sec.classList.contains('sweep--rtl');
      gsap.fromTo(sec.querySelector('.sweep__bg'), { xPercent: 0 }, {
        xPercent: rtl ? 37.5 : -37.5,
        ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    /* ---------- Desktop only: image parallax inside frames ---------- */
    const desktop = gsap.matchMedia();
    desktop.add('(min-width: 900px)', () => {
      q('[data-parallax]').forEach((frame) => {
        const img = frame.querySelector('img');
        const amt = parseFloat(frame.dataset.parallax) || 6;
        gsap.fromTo(img, { scale: 1.14, yPercent: amt }, {
          yPercent: -amt,
          ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        });
      });
    });

    return () => {
      root.classList.remove('motion');
      desktop.revert();
    };
  });
})();
