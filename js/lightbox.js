/* ==========================================================================
   Photo preview (lightbox) for every photo on the page.
   Click / Enter on a photo: it grows out of its thumbnail into a full preview.
   ← → or swipe to browse, Esc / backdrop / Close to leave.
   Works without GSAP and with reduced motion (then it simply fades / cuts).
   ========================================================================== */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  const frames = [...document.querySelectorAll('.frame')].filter((f) => f.querySelector('img'));
  if (!frames.length) return;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- DOM ---------- */
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.hidden = true;
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Photo preview');
  lb.innerHTML = `
    <div class="lb__bg"></div>
    <div class="lb__stage"><img class="lb__img" alt=""></div>
    <button class="lb__btn lb__close caption" type="button" aria-label="Close preview"><span>Close</span><i aria-hidden="true"></i></button>
    <button class="lb__btn lb__nav lb__prev" type="button" aria-label="Previous photo"><span aria-hidden="true">←</span></button>
    <button class="lb__btn lb__nav lb__next" type="button" aria-label="Next photo"><span aria-hidden="true">→</span></button>
    <div class="lb__bar caption" aria-live="polite"><span class="lb__count"></span><span class="lb__cap"></span></div>`;
  document.body.appendChild(lb);
  const bg = lb.querySelector('.lb__bg');
  const stage = lb.querySelector('.lb__stage');
  const img = lb.querySelector('.lb__img');
  const btnClose = lb.querySelector('.lb__close');
  const btnPrev = lb.querySelector('.lb__prev');
  const btnNext = lb.querySelector('.lb__next');
  const count = lb.querySelector('.lb__count');
  const cap = lb.querySelector('.lb__cap');

  /* ---------- make every photo a button ---------- */
  const items = frames.map((f, i) => {
    const el = f.querySelector('img');
    const alt = el.getAttribute('alt') || 'Photo';
    f.setAttribute('role', 'button');
    f.tabIndex = 0;
    f.setAttribute('aria-label', `View photo ${i + 1} of ${frames.length}: ${alt}`);
    f.classList.add('is-previewable');
    return { frame: f, src: el.currentSrc || el.src, alt };
  });

  let idx = 0, isOpen = false, busy = false, lastFocus = null;

  const preload = (i) => { const n = (i + items.length) % items.length; const im = new Image(); im.src = items[n].src; };
  function setContent() {
    const it = items[idx];
    img.src = it.src;
    img.alt = it.alt;
    count.textContent = `${pad(idx + 1)} / ${pad(items.length)}`;
    cap.textContent = it.alt;
    preload(idx + 1); preload(idx - 1);
  }
  const decode = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve());

  /* where the current thumbnail sits (null if it is off screen) */
  function thumbRect() {
    const r = items[idx].frame.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return onScreen ? r : null;
  }
  function flip(from, reverse) {
    const to = img.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = Math.max(0.05, from.width / to.width);
    const a = { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 };
    const b = { transform: 'none', opacity: 1 };
    return img.animate(reverse ? [b, a] : [a, b], { duration: reverse ? 380 : 520, easing: EASE, fill: 'both' });
  }

  /* ---------- open / close ---------- */
  async function open(i) {
    if (isOpen) return;
    idx = i; isOpen = true; busy = true;
    lastFocus = items[i].frame;
    setContent();
    lb.hidden = false;
    root.classList.add('is-lightbox');
    btnClose.focus({ preventScroll: true });
    if (reduce) { busy = false; return; }
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'both' });
    lb.querySelectorAll('.lb__btn, .lb__bar').forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 180, easing: 'ease-out', fill: 'both' }));
    await decode();
    const from = thumbRect();
    if (from) await flip(from, false).finished.catch(() => {});
    else await img.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: EASE, fill: 'both' }).finished.catch(() => {});
    img.getAnimations().forEach((a) => a.cancel());
    busy = false;
  }

  async function close() {
    if (!isOpen) return;
    isOpen = false;
    const finish = () => {
      lb.hidden = true;
      root.classList.remove('is-lightbox');
      lb.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      busy = false;
      const target = items[idx].frame;
      target.focus({ preventScroll: true });
    };
    if (reduce) return finish();
    busy = true;
    lb.querySelectorAll('.lb__btn, .lb__bar').forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'both' }));
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'both' });
    const to = thumbRect();
    if (to) await flip(to, true).finished.catch(() => {});
    else await img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'both' }).finished.catch(() => {});
    finish();
  }

  async function go(d) {
    if (!isOpen || busy) return;
    busy = true;
    const n = items.length;
    if (reduce) { idx = (idx + d + n) % n; setContent(); busy = false; return; }
    await img.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 36}px)` }], { duration: 150, easing: 'ease-in', fill: 'both' }).finished.catch(() => {});
    idx = (idx + d + n) % n;
    setContent();
    await decode();
    await img.animate([{ opacity: 0, transform: `translateX(${d * 36}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE, fill: 'both' }).finished.catch(() => {});
    img.getAnimations().forEach((a) => a.cancel());
    busy = false;
  }

  /* ---------- events ---------- */
  items.forEach((it, i) => {
    it.frame.addEventListener('click', () => open(i));
    it.frame.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
    });
  });
  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', () => go(-1));
  btnNext.addEventListener('click', () => go(1));
  // tap on the empty area around the photo closes it
  stage.addEventListener('click', (e) => { if (e.target !== img) close(); });

  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {            // keep focus inside the dialog
      const f = [btnClose, btnPrev, btnNext];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  // swipe left / right on touch screens
  let sx = 0, sy = 0, tracking = false;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; tracking = true; });
  stage.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { tracking = false; });
})();
