import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { equationToLatex } from './equationToLatex';

/**
 * Guards for keeping the maths typesetter out of the first load.
 *
 * KaTeX is ~256 kB of JavaScript and a 23 kB stylesheet, and a coding agent renders an
 * equation in a small minority of replies. A static import put the library in the first
 * load of `/workspace` — the app's largest route — and an `@import` in globals.css put
 * the stylesheet on every page of the site, marketing pages included.
 *
 * Measured across a production build before and after: `/workspace` 382 kB → 306 kB and
 * `/dashboard/projects/[id]` 397 kB → 322 kB of first-load JS, every other route within
 * 1 kB, and the KaTeX stylesheet no longer linked by `/`, `/crypto`, `/pricing`,
 * `/auth/login` or `/terms`. Rendering was checked in a browser afterwards: a real
 * `.mfrac` is typeset and the KaTeX font family applies, so the split did not quietly
 * leave the plain-text fallback on screen.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const WRAPPER = read('./mathRender.tsx');
const IMPL = read('./mathRenderImpl.tsx');
const HELPER = read('./equationToLatex.ts');
const CSS = read('../app/globals.css');

test('the wrapper never reaches the typesetter directly', () => {
  // A static import here is the whole bug: it lands KaTeX in the first load of every
  // route that renders a reply.
  assert.ok(!/^import katex/m.test(WRAPPER), 'katex is imported statically again');
  assert.ok(!/katex\/dist/.test(WRAPPER), 'the katex stylesheet is back in the first load');
  assert.match(WRAPPER, /lazy\(\(\) => import\('\.\/mathRenderImpl'\)\)/, 'the impl must be lazy');
});

test('the typesetter and its stylesheet travel together', () => {
  // The stylesheet belongs to the chunk that needs it. Loaded globally it was 23 kB of
  // maths styling on pages that cannot render maths.
  assert.match(IMPL, /^import katex from 'katex';/m, 'the impl should own the library');
  assert.match(IMPL, /import 'katex\/dist\/katex\.min\.css'/, 'the impl should own the stylesheet');
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/@import\s+'katex/.test(css), 'the stylesheet is global again');
});

test('the pure helper carries no library behind it', () => {
  // It used to sit beside the renderer, so importing this small function pulled the
  // whole typesetter in with it.
  // Comments stripped: the note explaining *why* this module avoids KaTeX names it,
  // and prose about a dependency must not read as the dependency.
  const helperCode = HELPER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/katex/i.test(helperCode), 'the helper must not depend on katex');
  // Doubled spaces are the existing behaviour, not a defect: the `*` is replaced with a
  // padded ` \cdot ` on top of the spaces the author already typed. Asserted as it is,
  // so this guard pins the move between modules rather than quietly restyling output.
  assert.equal(equationToLatex('1/2 * 3'), '\\frac{1}{2}  \\cdot  3');
  assert.equal(equationToLatex('  x  '), 'x');
});

test('the equation stays readable while the chunk is in flight', () => {
  /*
   * `next/dynamic`'s `loading` receives no props, so it could only render an empty box —
   * an equation that vanishes and reappears shifts the text under the reader. The
   * fallback is the same plain-text form the renderer falls back to when KaTeX throws.
   */
  assert.match(WRAPPER, /<Suspense fallback=\{fallback\}>/, 'there must be a fallback');
  assert.match(WRAPPER, /const plain = text\.replace\(\/\\\*\/g, '·'\)/, 'the fallback should show the equation');
  assert.match(WRAPPER, /display\s*\n?\s*\?\s*<div/, 'the fallback must match the rendered element');
});

test('the public shape of the module is unchanged', () => {
  // Callers import both of these; the split is meant to be invisible to them.
  assert.match(WRAPPER, /export \{ equationToLatex \} from '\.\/equationToLatex'/);
  assert.match(WRAPPER, /export function MathEquation\(/);
  assert.match(WRAPPER, /text,\s*\n\s*className,\s*\n\s*display = true,/, 'the props should not change');
});
