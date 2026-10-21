import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dir = __dirname.includes('homepage-next') ? __dirname : join(process.cwd(), 'frontend/src/components/homepage-next/backdrop');
const tsx = readFileSync(join(dir, 'SharedDotBackdrop.tsx'), 'utf8');
const css = readFileSync(join(dir, 'SharedDotBackdrop.module.css'), 'utf8');
const page = readFileSync(join(dir, '../../homepage/HomepageClient.tsx'), 'utf8');

describe('one shared S01–S05 background', () => {
  it('is mounted once, as the first child of one wrapper that holds exactly S01–S05 (hero and closing outside)', () => {
    const wrap = page.slice(page.indexOf('<div className="xv-unified-sections">'), page.indexOf('<div className="xv-horizon"'));
    assert.equal(page.split('<SharedDotBackdrop />').length - 1, 1);
    assert.ok(wrap.indexOf('<SharedDotBackdrop />') < wrap.indexOf('<S01CapabilityDeck />'));
    for (const c of ['<S01CapabilityDeck />', '<S02Work', '<S03Growth', '<S04Publish', '<S05Capabilities />']) assert.ok(wrap.includes(c), c);
    assert.ok(!wrap.includes('<S00Hero'));
    assert.ok(page.indexOf('<S00Hero />') < page.indexOf('xv-unified-sections'));
  });

  it('is a fixed 25px neutral dot grid on near-black: no canvas, images, colour or autonomous animation', () => {
    assert.match(css, /--pitch: 25px;/);
    assert.match(css, /background-color: #050607;/);
    assert.doesNotMatch(tsx, /<canvas|getContext\(|<img/);
    assert.doesNotMatch(css, /url\(|@keyframes|animation:/);
    for (const m of css.matchAll(/rgba\((\d+), (\d+), (\d+),/g)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 14, `rgba(${r}, ${g}, ${b}) is not neutral`);
    }
  });

  it('brightens dots in place: the highlight tile is phase-locked to the base grid and only moves by transform', () => {
    assert.match(tsx, /--phase-x/);
    assert.match(css, /background-position: var\(--phase-x\) var\(--phase-y\);/);
    assert.match(css, /transform: translate3d\(var\(--spot-x\), var\(--spot-y\), 0\);/);
    assert.match(tsx, /const PITCH = 25;/);
  });

  it('never intercepts input, runs no loop at rest, and stays still on touch, narrow screens and reduced motion', () => {
    assert.match(css, /pointer-events: none;/);
    assert.match(tsx, /passive: true/);
    assert.match(tsx, /if \(Math\.abs\(px - cx\) > 0\.4 \|\| Math\.abs\(py - cy\) > 0\.4\) raf = requestAnimationFrame\(frame\);/);
    assert.match(tsx, /e\.pointerType !== 'mouse'/);
    assert.match(css, /@media \(max-width: 768px\), \(hover: none\), \(pointer: coarse\)[\s\S]*?\.spot \{\s*display: none;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.spot \{\s*display: none;/);
    assert.match(tsx, /removeEventListener\('pointermove'/);
    assert.match(tsx, /cancelAnimationFrame/);
  });

  it('replaces the per-section backgrounds instead of stacking on them', () => {
    const read = (p: string) => readFileSync(join(dir, p), 'utf8');
    for (const p of ['../s02/S02Work.tsx', '../s03/S03Growth.tsx', '../s04/S04Publish.tsx']) assert.doesNotMatch(read(p), /<Ambient /);
    assert.doesNotMatch(read('../s01/S01CapabilityDeck.tsx'), /s\.particles/);
    assert.match(read('../s02/S02.module.css'), /background-color: transparent;/);
    assert.match(read('../s03/S03.module.css'), /background-color: transparent !important;/);
    assert.match(read('../s04/S04.module.css'), /background-color: transparent !important;/);
    assert.match(read('../s05/S05.css'), /background-color: transparent !important;/);
    // the closing horizon keeps its own ambient layer
    assert.match(page, /<Ambient kind="horizon" \/>/);
  });
});
