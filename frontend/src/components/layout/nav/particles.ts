/**
 * Navigation V2 particle layer: one small canvas over the floating bar, drawn imperatively (no React state per frame).
 *
 * - Rim: a quiet, broken line of light points tracing the bar's outline. Drawn once at rest; nothing animates idle.
 * - Capsule: one object. On hover a loose cloud of points gathers into a stadium ring around the hovered item; moving
 *   to another item, the same ring glides and resizes to it (exponential smoothing on centre and size); leaving, the
 *   ring loosens back into a cloud and fades. A faint fill sits inside the ring so the active label reads as lit.
 * - CTA: its own thin ring of points that brightens on hover and gives one short outward pulse on press.
 * The loop runs only while something is moving or hovered, stops when everything settles, and pauses when the page is
 * hidden. Reduced motion never starts it (the static rim is drawn and CSS shows the active item).
 */

type Rect = { x: number; y: number; w: number; h: number };

const TAU = Math.PI * 2;
const PAD = 12; // canvas extends this far beyond the bar on every side

/** a point and its outward normal at fraction u (0..1) along a stadium's perimeter, clockwise from the top-left */
function stadium(r: Rect, u: number): [number, number, number, number] {
  const rad = Math.min(r.h / 2, r.w / 2);
  const flat = Math.max(0, r.w - 2 * rad);
  const arc = Math.PI * rad;
  const total = 2 * flat + 2 * arc;
  let s = (((u % 1) + 1) % 1) * total;
  if (s < flat) return [r.x + rad + s, r.y, 0, -1];
  s -= flat;
  if (s < arc) {
    const a = -Math.PI / 2 + (s / arc) * Math.PI;
    return [r.x + r.w - rad + Math.cos(a) * rad, r.y + rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)];
  }
  s -= arc;
  if (s < flat) return [r.x + r.w - rad - s, r.y + r.h, 0, 1];
  s -= flat;
  const a = Math.PI / 2 + (s / arc) * Math.PI;
  return [r.x + rad + Math.cos(a) * rad, r.y + rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)];
}

/** deterministic pseudo-random, so the rim and cloud look the same on every load */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Dot = { u: number; off: number; dx: number; dy: number; a: number; ph: number; sz: number };

export class NavParticles {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private bar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cta: Rect | null = null;
  private rim: Dot[] = [];
  private cap: Dot[] = [];
  private ring: Dot[] = [];
  // capsule state (canvas px): current and target centre/size, gather 0..1
  private cur = { cx: 0, cy: 0, w: 0, h: 0 };
  private tgt: { cx: number; cy: number; w: number; h: number } | null = null;
  private gather = 0;
  private ctaHot = 0;
  private ctaWant = 0;
  private pulse = 0;
  private raf = 0;
  private last = 0;
  private t = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(7);
    for (let i = 0; i < 230; i++) this.rim.push({ u: i / 230 + r() * 0.002, off: (r() - 0.5) * 1.6, dx: 0, dy: 0, a: r() < 0.32 ? 0 : 0.14 + r() * 0.36, ph: r() * TAU, sz: 0.55 + r() * 0.6 });
    for (let i = 0; i < 128; i++) {
      const ang = r() * TAU;
      const d = 10 + r() * 22;
      this.cap.push({ u: i / 128 + r() * 0.004, off: (r() - 0.5) * 2.4, dx: Math.cos(ang) * d * 1.6, dy: Math.sin(ang) * d * 0.7, a: 0.45 + r() * 0.55, ph: r() * TAU, sz: 0.6 + r() * 0.75 });
    }
    for (let i = 0; i < 90; i++) this.ring.push({ u: i / 90 + r() * 0.004, off: (r() - 0.5) * 1.4, dx: 0, dy: 0, a: 0.3 + r() * 0.5, ph: r() * TAU, sz: 0.55 + r() * 0.55 });
    this.onVis = this.onVis.bind(this);
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
  }

  /** re-measure the bar and CTA (call on resize and after layout changes) */
  resize(cta?: HTMLElement | null) {
    const hb = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = hb.width + PAD * 2;
    const H = hb.height + PAD * 2;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.bar = { x: PAD + 0.5, y: PAD + 0.5, w: hb.width - 1, h: hb.height - 1 };
    if (cta !== undefined) {
      if (cta) {
        const c = cta.getBoundingClientRect();
        this.cta = { x: c.left - hb.left + PAD - 3, y: c.top - hb.top + PAD - 3, w: c.width + 6, h: c.height + 6 };
      } else this.cta = null;
    }
    this.draw();
  }

  /** the item the capsule should surround (viewport rect), or null to dissolve it */
  target(el: HTMLElement | null) {
    if (el) {
      const hb = this.host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const next = { cx: r.left - hb.left + PAD + r.width / 2, cy: r.top - hb.top + PAD + r.height / 2, w: r.width + 8, h: r.height + 2 };
      // a fresh capsule forms in place; an existing one glides to the new item
      if (this.gather < 0.05) this.cur = { ...next };
      this.tgt = next;
    } else this.tgt = null;
    this.wake();
  }

  ctaHover(on: boolean) {
    this.ctaWant = on ? 1 : 0;
    this.wake();
  }

  ctaPress() {
    this.pulse = 1;
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener('visibilitychange', this.onVis);
  }

  private onVis() {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.wake();
  }

  private wake() {
    if (this.raf || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private frame(now: number) {
    const dt = Math.min(48, now - this.last);
    this.last = now;
    this.t += dt;
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    // capsule: glide centre and size toward the target; gather in (fast) or loosen out (a little slower)
    if (this.tgt) {
      const s = k(70);
      this.cur.cx += (this.tgt.cx - this.cur.cx) * s;
      this.cur.cy += (this.tgt.cy - this.cur.cy) * s;
      this.cur.w += (this.tgt.w - this.cur.w) * s;
      this.cur.h += (this.tgt.h - this.cur.h) * s;
    }
    this.gather += ((this.tgt ? 1 : 0) - this.gather) * k(this.tgt ? 120 : 170);
    this.ctaHot += (this.ctaWant - this.ctaHot) * k(120);
    this.pulse = Math.max(0, this.pulse - dt / 520);
    this.draw();
    const moving =
      (this.tgt && (Math.abs(this.tgt.cx - this.cur.cx) > 0.3 || Math.abs(this.tgt.w - this.cur.w) > 0.3)) ||
      Math.abs((this.tgt ? 1 : 0) - this.gather) > 0.01 ||
      Math.abs(this.ctaWant - this.ctaHot) > 0.01 ||
      this.pulse > 0;
    // keep shimmering while an item or the CTA is held; otherwise stop once everything has settled
    if (moving || this.tgt || this.ctaWant) this.raf = requestAnimationFrame((n) => this.frame(n));
    else {
      this.raf = 0;
      this.gather = this.tgt ? 1 : 0;
      this.draw();
    }
  }

  private dot(x: number, y: number, size: number, alpha: number, cool: boolean) {
    if (alpha <= 0.01) return;
    const c = this.ctx;
    c.globalAlpha = Math.min(1, alpha);
    c.fillStyle = cool ? '#b9cdff' : '#eef3ff';
    c.beginPath();
    c.arc(x, y, size, 0, TAU);
    c.fill();
  }

  private draw() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const tw = (ph: number, speed = 0.0016) => 0.72 + 0.28 * Math.sin(this.t * speed + ph);
    const live = this.raf !== 0;
    // rim of the bar
    for (const d of this.rim) {
      if (!d.a) continue;
      const [x, y, nx, ny] = stadium(this.bar, d.u);
      this.dot(x + nx * d.off, y + ny * d.off, d.sz * 0.85, d.a * (live ? tw(d.ph, 0.0011) : 0.86), d.u % 0.2 < 0.1);
    }
    // CTA ring
    if (this.cta) {
      const glow = 0.22 + 0.78 * this.ctaHot;
      const grow = this.pulse * 7;
      const r = { x: this.cta.x - grow, y: this.cta.y - grow, w: this.cta.w + grow * 2, h: this.cta.h + grow * 2 };
      for (const d of this.ring) {
        const [x, y, nx, ny] = stadium(r, d.u + this.t * 0.000035 * this.ctaHot);
        this.dot(x + nx * d.off, y + ny * d.off, d.sz, d.a * glow * (live ? tw(d.ph, 0.003) : 1) * (1 - this.pulse * 0.4), true);
      }
    }
    // the capsule
    const g = this.gather;
    if (g > 0.01) {
      const r = { x: this.cur.cx - this.cur.w / 2, y: this.cur.cy - this.cur.h / 2, w: this.cur.w, h: this.cur.h };
      // faint lit fill, so the active label reads as illuminated rather than outlined
      const rad = r.h / 2;
      c.globalAlpha = 0.16 * g;
      const grd = c.createLinearGradient(0, r.y, 0, r.y + r.h);
      grd.addColorStop(0, '#9fb9ff');
      grd.addColorStop(1, '#4d74e8');
      c.fillStyle = grd;
      c.beginPath();
      c.roundRect(r.x, r.y, r.w, r.h, rad);
      c.fill();
      const loose = 1 - g;
      for (const d of this.cap) {
        const [x, y, nx, ny] = stadium(r, d.u + this.t * 0.00002);
        const px = x + nx * d.off + d.dx * loose * 1.4;
        const py = y + ny * d.off + d.dy * loose * 1.4;
        this.dot(px, py, d.sz, d.a * Math.pow(g, 0.7) * tw(d.ph, 0.0035), d.u % 0.25 < 0.08);
      }
    }
    c.globalAlpha = 1;
  }
}
