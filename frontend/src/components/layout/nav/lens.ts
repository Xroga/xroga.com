/**
 * Navigation "Context Lens": the imperative layer of PublicMarketingHeader.
 *
 * One optical instrument rather than a highlight:
 * - The bar's surface catches a broad, faint light where the pointer is.
 * - The lens forms around the chosen item from four layers that move at different rates against the pointer: a glass
 *   body, a deep caustic glow (slow), a top sheen (fast) and a light filament under the label (exact), so moving the
 *   pointer inside an item reads as depth. Its rim's bright arc faces the pointer, or the direction of travel.
 * - Between items it travels as one object: the leading edge is stiffer, so it stretches toward the target and the
 *   caustic smears in the direction of travel, then everything settles. Retargeting keeps velocity (no restarts).
 * - The other labels step back while the lens is focused.
 * - The menu morphs out of the lens's own outline and back into it; inside the menu a focus card glides between links.
 * - The logo's glass reflects light toward the pointer, inside the orb only; the CTA's light and rim track the pointer.
 * One requestAnimationFrame loop, running only while something moves or the pointer is over the bar. Every measurement
 * is read before anything is written, and only the small moving elements are written to.
 */
import './lens.css';

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
    const c = 2 * Math.sqrt(this.k) * this.z;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.v += (this.k * (this.t - this.x) - c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    // land exactly on the target once settled, so nothing (an edge's opacity, say) rests a few percent short of it
    if (this.done) this.snap(this.t);
  }
  get done() {
    return Math.abs(this.t - this.x) < 0.05 && Math.abs(this.v) < 1;
  }
  snap(x: number) {
    this.x = this.t = x;
    this.v = 0;
  }
}

type Box = { l: number; r: number; c: number; w: number };
const H = 36; // lens height
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function mountLens(root: HTMLElement) {
  const nav = root.querySelector<HTMLElement>('.xn-nav')!;
  const bar = root.querySelector<HTMLElement>('.xn-bar')!;
  const panel = root.querySelector<HTMLElement>('#xn-panel')!;
  const surface = root.querySelector<HTMLElement>('.xn-panel-surface')!;
  const cta = root.querySelector<HTMLElement>('.xn-actions .xn-cta');
  const lockup = root.querySelector<HTMLElement>('.xn-lockup');
  const orb = root.querySelector<HTMLElement>('.xn-lockup-orb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.concept = 'lens';
  const added: Element[] = [];
  const add = (cls: string, parent: Element) => {
    const e = document.createElement('span');
    e.className = cls;
    e.setAttribute('aria-hidden', 'true');
    parent.appendChild(e);
    added.push(e);
    return e;
  };

  /* ---------------------------------------------------------------- layers */
  const surf = add('xs-surface', bar);
  const glow = add('xs-glow', surf);
  const edgeIn = add('xs-edge-in', surf);
  const edge = add('xs-edge', bar);
  const lens = add('xs-lens', nav);
  const glass = add('xs-glass', lens);
  const caustic = add('xs-caustic', lens);
  const sheen = add('xs-sheen', lens);
  const filament = add('xs-filament', lens);
  const rim = add('xs-rim', lens);
  void glass;
  const meniscus = add('xs-meniscus', panel);
  const card = add('xs-card', surface);
  const orbLight = orb ? add('xs-orb-light', orb) : null;
  if (orb) add('xs-orb-sweep', orb);

  /* ---------------------------------------------------------------- geometry */
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
  const onMoved = (e: TransitionEvent) => e.target === root && measure();
  root.addEventListener('transitionend', onMoved);

  /* ---------------------------------------------------------------- pointer */
  let cx = -1; // client coordinates
  let cy = -1;
  let px = 0; // nav-local
  let py = 0;
  let overBar = false;
  let overNav = false;
  let focusIdx = -1;
  const openIdx = () => items.findIndex((it) => it.getAttribute('aria-expanded') === 'true');
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || root.hasAttribute('data-hidden')) return;
    cx = e.clientX;
    cy = e.clientY;
    const ob = cx >= barRect.left && cx <= barRect.right && cy >= barRect.top && cy <= barRect.bottom;
    if (!ob && !overBar && cy > barRect.bottom + 140) {
      // far below the bar: only let a lit edge fade out
      if (edgeOn) wake();
      return;
    }
    px = cx - navRect.left;
    py = cy - navRect.top;
    overBar = ob;
    overNav = ob && px >= boxes[0].l - 8 && px <= boxes[boxes.length - 1].r + 8;
    pointerCta();
    pointerLogo();
    wake();
  };
  const onLeave = () => {
    overBar = overNav = false;
    cx = cy = -1;
    wake();
  };
  const onFocusIn = (e: FocusEvent) => {
    const i = items.indexOf(e.target as HTMLElement);
    focusIdx = i >= 0 && (e.target as HTMLElement).matches(':focus-visible') ? i : -1;
    wake();
  };
  const onFocusOut = () => {
    focusIdx = -1;
    wake();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  nav.addEventListener('focusin', onFocusIn);
  nav.addEventListener('focusout', onFocusOut);

  function pointerCta() {
    if (!cta) return;
    const r = cta.getBoundingClientRect();
    const near = cx >= r.left - 30 && cx <= r.right + 30 && cy >= r.top - 20 && cy <= r.bottom + 20;
    if (!near) return;
    const x = cx - r.left;
    const y = cy - r.top;
    cta.style.setProperty('--mx', `${clamp(x, 0, r.width)}px`);
    cta.style.setProperty('--my', `${clamp(y, 0, r.height)}px`);
    cta.style.setProperty('--a', `${((Math.atan2(y - r.height / 2, x - r.width / 2) * 180) / Math.PI + 90).toFixed(1)}deg`);
  }
  function pointerLogo() {
    if (!orbLight || !orb) return;
    const r = orb.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const d = Math.hypot(cx - ox, cy - oy);
    const near = clamp(1 - (d - 20) / 180, 0, 1);
    const ang = Math.atan2(cy - oy, cx - ox);
    // the highlight sits on the side of the glass facing the pointer and tightens as the pointer comes closer
    orbLight.style.setProperty('--gx', `${50 + Math.cos(ang) * 24}%`);
    orbLight.style.setProperty('--gy', `${50 + Math.sin(ang) * 24}%`);
    orbLight.style.opacity = (near * 0.95).toFixed(3);
  }

  /* ---------------------------------------------------------------- the lens */
  const L = new Spring(0, 520);
  const R = new Spring(0, 520);
  const SQ = new Spring(1, 340); // squash with speed
  const GX = new Spring(0, 260); // surface light x (bar-local)
  // the perimeter highlight: a point on the bar's outline nearest the pointer, followed with a short lag
  const EX = new Spring(0, 300);
  const EY = new Spring(0, 300);
  const EI = new Spring(0, 260); // intensity
  let edgeOn = false;
  const EDGE_REACH = 64;
  const nearestOnOutline = (x: number, y: number, w: number, h: number, r: number) => {
    const ccx = clamp(x, r, w - r);
    const ccy = clamp(y, r, h - r);
    const dx = x - ccx;
    const dy = y - ccy;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) return { x: ccx + (dx / len) * r, y: ccy + (dy / len) * r, d: Math.abs(len - r) };
    // inside the straight core: the nearest of the four edges
    const ds = [y, h - y, x, w - x];
    const m = ds.indexOf(Math.min(...ds));
    return m === 0 ? { x, y: 0, d: y } : m === 1 ? { x, y: h, d: h - y } : m === 2 ? { x: 0, y, d: x } : { x: w, y, d: w - x };
  };
  let on = false;
  let hot = -1;
  let lx = 0; // smoothed pointer x inside the lens
  let travelDir = 0;
  const pick = () => {
    if (overNav) {
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
    if (i >= 0) items[i].setAttribute('data-hot', '');
    nav.toggleAttribute('data-focus', i >= 0);
    hot = i;
  };

  /* ---------------------------------------------------------------- menu links: one focus card */
  let cardOn = false;
  const CY = new Spring(0, 520);
  const CHt = new Spring(0, 520);
  const CX = new Spring(0, 520);
  const CW = new Spring(0, 520);
  let cardTarget: HTMLElement | null = null;
  let surfRect = surface.getBoundingClientRect();
  const onPanelOver = (e: PointerEvent) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.xn-link');
    if (link === cardTarget) return;
    cardTarget = link;
    wake();
  };
  const onPanelLeave = () => {
    cardTarget = null;
    wake();
  };
  panel.addEventListener('pointerover', onPanelOver);
  panel.addEventListener('pointerleave', onPanelLeave);
  panel.addEventListener('focusin', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.xn-link');
    if (link) {
      cardTarget = link;
      wake();
    }
  });

  /* ---------------------------------------------------------------- frame */
  const frame = (dt: number) => {
    // read phase: the hovered menu link's box (before any write this frame)
    const cardBox = cardTarget && cardTarget.isConnected && panel.hasAttribute('data-open') ? cardTarget.getBoundingClientRect() : null;
    const i = pick();
    setHot(i);
    if (i >= 0) {
      const b = boxes[i];
      const inside = overNav && px >= b.l - 4 && px <= b.r + 4;
      const lean = inside ? clamp((px - b.c) * 0.07, -4, 4) : 0;
      const tl = b.l - 3 + lean;
      const tr = b.r + 3 + lean;
      if (!on) {
        // forms in place from a narrower outline (acquisition)
        L.snap(b.c - b.w * 0.3);
        R.snap(b.c + b.w * 0.3);
        lx = (R.x - L.x) / 2;
      }
      const right = (tl + tr) / 2 > (L.x + R.x) / 2 + 0.5;
      const left = (tl + tr) / 2 < (L.x + R.x) / 2 - 0.5;
      travelDir = right ? 1 : left ? -1 : 0;
      L.k = right ? 300 : 680;
      R.k = right ? 680 : 300;
      if (!right && !left) L.k = R.k = 520;
      L.t = tl;
      R.t = tr;
      on = true;
    } else on = false;
    L.step(dt);
    R.step(dt);
    const w = Math.max(10, R.x - L.x);
    const speed = (Math.abs(L.v) + Math.abs(R.v)) / 2;
    SQ.t = 1 - Math.min(0.12, speed / 7000);
    SQ.step(dt);
    lens.toggleAttribute('data-on', on);
    lens.style.width = `${w.toFixed(2)}px`;
    lens.style.transform = `translate3d(${L.x.toFixed(2)}px, -50%, 0) scaleY(${SQ.x.toFixed(4)})`;

    // inner layers: pointer-local x, with different rates (depth); at rest without a pointer they centre
    const target = overNav ? clamp(px - L.x, 0, w) : w / 2;
    lx += (target - lx) * Math.min(1, dt * 16);
    const off = lx - w / 2;
    const stretch = 1 + Math.min(1.4, speed / 900);
    caustic.style.transform = `translate3d(${(w / 2 + off * 0.75 + travelDir * Math.min(14, speed / 60)).toFixed(2)}px, 0, 0) scaleX(${stretch.toFixed(3)})`;
    sheen.style.transform = `translate3d(${(w / 2 + off * 1.5).toFixed(2)}px, 0, 0)`;
    filament.style.transform = `translate3d(${lx.toFixed(2)}px, 0, 0) scaleX(${stretch.toFixed(3)})`;
    // the rim's bright arc faces the pointer, swinging toward the direction of travel while moving
    const yLocal = overNav ? py - navRect.height / 2 : -H;
    let ang = (Math.atan2(yLocal, overNav ? off : 0) * 180) / Math.PI + 90;
    if (speed > 60) ang = travelDir > 0 ? 90 : travelDir < 0 ? 270 : ang;
    rim.style.setProperty('--a', `${ang.toFixed(1)}deg`);

    // the bar's surface light
    if (overBar) GX.t = cx - barRect.left;
    GX.step(dt);
    glow.toggleAttribute('data-on', overBar);
    glow.style.transform = `translate3d(${GX.x.toFixed(1)}px, 0, 0)`;

    // the reactive perimeter: brightest at the outline point nearest the pointer, falling off with distance
    const bw = barRect.width;
    const bh = barRect.height;
    const rad = Math.min(bh / 2, 20);
    const lxp = cx - barRect.left;
    const lyp = cy - barRect.top;
    const near = cx >= 0 ? nearestOnOutline(lxp, lyp, bw, bh, rad) : null;
    const fall = near ? clamp(1 - near.d / EDGE_REACH, 0, 1) : 0;
    if (near && fall > 0) {
      if (!edgeOn) {
        EX.snap(near.x);
        EY.snap(near.y);
      }
      EX.t = near.x;
      EY.t = near.y;
      edgeOn = true;
    } else edgeOn = false;
    EI.t = edgeOn ? Math.pow(fall, 1.4) : 0;
    EX.step(dt);
    EY.step(dt);
    EI.step(dt);
    // the reflection's bright core leads slightly in the direction the highlight is moving along the edge
    const vx = clamp(EX.v / 40, -16, 16);
    const vy = clamp(EY.v / 40, -10, 10);
    edge.style.setProperty('--ex', `${EX.x.toFixed(1)}px`);
    edge.style.setProperty('--ey', `${EY.x.toFixed(1)}px`);
    edge.style.setProperty('--ox', `${(EX.x + vx).toFixed(1)}px`);
    edge.style.setProperty('--oy', `${(EY.x + vy).toFixed(1)}px`);
    edge.style.opacity = clamp(EI.x, 0, 1).toFixed(3);
    edgeIn.style.setProperty('--ex', `${EX.x.toFixed(1)}px`);
    edgeIn.style.setProperty('--ey', `${EY.x.toFixed(1)}px`);
    edgeIn.style.opacity = clamp(EI.x, 0, 1).toFixed(3);

    // the menu's meniscus sits under the lens
    meniscus.style.transform = `translate3d(${(navRect.left - rootRect.left + L.x + w / 2).toFixed(1)}px, 0, 0)`;

    // the link focus card
    let cardBusy = false;
    if (cardBox) {
      const r = cardBox;
      const y = r.top - surfRect.top;
      const x = r.left - surfRect.left;
      if (!cardOn) {
        CY.snap(y);
        CHt.snap(r.height);
        CX.snap(x);
        CW.snap(r.width);
      }
      CY.t = y;
      CHt.t = r.height;
      CX.t = x;
      CW.t = r.width;
      cardOn = true;
    } else cardOn = false;
    for (const s of [CY, CHt, CX, CW]) s.step(dt);
    card.toggleAttribute('data-on', cardOn);
    card.style.transform = `translate3d(${CX.x.toFixed(1)}px, ${CY.x.toFixed(1)}px, 0)`;
    card.style.width = `${CW.x.toFixed(1)}px`;
    card.style.height = `${CHt.x.toFixed(1)}px`;
    cardBusy = !(CY.done && CHt.done && CX.done && CW.done);

    const settled = L.done && R.done && SQ.done && GX.done && EX.done && EY.done && EI.done && Math.abs(target - lx) < 0.2;
    return !settled || overBar || edgeOn || cardBusy;
  };

  /* ---------------------------------------------------------------- menu morph: out of the lens and back into it */
  const lensClip = () => {
    const sw = surface.offsetWidth;
    const left = navRect.left - rootRect.left + L.x;
    const right = sw - (left + (R.x - L.x));
    return `inset(0px ${right.toFixed(1)}px calc(100% - ${H}px) ${left.toFixed(1)}px round ${H / 2}px)`;
  };
  let wasOpen = -1;
  const mo = new MutationObserver(() => {
    const now = openIdx();
    if (now === wasOpen) return;
    measure();
    surfRect = surface.getBoundingClientRect();
    if (!reduced) {
      if (now >= 0 && wasOpen < 0) {
        surface.animate([{ clipPath: lensClip() }, { clipPath: 'inset(0px 0px 0px 0px round 18px)' }], { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      } else if (now < 0 && wasOpen >= 0) {
        surface.animate([{ clipPath: 'inset(0px 0px 0px 0px round 18px)' }, { clipPath: lensClip() }], { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' });
      }
    }
    wasOpen = now;
    wake();
  });
  mo.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
  const panelRO = new ResizeObserver(() => (surfRect = surface.getBoundingClientRect()));
  panelRO.observe(surface);

  /* ---------------------------------------------------------------- loop */
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

  const onLockupEnter = () => lockup?.toggleAttribute('data-sweep', true);
  const onLockupEnd = () => lockup?.removeAttribute('data-sweep');
  lockup?.addEventListener('pointerenter', onLockupEnter);
  lockup?.addEventListener('animationend', onLockupEnd);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      panelRO.disconnect();
      mo.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('focusout', onFocusOut);
      panel.removeEventListener('pointerover', onPanelOver);
      panel.removeEventListener('pointerleave', onPanelLeave);
      root.removeEventListener('transitionend', onMoved);
      lockup?.removeEventListener('pointerenter', onLockupEnter);
      lockup?.removeEventListener('animationend', onLockupEnd);
      for (const e of added) e.remove();
      for (const it of items) it.removeAttribute('data-hot');
      nav.removeAttribute('data-focus');
      delete root.dataset.concept;
    },
  };
}
