import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dir = __dirname.includes('homepage-next') ? __dirname : join(process.cwd(), 'frontend/src/components/homepage-next/ambient');
const pub = join(dir, '../../../../public/homepage/atelier');
const css = readFileSync(join(dir, 'StudioScene.module.css'), 'utf8');
const tsx = readFileSync(join(dir, 'StudioScene.tsx'), 'utf8');
const ambient = readFileSync(join(dir, 'Ambient.tsx'), 'utf8');
const ASSETS = ['s03a-left-base.webp', 's03a-left-light.webp', 's03a-left-mask.png', 's03a-right-base.webp', 's04a-fin-base.webp', 's04a-fin-light.webp', 's04a-fin-mask.png'];

describe('S03 atelier and S04 theater environments', () => {
  it('replaces only the S03 and S04 ambient layers', () => {
    assert.match(ambient, /kind === 's03' \|\| kind === 's04'\) return <StudioScene kind=\{kind\} \/>/);
    assert.match(ambient, /kind === 's02'\) return <S02Scene \/>/);
    assert.match(ambient, /<AmbientLayer kind=\{kind\} \/>/);
  });

  it('uses self-hosted, authored architecture: every referenced asset ships and is small', () => {
    for (const f of ASSETS) {
      assert.ok(existsSync(join(pub, f)), `${f} is missing`);
      assert.ok(statSync(join(pub, f)).size < 60_000, `${f} should stay small`);
      assert.match(tsx, new RegExp(f.replace('.', '\\.')));
    }
    assert.doesNotMatch(tsx, /https?:\/\//);
  });

  it('is imagery plus transform/opacity, not a pattern or a shader: no canvas, WebGL, repeating or noise textures', () => {
    assert.doesNotMatch(tsx, /canvas|webgl|getContext/i);
    assert.doesNotMatch(css, /feTurbulence|repeating-|conic-gradient|data:image/);
  });

  it('is built around the measured product rectangle and never intercepts input or layout', () => {
    for (const v of ['--cl', '--ct', '--cw', '--ch', '--hb']) assert.match(css, new RegExp(`${v}:`));
    assert.match(tsx, /getBoundingClientRect/);
    assert.match(css, /pointer-events: none/);
    assert.match(css, /contain: layout paint/);
    assert.match(tsx, /aria-hidden="true"/);
  });

  it('moves one highlight layer with transform and opacity only, pauses offscreen, and rests under reduced motion', () => {
    const frames = [...css.matchAll(/@keyframes\s+\w+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    assert.ok(frames.length >= 4);
    for (const f of frames) assert.doesNotMatch(f, /\b(left|top|width|height|background|box-shadow|filter)\s*:/);
    assert.match(css, /\.scene:not\(\[data-awake\]\) \*[\s\S]*animation-play-state: paused/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
    assert.match(tsx, /IntersectionObserver/);
    assert.match(css, /mix-blend-mode: screen/);
  });

  it('keeps the heading zone clean: architecture sits outside the content, below the heading', () => {
    assert.match(css, /\.s03 \.planeL \{[^}]*top: calc\(var\(--ct\) - 30px\)/);
    assert.match(css, /\.s04 \.finL,\s*\.s04 \.finR \{[^}]*top: calc\(var\(--ct\) - 10px\)/);
    assert.match(css, /\.s03 \.planeL \{[^}]*left: calc\(var\(--cl\) - 8px - 520px\)/);
    assert.match(css, /\.s03 \.planeR \{[^}]*left: calc\(var\(--cl\) \+ var\(--cw\) \+ 8px\)/);
  });
});
