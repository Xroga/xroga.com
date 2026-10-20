import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dir = __dirname.includes('homepage-next') ? __dirname : join(process.cwd(), 'frontend/src/components/homepage-next/ambient');
const css = readFileSync(join(dir, 'S02Scene.module.css'), 'utf8');
const tsx = readFileSync(join(dir, 'S02Scene.tsx'), 'utf8');
const ambient = readFileSync(join(dir, 'Ambient.tsx'), 'utf8');

describe('S02 studio environment', () => {
  it('replaces the S02 ambient layer and leaves the other environments alone', () => {
    assert.match(ambient, /kind === 's02' \? <S02Scene \/>/);
    assert.match(ambient, /<AmbientLayer kind=\{kind\} \/>/);
  });

  it('is a lit room, not a pattern: no canvas, no WebGL, no repeating or noise textures', () => {
    assert.doesNotMatch(tsx, /canvas|webgl|getContext/i);
    assert.doesNotMatch(css, /feTurbulence|repeating-|conic-gradient|data:image/);
  });

  it('is built around the measured computer rectangle and never intercepts input or layout', () => {
    for (const v of ['--cl', '--ct', '--cw', '--ch']) assert.match(css, new RegExp(`${v}:`));
    assert.match(tsx, /#s02-stage/);
    assert.match(css, /pointer-events: none/);
    assert.match(css, /contain: layout paint/);
  });

  it('animates only transform and opacity, pauses offscreen, and rests under reduced motion', () => {
    const frames = [...css.matchAll(/@keyframes\s+\w+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    assert.ok(frames.length >= 4);
    for (const f of frames) assert.doesNotMatch(f, /\b(left|top|width|height|background|box-shadow|filter)\s*:/);
    assert.match(css, /\.scene:not\(\[data-awake\]\) \*[\s\S]*animation-play-state: paused/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
    assert.match(tsx, /IntersectionObserver/);
  });

  it('keeps the heading zone quiet and the palette neutral', () => {
    assert.match(css, /\.vignette[\s\S]*calc\(var\(--ct\) - 30px\)/);
    for (const m of css.matchAll(/rgba\((\d+), (\d+), (\d+),/g)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 40, `rgba(${r}, ${g}, ${b}) is not neutral`);
    }
  });
});
