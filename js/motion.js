/* ==========================================================================
   Motion layer. Patterns studied from motion.ayprojex.com and rebuilt for this site:
   shutter intro · line reveal · ink reveal · horizontal pin ·
   velocity marquee · tilt cards · pill nav.
   Plain JS, one requestAnimationFrame loop, no layout thrash beyond a few rect reads.
   ========================================================================== */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Pill nav (UI, works with or without motion) ---------- */
  const pill = document.querySelector('[data-pill]');
  if (pill) {
    const btn = pill.querySelector('.pill__btn');
    const label = btn.firstElementChild;
    const set = (open) => {
      pill.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Close' : 'Menu';
    };
    btn.addEventListener('click', () => set(!pill.classList.contains('is-open')));
    pill.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    document.addEventListener('pointerdown', (e) => { if (!pill.contains(e.target)) set(false); });
  }

  if (reduce || !root.classList.contains('motion')) return;
  window.__motionReady = true;

  /* ---------- Easing + tween helpers ---------- */
  const expo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const inOut3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const inOut5 = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
  const linear = (t) => t;
  let skipped = false;
  /* Time only advances while frames run, so a hidden tab resumes where it stopped. */
  function tween(ms, fn, ease = expo) {
    return new Promise((done) => {
      let elapsed = 0, last = null;
      (function step(now) {
        if (last !== null) elapsed += Math.min(now - last, 50);
        last = now;
        if (skipped) elapsed = ms;
        const p = Math.min(1, elapsed / ms);
        fn(ease(p), p);
        p < 1 ? requestAnimationFrame(step) : done();
      })(performance.now());
    });
  }
  const wait = (ms) => tween(ms, () => {}, linear);

  /* ---------- Engine state ---------- */
  let ready = false; // text reveals start once the intro lets go

  /* ---------- Line reveal ---------- */
  const lineBlocks = $('[data-lines]').map((el) => ({
    el, text: el.textContent.trim().replace(/\s+/g, ' '), lines: [], t: 0, active: false,
    delay: parseFloat(el.dataset.delay) || 0, last: [],
  }));
  function splitLines(b) {
    const words = b.text.split(' ');
    b.el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
    const lines = [];
    let top = null;
    b.el.querySelectorAll('.w').forEach((w) => {
      if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; }
      lines[lines.length - 1].push(w.textContent);
    });
    b.el.setAttribute('aria-label', b.text);
    b.el.innerHTML = lines.map((l) => `<span class="line" aria-hidden="true"><span class="line-inner">${l.join(' ')}</span></span>`).join('');
    b.lines = [...b.el.querySelectorAll('.line-inner')];
    b.last = [];
    b.el.classList.add('is-split');
  }

  /* ---------- Ink reveal ---------- */
  function wrapWords(node) {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) frag.append(tok);
          else { const s = document.createElement('span'); s.className = 'w'; s.textContent = tok; frag.append(s); }
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) wrapWords(n);
    });
  }
  const inks = $('[data-ink]').map((el) => {
    wrapWords(el);
    return { el, words: $('.w', el), pin: el.closest('[data-ink-pin]'), on: -1 };
  });

  /* ---------- Horizontal pin ---------- */
  const pin = document.querySelector('[data-pin]');
  const pinState = pin && {
    track: pin.querySelector('[data-track]'),
    bar: pin.querySelector('.pin__bar span'),
    frames: $('.pframe .frame', pin).map((f) => ({ f, img: f.querySelector('img') })),
    distance: 0, x: 0,
  };
  function measurePin() {
    if (!pin) return;
    pin.classList.add('is-pinned');
    // total track width = padding + every panel + gaps (offsetWidth ignores transforms, so re-measuring is stable)
    const track = pinState.track, cs = getComputedStyle(track);
    const kids = [...track.children];
    const gap = parseFloat(cs.columnGap) || 0;
    const total = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      + kids.reduce((a, k) => a + k.offsetWidth, 0) + gap * (kids.length - 1);
    pinState.distance = Math.max(0, total - innerWidth);
    pin.style.height = innerHeight + pinState.distance + 'px';
  }

  /* ---------- Velocity marquee ---------- */
  const rows = $('[data-marquee] .mrow').map((row) => {
    const track = row.querySelector('.mtrack');
    return { row, track, chunk: track.querySelector('.chunk'), dir: Number(row.dataset.dir), speed: Number(row.dataset.speed), offset: 0, width: 0, words: [] };
  });
  function fillMarquee() {
    rows.forEach((r) => {
      r.track.querySelectorAll('.chunk:not(:first-child)').forEach((c) => c.remove());
      r.width = r.chunk.getBoundingClientRect().width;
      const copies = Math.max(2, Math.ceil((innerWidth * 2) / Math.max(1, r.width)));
      for (let i = 1; i < copies; i++) r.track.appendChild(r.chunk.cloneNode(true));
      r.words = $('.chunk span', r.track);
    });
  }
  let lastY = scrollY, velocity = 0, direction = 1, skew = 0;

  /* ---------- Tilt (frames) ---------- */
  const tilts = !fine ? [] : $('.triptych .frame, .commercial__frames .frame, .process__frames .frame, .others__frame').map((el) => {
    const inner = document.createElement('span');
    inner.className = 'frame__tilt';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    const glare = document.createElement('span');
    glare.className = 'frame__glare';
    glare.setAttribute('aria-hidden', 'true');
    el.appendChild(glare);
    return { el, inner, rx: 0, ry: 0, vx: 0, vy: 0, gx: 50, gy: 30, on: false, rest: true };
  });
  const TILT = 7;
  const pointer = { x: -999, y: -999, seen: false };
  if (fine) {
    document.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; });
    document.addEventListener('pointerleave', () => { pointer.x = pointer.y = -999; });
  }

  /* ---------- Main loop ---------- */
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    const f = dt * 60; // 1 at 60fps
    const vh = innerHeight;

    // line reveal
    if (ready) lineBlocks.forEach((b) => {
      if (!b.lines.length) return;
      const r = b.el.getBoundingClientRect();
      if (r.top < vh * 0.9 && r.bottom > 0) b.active = true;
      else if (r.top >= vh) { b.active = false; b.t = 0; }
      if (b.active) b.t += dt;
      b.lines.forEach((ln, i) => {
        const p = clamp((b.t - b.delay - i * 0.09) / 0.9);
        const v = p >= 1 ? 'none' : `translateY(${((1 - expo(p)) * 110).toFixed(2)}%)`;
        if (b.last[i] !== v) { ln.style.transform = v; b.last[i] = v; }
      });
    });

    // ink reveal
    inks.forEach((k) => {
      let p;
      if (k.pin) {
        const r = k.pin.getBoundingClientRect();
        p = clamp(-r.top / ((r.height - vh) * 0.7 || 1));
      } else {
        const r = k.el.getBoundingClientRect();
        p = clamp((vh * 0.85 - r.top) / (vh * 0.5));
      }
      const on = Math.round(p * k.words.length);
      if (on !== k.on) { k.words.forEach((w, i) => w.classList.toggle('on', i < on)); k.on = on; }
    });

    // horizontal pin
    if (pin && pinState.distance) {
      const r = pin.getBoundingClientRect();
      const p = clamp(-r.top / pinState.distance);
      pinState.x += (p * pinState.distance - pinState.x) * (1 - Math.pow(1 - 0.12, f));
      if (Math.abs(p * pinState.distance - pinState.x) < 0.1) pinState.x = p * pinState.distance;
      pinState.track.style.transform = `translate3d(${-pinState.x.toFixed(2)}px,0,0)`;
      pinState.bar.style.transform = `scaleX(${(pinState.x / pinState.distance).toFixed(4)})`;
      const mid = innerWidth / 2;
      pinState.frames.forEach(({ f: fr, img }) => {
        const b = fr.getBoundingClientRect();
        if (b.right < -200 || b.left > innerWidth + 200) return;
        const offset = (b.left + b.width / 2 - mid) / innerWidth;
        img.style.transform = `translate3d(${(-offset * 9).toFixed(2)}%,0,0) scale(1.2)`;
      });
    }

    // velocity marquee
    {
      const raw = dt > 0 ? (scrollY - lastY) / dt : 0;
      lastY = scrollY;
      velocity += (raw - velocity) * (1 - Math.pow(1 - 0.12, f));
      if (Math.abs(velocity) > 20) direction = Math.sign(velocity);
      const boost = Math.min(Math.abs(velocity) / 90, 14);
      skew += (Math.max(-10, Math.min(10, velocity / 260)) - skew) * (1 - Math.pow(1 - 0.1, f));
      rows.forEach((r) => {
        if (!r.width) return;
        r.offset += r.speed * (1 + boost) * r.dir * direction * dt;
        const x = ((r.offset % r.width) + r.width) % r.width;
        r.track.style.transform = `translate3d(${-x.toFixed(2)}px,0,0)`;
        const sk = `skewX(${(-skew * r.dir).toFixed(2)}deg)`;
        r.words.forEach((w) => { w.style.transform = sk; });
      });
    }

    // tilt
    tilts.forEach((c) => {
      let inside = false, trx = 0, tryy = 0;
      if (pointer.seen) {
        const r = c.el.getBoundingClientRect();
        inside = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
        if (inside) {
          const px = (pointer.x - r.left) / r.width, py = (pointer.y - r.top) / r.height;
          trx = (0.5 - py) * 2 * TILT; tryy = (px - 0.5) * 2 * TILT;
          c.gx = px * 100; c.gy = py * 100;
        }
      }
      if (!inside && c.rest) return;
      c.vx = (c.vx + (trx - c.rx) * 0.09 * f) * Math.pow(0.8, f); c.rx += c.vx * f;
      c.vy = (c.vy + (tryy - c.ry) * 0.09 * f) * Math.pow(0.8, f); c.ry += c.vy * f;
      const settled = !inside && Math.abs(c.rx) < 0.01 && Math.abs(c.ry) < 0.01 && Math.abs(c.vx) < 0.01 && Math.abs(c.vy) < 0.01;
      if (settled) { c.rx = c.ry = c.vx = c.vy = 0; c.rest = true; c.inner.style.transform = ''; c.el.style.setProperty('--g', 0); return; }
      c.rest = false;
      const lift = Math.min(1, (Math.abs(c.rx) + Math.abs(c.ry)) / TILT);
      c.inner.style.transform = `perspective(900px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${(1 + lift * 0.035).toFixed(4)})`;
      c.el.style.setProperty('--gx', c.gx.toFixed(1) + '%');
      c.el.style.setProperty('--gy', c.gy.toFixed(1) + '%');
      c.el.style.setProperty('--g', inside ? 1 : 0);
    });

    requestAnimationFrame(frame);
  }

  /* ---------- Shutter intro ---------- */
  async function runIntro() {
    const el = document.getElementById('intro');
    const burst = el.querySelector('.intro__burst');
    const shots = $('img', burst);
    const count = el.querySelector('.intro__count');
    const tag = el.querySelector('.intro__tag');
    const full = el.querySelector('.intro__full');
    const fullImg = full.querySelector('img');
    const h1 = el.querySelector('.intro__title');
    const sub = el.querySelector('.intro__sub');
    const skip = el.querySelector('.intro__skip');

    const name = 'Oktavianus Balu Say';
    h1.innerHTML = name.split(' ').map((w) =>
      `<span class="word">${[...w].map((c) => `<span class="mask" aria-hidden="true"><span class="ch">${c}</span></span>`).join('')}</span>`
    ).join(' ');
    h1.setAttribute('aria-label', name);
    const chars = $('.ch', h1);
    chars.forEach((c) => { c.style.transform = 'translateY(110%)'; });
    skip.addEventListener('click', () => { skipped = true; });
    const onKey = (e) => { if (e.key === 'Escape') skipped = true; };
    document.addEventListener('keydown', onKey);

    await Promise.all([...shots, fullImg].map((i) => i.decode().catch(() => {})));
    await wait(120);

    // Burst: each frame holds a little longer than the last, like a shutter slowing down.
    // (whole intro ≈ 3.4 s; it only plays on a first visit and then not again for 7 days)
    let shown = -1;
    await tween(1000, (e, p) => {
      count.textContent = String(Math.round(e * 100)).padStart(3, '0');
      const idx = Math.min(shots.length - 1, Math.floor(Math.pow(p, 0.8) * shots.length));
      if (idx !== shown) { shots.forEach((s, i) => s.classList.toggle('on', i === idx)); shown = idx; }
    }, inOut3);
    count.textContent = '100';
    if (!skipped) await wait(100);

    // The burst frame opens to the full screen.
    const r = burst.getBoundingClientRect();
    const from = { t: r.top, r: innerWidth - r.right, b: innerHeight - r.bottom, l: r.left };
    burst.style.opacity = 0; count.style.opacity = 0; tag.style.opacity = 0;
    await tween(700, (e) => {
      const k = 1 - e;
      full.style.clipPath = `inset(${from.t * k}px ${from.r * k}px ${from.b * k}px ${from.l * k}px round ${4 * k}px)`;
      fullImg.style.transform = `scale(${1.25 - 0.25 * e})`;
    }, inOut5);

    // Name rises letter by letter from behind its masks.
    tween(960, (_, p) => {
      chars.forEach((c, i) => {
        const local = Math.min(1, Math.max(0, (p * 960 - i * 24) / 500));
        c.style.transform = `translateY(${(1 - expo(local)) * 110}%)`;
      });
    }, linear);
    await wait(360);
    await tween(320, (e) => { sub.style.opacity = e; });
    if (!skipped) await wait(220);

    // Lift away; the hero starts building underneath as the overlay leaves.
    const quick = skipped;
    skipped = false;
    document.removeEventListener('keydown', onKey);
    document.dispatchEvent(new Event('intro:done'));
    await tween(quick ? 450 : 600, (e) => { el.style.transform = `translateY(${-100 * e}%)`; }, inOut3);
    root.classList.remove('is-intro');
    el.style.transform = '';
    try { localStorage.setItem('intro-seen-at', String(Date.now())); } catch (e) {}
  }

  /* ---------- Init ---------- */
  function layout() {
    lineBlocks.forEach(splitLines);
    fillMarquee();
    measurePin();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  document.addEventListener('intro:done', () => { ready = true; });

  document.fonts.ready.then(() => {
    layout();
    requestAnimationFrame(frame);
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 150); });
    addEventListener('load', layout);
    if (root.classList.contains('is-intro')) {
      runIntro().catch(() => {
        root.classList.remove('is-intro');
        document.getElementById('intro').style.display = 'none';
        document.dispatchEvent(new Event('intro:done'));
      });
    } else {
      ready = true;
    }
  });
})();
