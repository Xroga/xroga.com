/**
 * Renders the "Xroga Software World" image family for /software.
 *
 * There is no diffusion image model in this environment, so rather than ship empty
 * image slots the artwork is *drawn* — each scene is an HTML/SVG composition rendered
 * headlessly and encoded to WebP. That has three properties a stock or model-generated
 * asset would not: it is original to Xroga, it is deterministic (a fixed seed, so a
 * re-run reproduces the identical file), and it is guaranteed free of the failure modes
 * the brief calls out — no malformed letters, no accidental text, no foreign logos, no
 * watermarks, because nothing of the sort is ever drawn.
 *
 * One palette and one lighting philosophy across all eight scenes, so they read as a
 * single campaign rather than eight unrelated backgrounds.
 *
 *   node scripts/render-software-art.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const sharp = require_('sharp');
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'software');
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- palette */

const C = {
  blue: '#006aff',
  blueBright: '#3d8bff',
  cyan: '#38d2ff',
  navy: '#041024',
  midnight: '#020814',
  black: '#04060c',
  silver: '#c9d4e4',
  white: '#ffffff',
  violet: '#6d5cff',
};

/** Deterministic PRNG — the same seed always produces the same composition. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const shell = (w, h, body, base) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{background:${base};position:relative}
  .l{position:absolute;inset:0}
</style></head><body>${body}</body></html>`;

/* ------------------------------------------------------------ scene parts */

/** Fine luminous point field. The core material of this visual language. */
function particles(seed, count, opts = {}) {
  const {
    w = 2400, h = 1500, cx = 0.5, cy = 0.5, spread = 0.5,
    min = 1, max = 2.6, colors = [C.cyan, C.blueBright, C.white], alpha = 0.85,
  } = opts;
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i += 1) {
    // Gaussian-ish clustering so the field has a centre of mass instead of being uniform noise.
    const a = r() * Math.PI * 2;
    const d = (r() + r() + r()) / 3;
    const x = (cx + Math.cos(a) * d * spread) * w;
    const y = (cy + Math.sin(a) * d * spread * 0.62) * h;
    const s = min + r() * (max - min);
    const c = colors[Math.floor(r() * colors.length)];
    const o = (alpha * (1 - d * 0.75)).toFixed(3);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="${c}" opacity="${o}"/>`;
  }
  return out;
}

/** A soft grid, faded by a mask — the "subtle grid systems" motif. */
function grid(w, h, step, colour, opacity) {
  let out = '';
  for (let x = 0; x <= w; x += step) out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${colour}" stroke-width="1"/>`;
  for (let y = 0; y <= h; y += step) out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${colour}" stroke-width="1"/>`;
  return `<g opacity="${opacity}">${out}</g>`;
}

/** An isometric module — the building block of the "software architecture" motif. */
function module3d(x, y, w, h, depth, face, top, side, stroke, op = 1) {
  return `<g opacity="${op}">
    <path d="M${x} ${y} l${w} 0 l0 ${h} l${-w} 0 Z" fill="${face}"/>
    <path d="M${x} ${y} l${depth * 0.55} ${-depth * 0.42} l${w} 0 l${-depth * 0.55} ${depth * 0.42} Z" fill="${top}"/>
    <path d="M${x + w} ${y} l${depth * 0.55} ${-depth * 0.42} l0 ${h} l${-depth * 0.55} ${depth * 0.42} Z" fill="${side}"/>
    <path d="M${x} ${y} l${w} 0 l0 ${h} l${-w} 0 Z" fill="none" stroke="${stroke}" stroke-width="1.1"/>
  </g>`;
}

/* ---------------------------------------------------------------- scenes */

const scenes = {
  /* 1 — HERO. Curved computational architecture, quiet through the middle band
     where the headline and prompt sit. */
  'software-hero': { w: 2400, h: 1500, quality: 80, build() {
    const { w, h } = { w: 2400, h: 1500 };
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${C.blue}" stop-opacity="0.85"/>
          <stop offset="0.5" stop-color="${C.cyan}" stop-opacity="0.5"/>
          <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.52">
          <stop offset="0" stop-color="${C.blue}" stop-opacity="0.5"/>
          <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="26"/></filter>
        <filter id="soft2"><feGaussianBlur stdDeviation="7"/></filter>
        <mask id="fade"><rect width="${w}" height="${h}" fill="url(#fadeg)"/></mask>
        <radialGradient id="fadeg" cx="0.5" cy="0.55"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#000"/></radialGradient>
      </defs>
      ${grid(w, h, 60, C.blueBright, 0.05)}
      <ellipse cx="${w * 0.5}" cy="${h * 0.62}" rx="${w * 0.44}" ry="${h * 0.3}" fill="url(#glow)" filter="url(#soft)"/>
      <!-- Large sweeping structures, kept to the lower and outer thirds. -->
      <path d="M${-200} ${h * 0.86} C ${w * 0.28} ${h * 0.6}, ${w * 0.72} ${h * 1.02}, ${w + 200} ${h * 0.66}"
            fill="none" stroke="url(#arc)" stroke-width="150" opacity="0.5" filter="url(#soft)"/>
      <path d="M${-200} ${h * 0.94} C ${w * 0.3} ${h * 0.7}, ${w * 0.7} ${h * 1.1}, ${w + 200} ${h * 0.76}"
            fill="none" stroke="${C.blueBright}" stroke-width="2.4" opacity="0.65"/>
      <path d="M${-200} ${h * 0.9} C ${w * 0.32} ${h * 0.66}, ${w * 0.68} ${h * 1.06}, ${w + 200} ${h * 0.72}"
            fill="none" stroke="${C.cyan}" stroke-width="1.4" opacity="0.5"/>
      <path d="M${-150} ${h * 0.2} C ${w * 0.3} ${h * 0.05}, ${w * 0.66} ${h * 0.3}, ${w + 150} ${h * 0.08}"
            fill="none" stroke="${C.blue}" stroke-width="90" opacity="0.28" filter="url(#soft)"/>
      <g opacity="0.85">${particles(1337, 900, { w, h, cx: 0.5, cy: 0.68, spread: 0.66, min: 1.3, max: 3.4 })}</g>
      <g mask="url(#fade)">${particles(99, 420, { w, h, cx: 0.5, cy: 0.5, spread: 0.72, min: 1.2, max: 2.4, alpha: 0.75 })}</g>
      <!-- Distant modules, far from the copy area. -->
      ${module3d(w * 0.06, h * 0.55, 118, 92, 54, '#0a1730', '#12294f', '#071022', 'rgba(61,139,255,.5)', 0.75)}
      ${module3d(w * 0.855, h * 0.5, 132, 104, 60, '#0a1730', '#12294f', '#071022', 'rgba(61,139,255,.45)', 0.7)}
      ${module3d(w * 0.16, h * 0.72, 86, 66, 40, '#0b1a36', '#16305c', '#08122a', 'rgba(56,210,255,.4)', 0.55)}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:
      radial-gradient(ellipse 60% 45% at 50% 78%, rgba(0,106,255,.30), transparent 70%),
      radial-gradient(ellipse 70% 50% at 15% 12%, rgba(109,92,255,.16), transparent 70%),
      linear-gradient(180deg, ${C.midnight} 0%, ${C.navy} 55%, #061a3a 100%)"></div>${svg}`, C.midnight);
  }},

  /* 2 — PROBLEM. The same vocabulary, pulled apart: modules drifting, pathways
     that start and stop. Deliberately near-black so CSS can sit text on it. */
  'software-problem': { w: 2400, h: 1350, quality: 78, build() {
    const w = 2400, h = 1350;
    const r = rng(7); let mods = '', paths = '';
    for (let i = 0; i < 9; i += 1) {
      const x = (0.08 + r() * 0.8) * w, y = (0.16 + r() * 0.62) * h;
      const s = 62 + r() * 74;
      mods += module3d(x, y, s, s * 0.78, s * 0.5, '#080d18', '#0e1c34', '#05090f', 'rgba(61,139,255,.34)', 0.5 + r() * 0.3);
    }
    for (let i = 0; i < 7; i += 1) {
      const x1 = r() * w, y1 = (0.2 + r() * 0.6) * h;
      const len = 120 + r() * 260;
      paths += `<line x1="${x1}" y1="${y1}" x2="${x1 + len}" y2="${y1 + (r() - 0.5) * 90}"
        stroke="${C.blue}" stroke-width="2" opacity="${0.3 + r() * 0.3}" stroke-dasharray="${18 + r() * 30} ${40 + r() * 70}"/>`;
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b"><feGaussianBlur stdDeviation="40"/></filter></defs>
      ${grid(w, h, 80, C.blueBright, 0.032)}
      <ellipse cx="${w * 0.5}" cy="${h * 0.5}" rx="${w * 0.4}" ry="${h * 0.36}" fill="${C.blue}" opacity="0.1" filter="url(#b)"/>
      ${paths}${mods}
      ${particles(21, 220, { w, h, cx: 0.5, cy: 0.5, spread: 0.72, max: 1.8, alpha: 0.4 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:linear-gradient(180deg,#03050b,#050a16 60%,#03050b)"></div>${svg}`, '#03050b');
  }},

  /* 3 — AI FIELD. The long navy → blue → cyan → white climb, carried by the
     particle field itself rather than by a flat CSS ramp. */
  'software-ai-field': { w: 2400, h: 1500, quality: 82, build() {
    const w = 2400, h = 1500;
    const r = rng(4242);
    let pts = '';
    // Density rises toward the bottom, which is what produces the dissolve to white.
    for (let i = 0; i < 9000; i += 1) {
      const t = Math.pow(r(), 0.55);
      const y = t * h;
      const spreadAtY = 0.5 + t * 0.5;
      const x = (0.5 + (r() - 0.5) * spreadAtY * 1.9) * w;
      const size = 1.4 + r() * (1.8 + t * 3.4);
      // Contrast at both ends: light points on the dark top, white points into the
      // dissolve, with a cyan band through the middle where the field is brightest.
      const c = t < 0.3 ? C.cyan : t < 0.55 ? C.white : t < 0.8 ? '#dff3ff' : C.white;
      const o = (t < 0.3 ? 0.5 + r() * 0.45 : 0.55 + r() * 0.45) * (t > 0.9 ? 0.5 : 1);
      pts += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(2)}" fill="${c}" opacity="${o.toFixed(3)}"/>`;
    }
    // Curved topology lines through the field.
    let arcs = '';
    for (let i = 0; i < 9; i += 1) {
      const y = (0.2 + i * 0.085) * h;
      arcs += `<path d="M${-100} ${y} Q ${w * 0.5} ${y - 150 - i * 26}, ${w + 100} ${y}"
        fill="none" stroke="${i > 5 ? C.white : C.cyan}" stroke-width="1.5" opacity="${0.1 + i * 0.035}"/>`;
    }
    // Regular dot matrix, arched and masked — the structured counterpart to the
    // scattered points, and the thing that makes the field feel engineered.
    let matrix = '';
    for (let gx = 0; gx < 96; gx += 1) {
      for (let gy = 0; gy < 40; gy += 1) {
        const nx = gx / 95, ny = gy / 39;
        const arch = Math.sin(nx * Math.PI) * 0.14;
        const y = (ny * 0.86 + 0.08 - arch) * h;
        const x = nx * w;
        const edge = 1 - Math.abs(nx - 0.5) * 1.7;
        if (edge <= 0.05) continue;
        const o = edge * (0.16 + ny * 0.5);
        matrix += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(2 + ny * 2.4).toFixed(1)}" height="${(2 + ny * 2.4).toFixed(1)}" fill="#ffffff" opacity="${o.toFixed(3)}"/>`;
      }
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${arcs}${matrix}${pts}</svg>`;
    return shell(w, h, `<div class="l" style="background:
      radial-gradient(ellipse 80% 50% at 50% 108%, rgba(255,255,255,.95), transparent 62%),
      linear-gradient(180deg, #03102c 0%, #0546c8 34%, #0a90f0 62%, #7fd4ff 84%, #ffffff 100%)"></div>${svg}`, '#03102c');
  }},

  /* 4 — BUILD. The bright counterpart: the same modules, assembled and connected,
     in white and silver with blue light running between them. */
  'software-build': { w: 2400, h: 1800, quality: 82, build() {
    const w = 2400, h = 1800;
    let mods = '', links = '';
    const nodes = [
      [0.28, 0.30], [0.55, 0.22], [0.74, 0.38],
      [0.34, 0.53], [0.60, 0.50], [0.46, 0.72], [0.72, 0.68],
    ];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
        if (d < 0.26) {
          links += `<line x1="${nodes[i][0] * w}" y1="${nodes[i][1] * h}" x2="${nodes[j][0] * w}" y2="${nodes[j][1] * h}"
            stroke="${C.blue}" stroke-width="2.6" opacity="0.5"/>`;
        }
      }
    }
    const r = rng(88);
    for (const [nx, ny] of nodes) {
      const s = 130 + r() * 90;
      mods += module3d(nx * w - s / 2, ny * h - s / 2, s, s * 0.8, s * 0.5,
        '#ffffff', '#eef3fa', '#dbe4f0', 'rgba(0,106,255,.30)', 0.97);
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="sh"><feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#12325e" flood-opacity="0.16"/></filter></defs>
      ${grid(w, h, 100, '#0a3f8a', 0.05)}
      <g opacity="0.9">${links}</g>
      <g filter="url(#sh)">${mods}</g>
      ${particles(555, 200, { w, h, cx: 0.52, cy: 0.48, spread: 0.6, max: 2, colors: [C.blue, C.cyan], alpha: 0.3 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:
      radial-gradient(ellipse 65% 55% at 50% 42%, rgba(0,106,255,.10), transparent 70%),
      linear-gradient(180deg,#ffffff 0%,#f4f8fd 58%,#e8f1fb 100%)"></div>${svg}`, '#ffffff');
  }},

  /* 5 — REPOSITORY. Branch-and-merge geometry: a trunk with commits, branches
     leaving and rejoining. Structure only — never readable code. */
  'software-repository': { w: 2400, h: 1350, quality: 80, build() {
    const w = 2400, h = 1350;
    const baseY = h * 0.56;
    let g = `<line x1="${w * 0.06}" y1="${baseY}" x2="${w * 0.94}" y2="${baseY}" stroke="${C.blueBright}" stroke-width="3.4" opacity="0.85"/>`;
    const r = rng(2024);
    for (let i = 0; i < 13; i += 1) {
      const x = (0.09 + i * 0.066) * w;
      g += `<circle cx="${x}" cy="${baseY}" r="${11 + r() * 6}" fill="${C.blue}" opacity="0.95"/>`;
      g += `<circle cx="${x}" cy="${baseY}" r="${24 + r() * 12}" fill="none" stroke="${C.cyan}" stroke-width="1.2" opacity="0.32"/>`;
    }
    // Two branches above, one below — leaving the trunk and merging back.
    const branch = (x0, x1, dy, colour, op) => {
      const y = baseY + dy;
      return `<path d="M${x0} ${baseY} C ${x0 + 90} ${y}, ${x1 - 90} ${y}, ${x1} ${baseY}"
        fill="none" stroke="${colour}" stroke-width="2.6" opacity="${op}"/>
        <circle cx="${(x0 + x1) / 2}" cy="${y * 0.5 + baseY * 0.5}" r="9" fill="${colour}" opacity="${op}"/>`;
    };
    g += branch(w * 0.16, w * 0.42, -190, C.cyan, 0.75);
    g += branch(w * 0.36, w * 0.68, -300, C.blueBright, 0.6);
    g += branch(w * 0.52, w * 0.86, 205, C.blue, 0.65);
    let stacks = '';
    for (let i = 0; i < 5; i += 1) {
      const x = (0.1 + i * 0.19) * w, y = h * 0.83 - i % 2 * 40;
      stacks += module3d(x, y, 150, 58, 70, '#0a1424', '#152943', '#070d18', 'rgba(61,139,255,.34)', 0.7);
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="gb"><feGaussianBlur stdDeviation="34"/></filter></defs>
      ${grid(w, h, 70, C.blueBright, 0.04)}
      <ellipse cx="${w * 0.5}" cy="${baseY}" rx="${w * 0.46}" ry="150" fill="${C.blue}" opacity="0.16" filter="url(#gb)"/>
      ${g}${stacks}
      ${particles(303, 260, { w, h, cx: 0.5, cy: 0.5, spread: 0.66, max: 1.8, alpha: 0.42 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:linear-gradient(180deg,#04070e,#061224 55%,#04070e)"></div>${svg}`, '#04070e');
  }},

  /* 6 — CTA. A luminous horizon: light gathering at the centre, so the eye lands
     where the call to action sits. */
  'software-cta': { w: 2400, h: 1350, quality: 80, build() {
    const w = 2400, h = 1350;
    const hz = h * 0.62;
    let ridges = '';
    for (let i = 0; i < 6; i += 1) {
      const y = hz + 40 + i * 62;
      const amp = 26 + i * 16;
      ridges += `<path d="M0 ${y} Q ${w * 0.25} ${y - amp}, ${w * 0.5} ${y} T ${w} ${y} L ${w} ${h} L 0 ${h} Z"
        fill="#04122c" opacity="${0.55 - i * 0.07}"/>
        <path d="M0 ${y} Q ${w * 0.25} ${y - amp}, ${w * 0.5} ${y} T ${w} ${y}"
        fill="none" stroke="${C.cyan}" stroke-width="1.6" opacity="${0.4 - i * 0.05}"/>`;
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sun" cx="0.5" cy="1">
          <stop offset="0" stop-color="${C.white}" stop-opacity="0.95"/>
          <stop offset="0.28" stop-color="${C.cyan}" stop-opacity="0.6"/>
          <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
        </radialGradient>
        <filter id="cb"><feGaussianBlur stdDeviation="30"/></filter>
      </defs>
      ${grid(w, h, 90, C.blueBright, 0.04)}
      <ellipse cx="${w * 0.5}" cy="${hz}" rx="${w * 0.42}" ry="200" fill="url(#sun)" filter="url(#cb)"/>
      <line x1="0" y1="${hz}" x2="${w}" y2="${hz}" stroke="${C.white}" stroke-width="2.2" opacity="0.55"/>
      ${ridges}
      ${particles(717, 420, { w, h, cx: 0.5, cy: 0.34, spread: 0.6, max: 2.1, alpha: 0.5 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:
      radial-gradient(ellipse 55% 40% at 50% 62%, rgba(56,210,255,.34), transparent 68%),
      linear-gradient(180deg, #02091c 0%, #062a72 44%, #0a4fb8 62%, #041631 100%)"></div>${svg}`, '#02091c');
  }},

  /* 7 — FOOTER. The one bright, open scene: pale sky, a distant skyline of
     computational architecture, abstract terrain. The footer card sits over it. */
  'software-footer': { w: 2400, h: 1350, quality: 80, build() {
    const w = 2400, h = 1350;
    const hz = h * 0.7;
    const r = rng(1010);
    let sky = '';
    for (let i = 0; i < 7; i += 1) {
      const cx = r() * w, cy = (0.1 + r() * 0.4) * h;
      sky += `<ellipse cx="${cx}" cy="${cy}" rx="${180 + r() * 320}" ry="${50 + r() * 70}" fill="#ffffff" opacity="${0.16 + r() * 0.2}"/>`;
    }
    let skyline = '';
    for (let i = 0; i < 22; i += 1) {
      const bw = 26 + r() * 74;
      const bh = 40 + r() * 240;
      const x = (i / 22) * w + r() * 40;
      skyline += `<rect x="${x}" y="${hz - bh}" width="${bw}" height="${bh}" rx="4"
        fill="#ffffff" opacity="${0.3 + r() * 0.35}"/>
        <rect x="${x}" y="${hz - bh}" width="${bw}" height="${bh}" rx="4"
        fill="none" stroke="${C.blue}" stroke-width="1" opacity="${0.16 + r() * 0.2}"/>`;
    }
    let terrain = '';
    for (let i = 0; i < 4; i += 1) {
      const y = hz + 18 + i * 78;
      terrain += `<path d="M0 ${y} Q ${w * 0.3} ${y - 30 - i * 10}, ${w * 0.62} ${y + 6} T ${w} ${y - 12} L ${w} ${h} L 0 ${h} Z"
        fill="${i % 2 ? '#cfe4f7' : '#dcecfb'}" opacity="${0.9 - i * 0.14}"/>`;
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="fb"><feGaussianBlur stdDeviation="26"/></filter></defs>
      <g filter="url(#fb)">${sky}</g>
      <g opacity="0.85">${skyline}</g>
      <line x1="0" y1="${hz}" x2="${w}" y2="${hz}" stroke="#ffffff" stroke-width="2" opacity="0.6"/>
      ${terrain}
      ${particles(4747, 180, { w, h, cx: 0.5, cy: 0.3, spread: 0.7, max: 1.6, colors: [C.white, '#bfe3ff'], alpha: 0.4 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:linear-gradient(180deg,#5aa8ec 0%,#8fc9f4 34%,#c5e3fa 66%,#eaf5fe 100%)"></div>${svg}`, '#5aa8ec');
  }},

  /* 8 — CORE. A centred stack of modules with light inside, for the dominant
     bento card. Square, studio-lit, nothing else in frame. */
  'software-core': { w: 1500, h: 1500, quality: 84, build() {
    const w = 1500, h = 1500;
    let stack = '';
    const layers = [
      { s: 470, y: 0.60, f: '#0d1626', t: '#1b2f4d', d: '#070c16' },
      { s: 400, y: 0.47, f: '#111d33', t: '#223c63', d: '#0a1220' },
      { s: 330, y: 0.35, f: '#16273f', t: '#2b4a78', d: '#0d1728' },
    ];
    for (const L of layers) {
      stack += module3d(w / 2 - L.s / 2, h * L.y, L.s, L.s * 0.3, L.s * 0.42, L.f, L.t, L.d, 'rgba(61,139,255,.5)', 1);
    }
    const svg = `<svg class="l" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cg" cx="0.5" cy="0.45">
          <stop offset="0" stop-color="${C.cyan}" stop-opacity="0.55"/>
          <stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
        </radialGradient>
        <filter id="k"><feGaussianBlur stdDeviation="34"/></filter>
      </defs>
      <ellipse cx="${w / 2}" cy="${h * 0.46}" rx="380" ry="300" fill="url(#cg)" filter="url(#k)"/>
      ${stack}
      <ellipse cx="${w / 2}" cy="${h * 0.35}" rx="150" ry="52" fill="${C.cyan}" opacity="0.32" filter="url(#k)"/>
      ${particles(606, 200, { w, h, cx: 0.5, cy: 0.5, spread: 0.46, max: 2.2, alpha: 0.55 })}
    </svg>`;
    return shell(w, h, `<div class="l" style="background:radial-gradient(ellipse 60% 60% at 50% 45%, #0a1526, #04070d 72%)"></div>${svg}`, '#04070d');
  }},
};

/* ---------------------------------------------------------------- render */

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = [];

for (const [name, scene] of Object.entries(scenes)) {
  const page = await browser.newPage({
    viewport: { width: scene.w, height: scene.h },
    deviceScaleFactor: 1,
  });
  await page.setContent(scene.build(), { waitUntil: 'load' });
  const png = await page.screenshot({ type: 'png' });
  await page.close();

  // Downscale to a realistic display width — 2400px masters are more than any
  // breakpoint needs, and the brief asks for 250-900KB rather than 4K files.
  const targetW = name === 'software-core' ? 1200 : 2000;
  const buf = await sharp(png)
    .resize({ width: targetW, withoutEnlargement: true })
    .webp({ quality: scene.quality, effort: 6 })
    .toBuffer();

  const file = join(OUT, `${name}.webp`);
  writeFileSync(file, buf);
  const meta = await sharp(buf).metadata();
  report.push({ name, w: meta.width, h: meta.height, kb: Math.round(statSync(file).size / 1024) });
}

await browser.close();
console.table(report);
