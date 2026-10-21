import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dir = __dirname.includes('homepage-next') ? __dirname : join(process.cwd(), 'frontend/src/components/homepage-next/ambient');
const css = readFileSync(join(dir, 'StudioScene.module.css'), 'utf8');
const tsx = readFileSync(join(dir, 'StudioScene.tsx'), 'utf8');
const ambient = readFileSync(join(dir, 'Ambient.tsx'), 'utf8');

describe('S03 / S04 product-led environments', () => {
  it('replaces only the S03 and S04 ambient layers', () => {
    assert.match(ambient, /kind === 's03' \|\| kind === 's04'\) return <StudioScene kind=\{kind\} \/>/);
    assert.match(ambient, /kind === 's02'\) return <S02Scene \/>/);
    assert.match(ambient, /<AmbientLayer kind=\{kind\} \/>/);
  });

  it('adds no new object: one support field derived from the product rectangle, no imagery, canvas, pattern or colour', () => {
    assert.doesNotMatch(tsx, /canvas|webgl|getContext|<img|url\(/i);
    assert.doesNotMatch(css, /url\(|feTurbulence|repeating-|conic-gradient|data:image|blur\(/);
    for (const v of ['--cl', '--ct', '--cw', '--ch']) assert.match(css, new RegExp(`${v}:`));
    assert.match(tsx, /getBoundingClientRect/);
    for (const m of css.matchAll(/rgba\((\d+), (\d+), (\d+),/g)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 40, `rgba(${r}, ${g}, ${b}) is not neutral`);
    }
  });

  it('never intercepts input or layout and sits behind the content', () => {
    assert.match(css, /pointer-events: none/);
    assert.match(css, /contain: layout paint/);
    assert.match(css, /z-index: 0/);
    assert.match(tsx, /aria-hidden="true"/);
  });

  it('keeps the heading clear: the field starts at the product, not the heading', () => {
    assert.match(css, /\.field \{[^}]*top: calc\(var\(--ct\) - var\(--inset\)\)/);
    assert.match(tsx, /c\.tagName !== 'HEADER'/);
  });

  it('has no continuous animation: motion answers a real mode change (S03), a first view or a state change (S04)', () => {
    assert.doesNotMatch(css, /animation:[^;]*infinite/);
    assert.match(tsx, /dataset\.view/);
    assert.match(tsx, /aria-selected/);
    assert.match(tsx, /IntersectionObserver/);
    const frames = [...css.matchAll(/@keyframes\s+\w+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    assert.equal(frames.length, 1);
    for (const f of frames) assert.doesNotMatch(f, /\b(left|top|width|height|background|box-shadow|filter)\s*:/);
  });

  it('is complete without motion under reduced motion', () => {
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*transition: none/);
  });
});
