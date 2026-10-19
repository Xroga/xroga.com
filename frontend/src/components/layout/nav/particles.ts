/**
 * Navigation V3 particle layer, modelled on frame-by-frame study of the Framer Particle Navbar reference and recoloured
 * to Xroga sapphire. One canvas behind the bar's content, drawn imperatively (no React state per frame).
 *
 * Rendering: every point is a crisp sprite of one to two CSS pixels placed on whole device pixels, composited normally.
 * There is no blur, no shadow and no additive glow, so points stay separate at 1x and 2x.
 *
 * - Rim: a ragged spray of fine points along the bar's outline. Density varies along the edge (clumps and short gaps),
 *   most points sit within a pixel of the edge and a few stray further in or out. A pointer near the edge pushes that
 *   stretch outward and makes its points flicker; a moving pointer knocks loose dust off the rim, which drifts toward it
 *   and fades. Only points near the pointer respond.
 * - Capsule: one formation of points with fixed identities. On first hover a loose cloud appears around the label and
 *   condenses into a ring; moving to another item, the formation's leading edge travels first and each point follows on
 *   its own spring, so the ring smears across and re-forms. With nothing hovered it holds briefly, then breaks into
 *   drifting dust and fades.
 * - CTA: its own ring, dim at rest, bright on hover, a short tightening on press.
 * The loop runs only while something moves or the pointer is near, and pauses when the page is hidden.
 * LogoOrbit (below) is a separate small canvas: a slowly turning shell of points around the Xroga orb.
 */

type Rect = { x: number; y: number; w: number; h: number };

const TAU = Math.PI * 2;
const PAD = 24; // the canvas extends this far beyond the bar on every side
const REACH = 46; // pointer influence radius on the rim, CSS px
const COL = 32; // column width for the static layer's dirty tracking, CSS px

/** point and outward normal at fraction u (0..1) along a stadium's perimeter */
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

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** roughly normal sample (sum of uniforms) in about -1..1 */
const gauss = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

/** tints: ice white cores, icy blue, electric sapphire, deep sapphire */
const TINTS = ['#eef5ff', '#b3cfff', '#6f9dff', '#3f6fe6'];
/** sprite size classes: fine (1 CSS px), small (about 1.5 CSS px), crystal (small with a one-device-pixel cross fringe) */
const SIZES = 3;

/** crisp point sprites at device resolution, indexed tint * SIZES + size */
function makeSprites(dpr: number) {
  const out: HTMLCanvasElement[] = [];
  const fine = Math.max(1, Math.round(dpr));
  const small = Math.max(2, Math.round(dpr * 1.5));
  for (const tint of TINTS) {
    for (let s = 0; s < SIZES; s++) {
      const core = s === 0 ? fine : small;
      const fringe = s === 2 ? 1 : 0;
      const c = document.createElement('canvas');
      c.width = c.height = core + fringe * 2;
      const g = c.getContext('2d')!;
      g.fillStyle = tint;
      g.fillRect(fringe, fringe, core, core);
      if (core >= 3) {
        // soften the square's corners so a 3 px point reads round
        g.clearRect(fringe, fringe, 1, 1);
        g.clearRect(fringe + core - 1, fringe, 1, 1);
        g.clearRect(fringe, fringe + core - 1, 1, 1);
        g.clearRect(fringe + core - 1, fringe + core - 1, 1, 1);
        g.globalAlpha = 0.5;
        g.fillRect(fringe, fringe, 1, 1);
        g.fillRect(fringe + core - 1, fringe, 1, 1);
        g.fillRect(fringe, fringe + core - 1, 1, 1);
        g.fillRect(fringe + core - 1, fringe + core - 1, 1, 1);
      }
      if (fringe) {
        g.globalAlpha = 0.32;
        g.fillRect(fringe, 0, core, 1);
        g.fillRect(fringe, core + 1, core, 1);
        g.fillRect(0, fringe, 1, core);
        g.fillRect(core + 1, fringe, 1, core);
      }
      out.push(c);
    }
  }
  return out;
}

type RimDot = {
  u: number; off: number; a: number; s: number; c: number; ph: number;
  hx: number; hy: number; nx: number; ny: number; // home and outward normal for the current size
  d: number; jx: number; jy: number; lit: number; // outward displacement, flicker offset, extra brightness
  col: number; // static-layer column of the home position
};
type CapDot = { u: number; off: number; a: number; s: number; c: number; ph: number; tau: number; cx: number; cy: number; x: number; y: number; vx: number; vy: number };
type RingDot = { u: number; off: number; a: number; s: number; c: number; ph: number };
type Dust = { x: number; y: number; vx: number; vy: number; age: number; life: number; a: number; s: number; c: number };
type Mote = { fx: number; fy: number; a: number; s: number; c: number };

export class NavParticles {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private sprites: HTMLCanvasElement[] = [];
  private fine = 1;
  private bar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cta: Rect | null = null;
  private rim: RimDot[] = [];
  private cap: CapDot[] = [];
  private ring: RingDot[] = [];
  private sparks: Mote[] = [];
  private motes: Mote[] = [];
  private dust: Dust[] = [];
  private rand = rng(97);
  // capsule formation: left/right edges and vertical extent, each eased toward its target
  private F = { L: 0, R: 0, T: 0, B: 0 };
  private tgt: { L: number; R: number; T: number; B: number } | null = null;
  private dir = 0;
  private mode: 'off' | 'on' | 'hold' | 'out' = 'off';
  private holdLeft = 0;
  private presence = 0;
  /** how far the formation's points still are from their places (px), so the light follows the points */
  private spread = 99;
  private ctaHot = 0;
  private ctaWant = 0;
  private pulse = 0;
  // pointer in canvas coordinates (null when away or not a mouse)
  private ptr: { x: number; y: number } | null = null;
  private ptrPrev: { x: number; y: number } | null = null;
  private inside = false;
  private enabled = true;
  private raf = 0;
  private last = 0;
  private t = 0;
  private hostRect: DOMRect | null = null;
  /**
   * Everything that is not moving (the rim at rest, the dust inside the bar, the CTA ring at rest) is drawn once into
   * this layer. Each frame copies it column by column and redraws individual points only in columns where something
   * is disturbed, so a pointer at one end of the bar costs a few hundred points, not several thousand.
   */
  private layer: HTMLCanvasElement | null = null;
  private rimByCol: number[][] = [];
  private motesByCol: number[][] = [];
  private dirty = new Uint8Array(0);
  private ctaDirty = false;
  /** the settled capsule, cached while it is not moving */
  private capLayer: HTMLCanvasElement | null = null;
  private capKey = '';
  private settled = false;
  /** the formation's slow drift along its ring advances only while it is not settled */
  private spinT = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private reduced = false,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(11);
    // rim: count follows perimeter in resize(); identities are fixed here (u, offset, brightness)
    const N = 2800;
    for (let i = 0; i < N; i++) {
      // density modulated along the edge: low-frequency clumps and short gaps
      let u = r();
      for (let k = 0; k < 4; k++) {
        const dens = 0.5 + 0.5 * Math.sin(u * TAU * 23 + 1.3) * Math.sin(u * TAU * 7.4 + 0.4);
        if (r() < 0.25 + 0.75 * dens) break;
        u = r();
      }
      const stray = r();
      const off = stray < 0.02 ? gauss(r) * 6 : stray < 0.11 ? gauss(r) * 2.6 : gauss(r) * 0.55;
      const bright = r() < 0.025;
      const a = bright ? 0.8 + r() * 0.2 : 0.2 + Math.pow(r(), 1.5) * 0.7;
      const c = bright ? (r() < 0.6 ? 0 : 1) : r() < 0.2 ? 0 : r() < 0.7 ? 1 : r() < 0.75 ? 2 : 3;
      this.rim.push({ u, off, a: Math.abs(off) > 2.5 ? a * 0.6 : a, s: bright ? (r() < 0.25 ? 2 : 1) : r() < 0.03 ? 1 : 0, c, ph: r() * TAU, hx: 0, hy: 0, nx: 0, ny: -1, d: 0, jx: 0, jy: 0, lit: 0, col: 0 });
    }
    // capsule: a band of points (most within a pixel of the ring, some strays), each with its own cloud slot and spring
    for (let i = 0; i < 900; i++) {
      const ang = r() * TAU;
      const rad = Math.sqrt(r());
      const stray = r();
      const bright = r() < 0.06;
      this.cap.push({
        u: r(),
        off: stray < 0.12 ? gauss(r) * 4.5 : gauss(r) * 1.7,
        a: bright ? 0.95 + r() * 0.05 : 0.45 + Math.pow(r(), 1.2) * 0.55,
        s: bright ? 2 : r() < 0.14 ? 1 : 0,
        c: bright ? 0 : r() < 0.4 ? 0 : r() < 0.75 ? 1 : 2,
        ph: r() * TAU,
        tau: 70 + Math.pow(r(), 1.5) * 190,
        cx: Math.cos(ang) * rad,
        cy: Math.sin(ang) * rad,
        x: 0, y: 0, vx: 0, vy: 0,
      });
    }
    for (let i = 0; i < 420; i++) {
      const bright = r() < 0.06;
      this.ring.push({ u: r(), off: r() < 0.1 ? gauss(r) * 3.5 : gauss(r) * 0.8, a: bright ? 0.9 : 0.3 + Math.pow(r(), 1.5) * 0.6, s: bright ? 2 : r() < 0.2 ? 1 : 0, c: bright ? 0 : r() < 0.5 ? 1 : 2, ph: r() * TAU });
    }
    this.cap.sort((a, b) => a.c - b.c);
    this.rim.sort((a, b) => a.c - b.c);
    // a few sparkles inside the lower part of the CTA, visible on hover
    for (let i = 0; i < 18; i++) this.sparks.push({ fx: 0.15 + r() * 0.75, fy: 0.55 + r() * 0.4, a: 0.3 + r() * 0.6, s: r() < 0.2 ? 1 : 0, c: r() < 0.5 ? 0 : 1 });
    // faint dust resting inside the bar
    for (let i = 0; i < 120; i++) this.motes.push({ fx: r(), fy: 0.12 + r() * 0.76, a: 0.05 + Math.pow(r(), 2) * 0.2, s: 0, c: r() < 0.5 ? 1 : 3 });
    this.onVis = this.onVis.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onLeave = this.onLeave.bind(this);
    document.addEventListener('visibilitychange', this.onVis);
    if (!reduced) {
      window.addEventListener('pointermove', this.onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', this.onLeave);
    }
    this.resize();
  }

  resize(cta?: HTMLElement | null) {
    const hb = this.host.getBoundingClientRect();
    this.hostRect = hb;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr || !this.sprites.length) {
      this.dpr = dpr;
      this.sprites = makeSprites(dpr);
      this.fine = Math.max(1, Math.round(dpr));
    }
    const W = hb.width + PAD * 2;
    const H = hb.height + PAD * 2;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.canvas.style.left = `${-PAD}px`;
    this.canvas.style.top = `${-PAD}px`;
    this.bar = { x: PAD, y: PAD, w: hb.width, h: hb.height };
    for (const d of this.rim) {
      const [x, y, nx, ny] = stadium(this.bar, d.u);
      d.hx = x + nx * d.off;
      d.hy = y + ny * d.off;
      d.nx = nx;
      d.ny = ny;
    }
    if (cta !== undefined) {
      if (cta) {
        const c = cta.getBoundingClientRect();
        this.cta = { x: c.left - hb.left + PAD, y: c.top - hb.top + PAD, w: c.width, h: c.height };
      } else this.cta = null;
    }
    this.layer = null;
    this.draw();
  }

  private moteX(m: Mote) {
    return this.bar.x + 14 + m.fx * (this.bar.w - 28);
  }

  private buildLayer() {
    const cols = Math.ceil(this.canvas.width / this.dpr / COL) + 1;
    const colOf = (x: number) => Math.max(0, Math.min(cols - 1, Math.floor(x / COL)));
    this.rimByCol = Array.from({ length: cols }, () => []);
    this.motesByCol = Array.from({ length: cols }, () => []);
    this.dirty = new Uint8Array(cols);
    this.rim.forEach((d, i) => {
      d.col = colOf(d.hx);
      this.rimByCol[d.col].push(i);
    });
    this.motes.forEach((m, i) => this.motesByCol[colOf(this.moteX(m))].push(i));
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const main = this.ctx;
    this.ctx = layer.getContext('2d')!;
    this.tint = -1;
    for (const m of this.motes) this.drawMote(m);
    for (const d of this.rim) this.drawRim(d, false);
    if (this.cta) this.drawRing(false, 0, 0);
    this.ctx = main;
    this.tint = -1;
    this.layer = layer;
  }

  private markCols(x0: number, x1: number) {
    const n = this.dirty.length;
    for (let i = Math.max(0, Math.floor(x0 / COL)); i <= Math.min(n - 1, Math.floor(x1 / COL)); i++) this.dirty[i] = 1;
  }

  /** the header hides on scroll: no pointer response while hidden */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.ptr = null;
    else this.hostRect = this.host.getBoundingClientRect();
    this.wake();
  }

  target(el: HTMLElement | null) {
    if (el) {
      const hb = this.host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const next = { L: r.left - hb.left + PAD - 3, R: r.right - hb.left + PAD + 3, T: r.top - hb.top + PAD - 1, B: r.bottom - hb.top + PAD + 1 };
      if (this.reduced) return;
      if (this.mode === 'off' || this.presence < 0.35) {
        // a fresh formation: a loose cloud around the label that condenses (from wherever any remaining dust is)
        const fresh = this.mode === 'off';
        this.F = { ...next };
        this.dir = 0;
        const sx = (next.R - next.L) * 0.75 + 22;
        const sy = (next.B - next.T) * 0.9 + 10;
        const cx = (next.L + next.R) / 2;
        const cy = (next.T + next.B) / 2;
        for (const d of this.cap) {
          if (fresh) {
            d.x = cx + d.cx * sx;
            d.y = cy + d.cy * sy;
          }
          d.vx = d.vy = 0;
        }
      } else {
        const mid = (next.L + next.R) / 2 - (this.tgt ? (this.tgt.L + this.tgt.R) / 2 : (this.F.L + this.F.R) / 2);
        this.dir = Math.sign(mid);
      }
      this.tgt = next;
      this.mode = 'on';
    } else if (this.mode === 'on') {
      this.mode = 'hold';
      this.holdLeft = this.inside ? 480 : 220;
    }
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
    window.removeEventListener('pointermove', this.onMove);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || !this.enabled) return;
    // cheap reject: the bar sits at the top of the window
    if (e.clientY > 160) {
      if (this.ptr) this.onLeave();
      return;
    }
    const hb = this.hostRect ?? (this.hostRect = this.host.getBoundingClientRect());
    const x = e.clientX - hb.left + PAD;
    const y = e.clientY - hb.top + PAD;
    const b = this.bar;
    const near = x > b.x - REACH && x < b.x + b.w + REACH && y > b.y - REACH && y < b.y + b.h + REACH;
    this.inside = x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
    if (!near) {
      if (this.ptr) this.onLeave();
      return;
    }
    this.ptr = { x, y };
    this.wake();
  }

  private onLeave() {
    this.ptr = null;
    this.inside = false;
    this.wake();
  }

  private onVis() {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.wake();
  }

  private wake() {
    if (this.raf || document.hidden || this.reduced) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private spawnDust(x: number, y: number, vx: number, vy: number, a: number, life: number) {
    if (this.dust.length > 320) this.dust.shift();
    const r = this.rand;
    this.dust.push({ x, y, vx, vy, age: 0, life, a, s: r() < 0.15 ? 1 : 0, c: r() < 0.35 ? 0 : r() < 0.7 ? 1 : 2 });
  }

  private frame(now: number) {
    const dt = Math.max(0, Math.min(40, now - this.last));
    this.last = now;
    this.t += dt;
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    const r = this.rand;
    let busy = false;

    /* capsule formation */
    if (this.mode === 'hold') {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) {
        this.mode = 'out';
        // break into dust: each point drifts outward from the ring's centre, a little toward the pointer
        const cx = (this.F.L + this.F.R) / 2;
        const cy = (this.F.T + this.F.B) / 2;
        for (const d of this.cap) {
          const dx = d.x - cx;
          const dy = d.y - cy;
          const m = Math.hypot(dx, dy) || 1;
          const sp = 0.012 + r() * 0.03;
          d.vx = (dx / m) * sp + (r() - 0.5) * 0.02 + (this.ptr ? Math.sign(this.ptr.x - cx) * 0.012 : 0);
          d.vy = (dy / m) * sp * 0.6 + (r() - 0.5) * 0.012;
        }
      }
    }
    if (this.mode === 'on' || this.mode === 'hold') {
      const tg = this.tgt!;
      const lead = k(60);
      const trail = k(this.dir === 0 ? 60 : 150);
      const prevL = this.F.L;
      const prevR = this.F.R;
      this.F.L += (tg.L - this.F.L) * (this.dir < 0 ? lead : trail);
      this.F.R += (tg.R - this.F.R) * (this.dir > 0 ? lead : trail);
      this.F.T += (tg.T - this.F.T) * k(80);
      this.F.B += (tg.B - this.F.B) * k(80);
      this.presence += (1 - this.presence) * k(110);
      const speed = (Math.abs(this.F.L - prevL) + Math.abs(this.F.R - prevR)) / Math.max(1, dt);
      const rect = { x: this.F.L, y: this.F.T, w: this.F.R - this.F.L, h: this.F.B - this.F.T };
      if (!this.settled) this.spinT += dt;
      const spin = this.spinT * 0.000015;
      const loosen = 1 + Math.min(3, speed * 1.4);
      let far = 0;
      for (const d of this.cap) {
        const [x, y, nx, ny] = stadium(rect, d.u + spin);
        const hx = x + nx * d.off * loosen;
        const hy = y + ny * d.off * loosen;
        const kk = k(d.tau);
        d.x += (hx - d.x) * kk;
        d.y += (hy - d.y) * kk;
        far = Math.max(far, Math.abs(hx - d.x) + Math.abs(hy - d.y));
      }
      this.spread = far;
      this.settled = this.mode === 'on' && far < 0.3 && Math.abs(tg.L - this.F.L) + Math.abs(tg.R - this.F.R) < 0.3 && this.presence > 0.99;
      busy = true;
      if (this.mode === 'on' && far < 0.3 && Math.abs(tg.L - this.F.L) + Math.abs(tg.R - this.F.R) < 0.3 && this.presence > 0.99 && !this.ptr) busy = false;
    } else if (this.mode === 'out') {
      const drag = Math.exp(-dt / 600);
      for (const d of this.cap) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vx *= drag;
        d.vy *= drag;
      }
      this.presence *= Math.exp(-dt / 230);
      if (this.presence < 0.015) {
        this.presence = 0;
        this.mode = 'off';
        this.tgt = null;
      }
      busy = true;
    }

    /* rim: pointer push, flicker, shed dust; a lift above the capsule and above a hovered CTA */
    const p = this.ptr;
    const moved = p && this.ptrPrev ? Math.hypot(p.x - this.ptrPrev.x, p.y - this.ptrPrev.y) : 0;
    this.ptrPrev = p ? { ...p } : null;
    const g = this.mode === 'off' ? 0 : this.presence;
    const ccx = (this.F.L + this.F.R) / 2;
    const span = (this.F.R - this.F.L) * 0.5 + 16;
    const ctaC = this.cta ? this.cta.x + this.cta.w / 2 : 0;
    const ctaSpan = this.cta ? this.cta.w * 0.5 + 12 : 1;
    let shed = p && this.inside ? moved * 0.18 : 0;
    if (!this.layer) this.buildLayer();
    this.dirty.fill(0);
    if (p) this.markCols(p.x - REACH - 8, p.x + REACH + 8);
    const relax = k(110);
    const settle = Math.exp(-dt / 170);
    for (const d of this.rim) {
      let want = 0;
      let heat = 0;
      if (p) {
        const dx = d.hx - p.x;
        const dy = d.hy - p.y;
        if (dx < REACH && dx > -REACH && dy < REACH && dy > -REACH) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REACH) {
            const w = (1 - dist / REACH) ** 2;
            want += 6 * w;
            heat = w;
            if (r() < 0.3 * w) {
              d.jx += (r() - 0.5) * 1.6 * w;
              d.jy += (r() - 0.5) * 1.6 * w;
            }
            if (shed > 0 && r() < 0.05 * w) {
              shed -= 1;
              const m = dist || 1;
              const sp = 0.02 + r() * 0.05;
              this.spawnDust(d.hx, d.hy, (-dx / m) * sp + (r() - 0.5) * 0.03, (-dy / m) * sp + (r() - 0.5) * 0.02, d.a * 0.9 + 0.15, 600 + r() * 900);
            }
          }
        }
      }
      if (d.ny < -0.2 || d.ny > 0.2) {
        if (g > 0.02) {
          const x = (d.hx - ccx) / span;
          if (x < 2.2 && x > -2.2) want += Math.exp(-x * x) * g * (d.ny < 0 ? 2.4 : 0.6);
        }
        if (this.ctaHot > 0.02) {
          const x = (d.hx - ctaC) / ctaSpan;
          if (x < 2.2 && x > -2.2) want += Math.exp(-x * x) * this.ctaHot * (d.ny < 0 ? 2 : 0.5);
        }
      }
      d.d += (want - d.d) * relax;
      d.lit += (heat - d.lit) * relax;
      d.jx *= settle;
      d.jy *= settle;
      if (d.d > 0.02 || d.lit > 0.01 || Math.abs(d.jx) + Math.abs(d.jy) > 0.02) {
        busy = true;
        this.dirty[d.col] = 1;
      }
    }
    if (p) busy = true;

    /* loose dust */
    if (this.dust.length) {
      const drag = Math.exp(-dt / 420);
      for (const m of this.dust) {
        m.age += dt;
        if (p && this.inside) {
          // a light pull toward the pointer so dust trails it
          m.vx += (p.x - m.x) * 0.0000025 * dt;
          m.vy += (p.y - m.y) * 0.000004 * dt;
        }
        m.vx *= drag;
        m.vy *= drag;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }
      this.dust = this.dust.filter((m) => m.age < m.life);
      busy = true;
    }

    /* CTA */
    this.ctaHot += (this.ctaWant - this.ctaHot) * k(140);
    this.pulse = Math.max(0, this.pulse - dt / 260);
    if (Math.abs(this.ctaWant - this.ctaHot) > 0.005 || this.pulse > 0 || this.ctaWant) busy = true;
    // the ring is redrawn whole whenever it animates or any of its columns is disturbed
    this.ctaDirty = false;
    if (this.cta) {
      const a = Math.max(0, Math.floor((this.cta.x - 18) / COL));
      const z = Math.min(this.dirty.length - 1, Math.floor((this.cta.x + this.cta.w + 18) / COL));
      let touched = this.ctaHot > 0.004 || this.pulse > 0;
      for (let i = a; i <= z && !touched; i++) if (this.dirty[i]) touched = true;
      if (touched) {
        this.ctaDirty = true;
        this.markCols(this.cta.x - 18, this.cta.x + this.cta.w + 18);
      }
    }

    this.draw();
    if (busy) this.raf = requestAnimationFrame((n) => this.frame(n));
    else {
      this.raf = 0;
      this.draw();
    }
  }

  private tint = -1;

  /** one point, snapped to whole device pixels; fine points are plain rectangles, larger ones sprites */
  private dot(x: number, y: number, s: number, c: number, a: number) {
    if (a <= 0.02) return;
    const ctx = this.ctx;
    ctx.globalAlpha = a > 1 ? 1 : a;
    if (s === 0) {
      if (this.tint !== c) {
        ctx.fillStyle = TINTS[c];
        this.tint = c;
      }
      const f = this.fine;
      ctx.fillRect(Math.round(x * this.dpr) - (f >> 1), Math.round(y * this.dpr) - (f >> 1), f, f);
      return;
    }
    const sp = this.sprites[c * SIZES + s];
    const h = sp.width >> 1;
    ctx.drawImage(sp, Math.round(x * this.dpr) - h, Math.round(y * this.dpr) - h);
  }

  private drawMote(m: Mote) {
    this.dot(this.moteX(m), this.bar.y + m.fy * this.bar.h, m.s, m.c, m.a);
  }

  private drawRim(d: RimDot, live: boolean) {
    const o = d.d;
    const fl = live && d.lit > 0.05 ? 0.75 + 0.25 * Math.sin(this.t * 0.02 + d.ph) : 1;
    this.dot(d.hx + d.nx * o + d.jx, d.hy + d.ny * o + d.jy, d.s, d.lit > 0.3 ? 0 : d.lit > 0.1 && d.c > 1 ? 1 : d.c, (d.a + d.lit * 0.8) * fl);
  }

  /** the CTA's ring; at rest (hot 0, no pulse) it is part of the static layer */
  private drawRing(live: boolean, hot: number, pulse: number) {
    const cta = this.cta!;
    const t = this.t;
    const pull = pulse * 1.6;
    const r = { x: cta.x - 2.5 + pull, y: cta.y - 2.5 + pull, w: cta.w + 5 - pull * 2, h: cta.h + 5 - pull * 2 };
    const level = 0.34 + 0.76 * hot + pulse * 0.3;
    const spin = t * 0.00002 * hot;
    for (const d of this.ring) {
      const [x, y, nx, ny] = stadium(r, d.u + spin);
      const o = d.off * (1 + hot * 0.5);
      const tw = live && hot > 0.05 ? 0.7 + 0.3 * Math.sin(t * 0.006 + d.ph) : 1;
      // the top and right of the ring catch more light, as in the reference
      const side = 0.75 + 0.25 * Math.max(-ny, nx, 0);
      this.dot(x + nx * o, y + ny * o, d.s, hot > 0.5 && d.c === 2 ? 1 : d.c, d.a * level * tw * side);
    }
    if (hot > 0.02) for (const m of this.sparks) this.dot(cta.x + m.fx * cta.w, cta.y + m.fy * cta.h, m.s, m.c, m.a * hot * 0.6 * (live ? 0.6 + 0.4 * Math.sin(t * 0.008 + m.fx * 9) : 1));
  }

  private draw() {
    const c = this.ctx;
    if (!this.layer) this.buildLayer();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.tint = -1;
    const live = this.raf !== 0;
    const t = this.t;

    // the static layer, copied in runs of undisturbed columns; when idle, all of it
    const n = this.dirty.length;
    const H = this.canvas.height;
    const W = this.canvas.width;
    for (let i = 0; i < n; ) {
      if (live && this.dirty[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && !(live && this.dirty[j])) j++;
      const x0 = Math.round(i * COL * this.dpr);
      const x1 = Math.min(W, Math.round(j * COL * this.dpr));
      if (x1 > x0) c.drawImage(this.layer!, x0, 0, x1 - x0, H, x0, 0, x1 - x0, H);
      i = j;
    }
    // individual points in the disturbed columns
    if (live) {
      for (let i = 0; i < n; i++) {
        if (!this.dirty[i]) continue;
        for (const k of this.motesByCol[i]) this.drawMote(this.motes[k]);
        for (const k of this.rimByCol[i]) this.drawRim(this.rim[k], true);
      }
      if (this.ctaDirty) this.drawRing(true, this.ctaHot, this.pulse);
    }

    // capsule
    const g = this.presence;
    if (this.mode !== 'off' && g > 0.01) {
      // a restrained wash of light around the ring, kept well below the points themselves
      if (this.mode !== 'out') {
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        c.globalCompositeOperation = 'lighter';
        c.beginPath();
        const h = this.F.B - this.F.T;
        c.roundRect(this.F.L, this.F.T, this.F.R - this.F.L, h, h / 2);
        // two soft passes: a wide faint one and a narrower one along the ring itself
        c.strokeStyle = '#4a7dff';
        c.lineWidth = 9;
        const formed = Math.max(0, 1 - this.spread / 14);
        c.globalAlpha = 0.045 * g * g * formed;
        c.stroke();
        c.lineWidth = 4;
        c.globalAlpha = 0.075 * g * g * formed;
        c.stroke();
        c.globalCompositeOperation = 'source-over';
        c.setTransform(1, 0, 0, 1, 0, 0);
      }
      const fade = this.mode === 'out' ? g : Math.min(1, g * 1.4);
      if (this.settled && this.mode === 'on') {
        // settled: draw the formation once, then copy it
        const key = `${this.tgt!.L},${this.tgt!.R}`;
        if (!this.capLayer || this.capKey !== key) {
          const L = this.capLayer ?? document.createElement('canvas');
          L.width = this.canvas.width;
          L.height = this.canvas.height;
          const main = this.ctx;
          this.ctx = L.getContext('2d')!;
          this.tint = -1;
          for (const d of this.cap) this.dot(d.x, d.y, d.s, d.c, d.a);
          this.ctx = main;
          this.tint = -1;
          this.capLayer = L;
          this.capKey = key;
        }
        const x0 = Math.max(0, Math.floor((this.F.L - 14) * this.dpr));
        const x1 = Math.min(this.canvas.width, Math.ceil((this.F.R + 14) * this.dpr));
        c.globalAlpha = 1;
        c.drawImage(this.capLayer, x0, 0, x1 - x0, this.canvas.height, x0, 0, x1 - x0, this.canvas.height);
      } else {
        this.capKey = '';
        for (const d of this.cap) {
          const tw = live ? 0.78 + 0.22 * Math.sin(t * 0.005 + d.ph) : 1;
          this.dot(d.x, d.y, d.s, d.c, d.a * fade * tw);
        }
      }
    }

    // loose dust
    for (const m of this.dust) {
      const f = m.age / m.life;
      this.dot(m.x, m.y, m.s, m.c, m.a * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85));
    }
    c.globalAlpha = 1;
  }
}

/**
 * A slowly turning shell of points around the Xroga orb. Points sit on a sphere just larger than the orb and are shown
 * only near its silhouette, so they circle the mark without covering it; points on the far side pass behind it.
 * About one turn every 11 s, faster and a little wider while the pointer is on the logo. Runs at most 30 frames a
 * second, only while the header is visible and the page is shown; reduced motion draws one still frame.
 */
export class LogoOrbit {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private sprites: HTMLCanvasElement[] = [];
  private pts: { x: number; y: number; z: number; a: number; s: number; c: number }[] = [];
  private size = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private angle = 0.6;
  private hot = 0;
  private want = 0;
  private enabled = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private reduced = false,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(5);
    const N = 150;
    for (let i = 0; i < N; i++) {
      // a Fibonacci sphere, lightly jittered
      const y = 1 - ((i + 0.5) / N) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = i * 2.399963 + r() * 0.2;
      const bright = r() < 0.12;
      this.pts.push({ x: Math.cos(th) * rad, y, z: Math.sin(th) * rad, a: bright ? 0.95 : 0.4 + r() * 0.5, s: bright ? 2 : r() < 0.3 ? 1 : 0, c: bright ? 0 : r() < 0.5 ? 1 : 2 });
    }
    this.onVis = this.onVis.bind(this);
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr || !this.sprites.length) {
      this.dpr = dpr;
      this.sprites = makeSprites(dpr);
    }
    this.size = box.width;
    this.canvas.width = Math.round(box.width * dpr);
    this.canvas.height = Math.round(box.height * dpr);
    this.draw();
    this.wake();
  }

  hover(on: boolean) {
    this.want = on ? 1 : 0;
    this.wake();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.wake();
    else {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
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
    if (this.raf || document.hidden || this.reduced || !this.enabled) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private frame(now: number) {
    const dt = Math.max(0, Math.min(60, now - this.last));
    this.last = now;
    this.acc += dt;
    this.raf = requestAnimationFrame((n) => this.frame(n));
    if (this.acc < 31) return; // about 30 fps is plenty for a slow orbit
    const step = this.acc;
    this.acc = 0;
    this.hot += (this.want - this.hot) * (1 - Math.exp(-step / 160));
    this.angle += step * (TAU / 11000) * (1 + this.hot * 1.6);
    this.draw();
  }

  private draw() {
    const c = this.ctx;
    const S = this.size;
    if (!S) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cx = S / 2;
    const cy = S / 2;
    const core = S * 0.335; // the orb's radius within this square
    const R = S * (0.42 + this.hot * 0.03);
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    const tilt = 0.42;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (const p of this.pts) {
      // spin about the vertical axis, then tilt toward the viewer
      const x = p.x * ca + p.z * sa;
      const z0 = -p.x * sa + p.z * ca;
      const y = p.y * ct - z0 * st;
      const z = p.y * st + z0 * ct;
      const px = cx + x * R;
      const py = cy + y * R;
      const pr = Math.hypot(px - cx, py - cy);
      // only near the silhouette: inside the orb's disc a point is either behind it or would cover the mark
      if (pr < core * 1.04) continue;
      const limb = Math.min(1, (pr - core) / (R - core));
      const depth = z > 0 ? 1 : 0.45;
      const a = p.a * depth * (0.45 + 0.55 * limb) * (0.85 + this.hot * 0.4);
      if (a <= 0.03) continue;
      const sp = this.sprites[p.c * SIZES + (z > 0 ? p.s : 0)];
      const h = sp.width >> 1;
      c.globalAlpha = a > 1 ? 1 : a;
      c.drawImage(sp, Math.round(px * this.dpr) - h, Math.round(py * this.dpr) - h);
    }
    c.globalAlpha = 1;
  }
}
