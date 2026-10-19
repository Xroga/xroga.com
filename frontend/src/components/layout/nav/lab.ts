/**
 * Navigation lab: two interactive concepts for founder review, mounted only in a local build with NEXT_PUBLIC_NAVLAB=1
 * and opened with ?nav=a or ?nav=b. Never part of the shipped header.
 *
 * A, Fluid Intelligence: one lens of light that follows the pointer between items on springs (leading edge first, so it
 * stretches and settles), leans toward the pointer inside an item, carries a light that tracks the pointer and a rim
 * whose bright arc faces it; the open menu flows out of the lens.
 * B, Connected Execution: a rail of nodes under the items; selection brackets travel on staggered springs, a lit
 * segment follows a beat behind and lights the nodes it passes, an instrument marker tracks the pointer on the rail,
 * labels are scanned in from the side the pointer came from; the menu unfolds from a bus line drawn out of the item.
 *
 * Everything is driven from one requestAnimationFrame loop that runs only while something moves or the pointer is over
 * the bar. Positions are written only to the small moving elements, after all measurements are read.
 */
import './lab.css';

type Concept = 'a' | 'b';
type Box = { l: number; r: number; c: number; w: number };

class Spring {
  x: number;
  v = 0;
  t: number;
  constructor(
    x: number,
    public k = 420,
    public z = 1,
  ) {
    this.x = this.t = x;
  }
  step(dt: number) {
    // semi-implicit Euler in small substeps: stable and interruptible (retargeting keeps velocity)
    const c = 2 * Math.sqrt(this.k) * this.z;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.v += (this.k * (this.t - this.x) - c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
  }
  get done() {
    return Math.abs(this.t - this.x) < 0.05 && Math.abs(this.v) < 1;
  }
  snap(x: number) {
    this.x = this.t = x;
    this.v = 0;
  }
}

const el = (cls: string, parent: Element) => {
  const e = document.createElement('span');
  e.className = cls;
  e.setAttribute('aria-hidden', 'true');
  parent.appendChild(e);
  return e;
};

export function mountLab(concept: Concept, root: HTMLElement) {
  const nav = root.querySelector<HTMLElement>('.xn-nav')!;
  const bar = root.querySelector<HTMLElement>('.xn-bar')!;
  const panel = root.querySelector<HTMLElement>('#xn-panel')!;
  const surface = root.querySelector<HTMLElement>('.xn-panel-surface')!;
  const cta = root.querySelector<HTMLElement>('.xn-actions .xn-cta');
  const orb = root.querySelector<HTMLElement>('.xn-lockup-orb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.concept = concept;
  const added: Element[] = [];
  const add = (cls: string, parent: Element) => {
    const e = el(cls, parent);
    added.push(e);
    return e;
  };

  /* ---------------------------------------------------------------- geometry, read in one place */
  const items = [...nav.querySelectorAll<HTMLElement>('.xn-item')];
  let boxes: Box[] = [];
  let navRect = nav.getBoundingClientRect();
  let barRect = bar.getBoundingClientRect();
  let rootRect = root.getBoundingClientRect();
  const measure = () => {
    navRect = nav.getBoundingClientRect();
    barRect = bar.getBoundingClientRect();
    rootRect = root.getBoundingClientRect();
    boxes = items.map((it) => {
      const r = it.getBoundingClientRect();
      const l = r.left - navRect.left;
      return { l, r: l + r.width, c: l + r.width / 2, w: r.width };
    });
  };
  measure();
  const ro = new ResizeObserver(() => {
    measure();
    wake();
  });
  ro.observe(nav);
  ro.observe(bar);
  void document.fonts?.ready.then(measure);
  const onHeaderMoved = () => measure();
  root.addEventListener('transitionend', onHeaderMoved);

  /* ---------------------------------------------------------------- pointer and selection */
  let px = -1;
  let py = -1;
  let overNav = false;
  let overBar = false;
  let hot = -1; // item index under attention
  let lastHot = -1;
  let dir = 1;
  let focusIdx = -1;
  const openIdx = () => items.findIndex((it) => it.getAttribute('aria-expanded') === 'true');
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || root.hasAttribute('data-hidden')) return;
    const x = e.clientX - navRect.left;
    const y = e.clientY - navRect.top;
    const nowOverBar = e.clientX >= barRect.left && e.clientX <= barRect.right && e.clientY >= barRect.top && e.clientY <= barRect.bottom;
    const nowOverNav = nowOverBar && x >= boxes[0].l - 6 && x <= boxes[boxes.length - 1].r + 6;
    if (!nowOverBar && !overBar && e.clientY > barRect.bottom + 60) return;
    px = x;
    py = y;
    overBar = nowOverBar;
    overNav = nowOverNav;
    cursorCta(e);
    cursorLogo(e);
    wake();
  };
  const onLeave = () => {
    overNav = overBar = false;
    wake();
  };
  const onFocus = (e: FocusEvent) => {
    const i = items.indexOf(e.target as HTMLElement);
    focusIdx = i >= 0 && (e.target as HTMLElement).matches(':focus-visible') ? i : -1;
    wake();
  };
  const onBlur = () => {
    focusIdx = -1;
    wake();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  nav.addEventListener('focusin', onFocus);
  nav.addEventListener('focusout', onBlur);

  const pickHot = () => {
    if (overNav) {
      // nearest item by x: no flicker in the gaps between labels
      let best = 0;
      let bd = Infinity;
      boxes.forEach((b, i) => {
        const d = px < b.l ? b.l - px : px > b.r ? px - b.r : 0;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    }
    if (focusIdx >= 0) return focusIdx;
    return openIdx();
  };
  const setHot = (i: number) => {
    if (i === hot) return;
    if (hot >= 0) items[hot].removeAttribute('data-hot');
    if (i >= 0) {
      dir = lastHot >= 0 && boxes[i].c < boxes[lastHot].c ? -1 : 1;
      items[i].setAttribute('data-scan', dir > 0 ? 'l' : 'r');
      items[i].setAttribute('data-hot', '');
      lastHot = i;
    }
    hot = i;
  };

  /* ---------------------------------------------------------------- CTA and logo (both concepts) */
  function cursorCta(e: PointerEvent) {
    if (!cta) return;
    const r = cta.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) {
      cta.style.setProperty('--mx', `${e.clientX - r.left}px`);
      cta.style.setProperty('--my', `${e.clientY - r.top}px`);
      // a slight pull toward the pointer (at most 1.5 px)
      cta.style.setProperty('--pull-x', `${((e.clientX - r.left) / r.width - 0.5) * 3}px`);
      cta.style.setProperty('--pull-y', `${((e.clientY - r.top) / r.height - 0.5) * 2}px`);
    } else {
      cta.style.setProperty('--pull-x', '0px');
      cta.style.setProperty('--pull-y', '0px');
    }
  }
  const glint = concept === 'a' && orb ? add('xl-glint', orb) : null;
  function cursorLogo(e: PointerEvent) {
    if (!glint || !orb) return;
    const r = orb.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(e.clientX - cx, e.clientY - cy);
    const near = Math.max(0, 1 - d / 160);
    // the orb's glass catches the pointer: a highlight on the side the pointer is on, only near the mark
    const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
    glint.style.setProperty('--gx', `${50 + Math.cos(ang) * 22}%`);
    glint.style.setProperty('--gy', `${50 + Math.sin(ang) * 22}%`);
    glint.style.opacity = (near * 0.9).toFixed(3);
  }

  /* ---------------------------------------------------------------- concept layers */
  const H = 34; // item height
  let frame: (dt: number) => boolean;
  let onOpen: (first: boolean) => void;

  if (concept === 'a') {
    const lens = add('xl-lens', nav);
    const light = add('xl-lens-light', lens);
    const rim = add('xl-lens-rim', lens);
    const meniscus = add('xl-meniscus', panel);
    const L = new Spring(0, 520);
    const R = new Spring(0, 520);
    const S = new Spring(1, 300); // vertical squash with speed
    const presence = { on: false };
    let lx = 0;
    let ly = H / 2;
    frame = (dt) => {
      const i = pickHot();
      setHot(i);
      if (i >= 0) {
        const b = boxes[i];
        // lean toward the pointer inside the item, a few pixels at most
        const lean = overNav && px >= b.l && px <= b.r ? Math.max(-5, Math.min(5, (px - b.c) * 0.09)) : 0;
        const tl = b.l - 1 + lean;
        const tr = b.r + 1 + lean;
        if (!presence.on) {
          // appear in place, from a slightly narrower shape
          L.snap(b.c - b.w * 0.36);
          R.snap(b.c + b.w * 0.36);
        }
        // the leading edge is stiffer, so the lens stretches toward where it is going and then settles
        const goingRight = tl > L.x;
        L.k = goingRight ? 300 : 620;
        R.k = goingRight ? 620 : 300;
        L.t = tl;
        R.t = tr;
        presence.on = true;
      } else presence.on = false;
      L.step(dt);
      R.step(dt);
      const speed = Math.abs(L.v) + Math.abs(R.v);
      S.t = 1 - Math.min(0.14, speed / 9000);
      S.step(dt);
      const w = Math.max(8, R.x - L.x);
      lens.toggleAttribute('data-on', presence.on);
      lens.style.width = `${w}px`;
      lens.style.transform = `translate3d(${L.x}px, -50%, 0) scaleY(${S.x.toFixed(4)})`;
      // the inner light follows the pointer inside the lens, else rests at its centre
      const tx = overNav ? px - L.x : w / 2;
      const ty = overNav ? Math.max(4, Math.min(H - 4, py - (navRect.height - H) / 2)) : H / 2;
      lx += (tx - lx) * Math.min(1, dt * 18);
      ly += (ty - ly) * Math.min(1, dt * 18);
      light.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      // the rim's bright arc faces the pointer (or the top when the pointer is in the menu)
      const ang = overNav ? (Math.atan2(py - navRect.height / 2, px - (L.x + w / 2)) * 180) / Math.PI + 90 : 0;
      rim.style.setProperty('--a', `${ang.toFixed(1)}deg`);
      // the menu's meniscus sits under the lens
      const mx = navRect.left - rootRect.left + L.x + w / 2;
      meniscus.style.transform = `translate3d(${mx}px, 0, 0)`;
      return !(L.done && R.done && S.done) || overBar;
    };
    onOpen = (first) => {
      if (!first || reduced) return;
      // the menu flows out of the lens: a mask that starts as the lens's shape at the top of the panel
      const sw = surface.offsetWidth;
      const left = navRect.left - rootRect.left + L.x;
      const right = sw - (left + (R.x - L.x));
      surface.animate(
        [{ clipPath: `inset(0px ${right}px calc(100% - ${H}px) ${left}px round 17px)` }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }],
        { duration: 440, easing: 'cubic-bezier(0.3, 0.72, 0, 1)' },
      );
    };
  } else {
    const rail = add('xl-rail', nav);
    const nodes = boxes.map(() => add('xl-node', rail));
    const seg = add('xl-seg', rail);
    const marker = add('xl-marker', rail);
    const corners = ['tl', 'tr', 'bl', 'br'].map((k) => add(`xl-corner xl-${k}`, nav));
    const bus = add('xl-bus', panel);
    // brackets: top corners lead, bottom corners follow; the rail segment follows a beat behind (layers)
    const TL = new Spring(0, 640);
    const TR = new Spring(0, 640);
    const BL = new Spring(0, 470);
    const BR = new Spring(0, 470);
    const SL = new Spring(0, 260);
    const SR = new Spring(0, 260);
    const M = new Spring(0, 900);
    const lit = boxes.map(() => 0);
    let on = false;
    let lock = 0;
    frame = (dt) => {
      const i = pickHot();
      setHot(i);
      const wasOn = on;
      on = i >= 0;
      if (on) {
        const b = boxes[i];
        const pad = 4 - lock * 2; // a menu opening locks the brackets 2 px tighter
        if (!wasOn) {
          for (const s of [TL, BL]) s.snap(b.l - pad + 6);
          for (const s of [TR, BR]) s.snap(b.r + pad - 6);
          SL.snap(b.c);
          SR.snap(b.c);
        }
        const k = (s: Spring, lead: boolean, base: number) => (s.k = lead ? base * 1.25 : base * 0.8);
        const right = b.c > (TL.x + TR.x) / 2;
        k(TL, !right, 640);
        k(BL, !right, 470);
        k(TR, right, 640);
        k(BR, right, 470);
        TL.t = BL.t = b.l - pad;
        TR.t = BR.t = b.r + pad;
        SL.t = b.l + 8;
        SR.t = b.r - 8;
      }
      lock = Math.max(0, Math.min(1, lock + (openIdx() >= 0 ? dt * 10 : -dt * 10)));
      for (const s of [TL, TR, BL, BR, SL, SR]) s.step(dt);
      if (overNav) M.t = px;
      M.step(dt);
      const top = (navRect.height - H) / 2 - 3;
      const bot = top + H + 6;
      const pos = [
        [TL.x, top],
        [TR.x, top],
        [BL.x, bot],
        [BR.x, bot],
      ];
      corners.forEach((c, n) => {
        c.style.transform = `translate3d(${pos[n][0]}px, ${pos[n][1]}px, 0)`;
        c.toggleAttribute('data-on', on);
      });
      seg.toggleAttribute('data-on', on);
      seg.style.transform = `translate3d(${SL.x}px, 0, 0)`;
      seg.style.width = `${Math.max(2, SR.x - SL.x)}px`;
      marker.toggleAttribute('data-on', overNav);
      marker.style.transform = `translate3d(${M.x}px, 0, 0)`;
      // nodes light while the segment passes over them, then fade: the selection visibly travels the rail
      let fading = false;
      boxes.forEach((b, n) => {
        const over = on && b.c >= SL.x - 2 && b.c <= SR.x + 2 ? 1 : 0;
        lit[n] = Math.max(over, lit[n] - dt * 2.4);
        if (lit[n] > 0 && !over) fading = true;
        nodes[n].style.transform = `translate3d(${b.c}px, 0, 0)`;
        nodes[n].style.setProperty('--lit', lit[n].toFixed(3));
      });
      const busy = !(TL.done && TR.done && BL.done && BR.done && SL.done && SR.done && M.done) || fading || (lock > 0 && lock < 1);
      return busy || overBar;
    };
    onOpen = (first) => {
      if (reduced) return;
      const x = navRect.left - rootRect.left + (boxes[openIdx()]?.c ?? 0);
      bus.style.transformOrigin = `${x}px 0`;
      // the bus line draws out of the chosen item to both ends, then the panel unfolds from it
      bus.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      if (first) {
        surface.animate([{ clipPath: 'inset(0px 0px calc(100% - 1px) 0px round 16px)' }, { clipPath: 'inset(0px 0px 0px 0px round 16px)' }], {
          duration: 360,
          delay: 90,
          easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
          fill: 'backwards',
        });
      }
    };
    // initial node placement
    boxes.forEach((b, n) => (nodes[n].style.transform = `translate3d(${b.c}px, 0, 0)`));
  }

  /* ---------------------------------------------------------------- open and switch, from the header's own state */
  let wasOpen = -1;
  const mo = new MutationObserver(() => {
    const now = openIdx();
    if (now !== wasOpen) {
      if (now >= 0) {
        measure();
        onOpen(wasOpen < 0);
      }
      wasOpen = now;
      wake();
    }
  });
  mo.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });

  /* ---------------------------------------------------------------- the loop */
  let raf = 0;
  let last = 0;
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    const dt = reduced ? 1 : Math.max(0, Math.min(1 / 30, (now - last) / 1000));
    last = now;
    const busy = frame(dt);
    raf = busy && !document.hidden ? requestAnimationFrame(tick) : 0;
  }
  wake();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      nav.removeEventListener('focusin', onFocus);
      nav.removeEventListener('focusout', onBlur);
      root.removeEventListener('transitionend', onHeaderMoved);
      for (const e of added) e.remove();
      for (const it of items) {
        it.removeAttribute('data-hot');
        it.removeAttribute('data-scan');
      }
      delete root.dataset.concept;
    },
  };
}
