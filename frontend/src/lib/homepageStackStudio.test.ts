import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const COMPONENT = read('../components/homepage/HomepageStackStudio.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the compact stack studio follows intelligence without disturbing the approved story order', () => {
  const intelligence = PAGE.indexOf('<XrogaIntelligenceSection />');
  const stack = PAGE.indexOf('<HomepageStackStudio />');
  const showcase = PAGE.indexOf('<HomepageShowcase />');
  assert.ok(intelligence !== -1 && intelligence < stack && stack < showcase);
  assert.match(COMPONENT, /grid-template-columns|xv-stack-studio__grid/);
});

test('the original brief-to-product art is bundled locally and rendered through Next Image', () => {
  const image = '/homepage/stack/xroga-brief-to-product-20260902.png';
  assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
  assert.match(COMPONENT, /from 'next\/image'/);
  assert.ok(COMPONENT.includes(image));
});

test('the requested integrations and popular languages are all present', () => {
  for (const integration of ['GitHub', 'Vercel', 'Supabase', 'Whop', 'Cloudflare', 'Brevo']) {
    assert.ok(COMPONENT.includes(`name: '${integration}'`), `${integration} is missing`);
  }
  for (const language of ['JavaScript', 'TypeScript', 'Python', 'OpenJDK', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin']) {
    assert.ok(COMPONENT.includes(`name: '${language}'`), `${language} is missing`);
  }
});

test('both rails loop continuously without repeating their names to screen readers', () => {
  assert.equal((COMPONENT.match(/<div className="xv-stack-studio__rail(?: is-reverse)?"/g) || []).length, 2);
  assert.match(COMPONENT, /\[false, true\]\.map/);
  assert.match(COMPONENT, /aria-hidden=\{duplicate \|\| undefined\}/);
  assert.match(CSS, /@keyframes xv-stack-marquee/);
  assert.match(CSS, /animation:\s*xv-stack-marquee 26s linear infinite/);
});

test('scroll reveal is progressive and reduced motion stays still', () => {
  assert.match(CSS, /@supports \(animation-timeline: view\(\)\)/);
  assert.match(CSS, /animation-timeline:\s*view\(\)/);
  assert.match(CSS, /animation-range:\s*entry 0% exit 100%/);
  assert.match(CSS, /0% \{ opacity: 0\.3; transform: translate3d\(0, 74px, 0\) scale\(0\.985\); filter: blur\(10px\); \}/);
  assert.match(CSS, /100% \{ opacity: 0\.72; transform: translate3d\(0, -42px, 0\) scale\(0\.992\); filter: blur\(2\.5px\); \}/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*xv-stack-studio__track \{ animation: none !important/);
  assert.match(CSS, /html:has\(\.xv-home-coding\) \{ scroll-behavior: smooth; \}/);
});
