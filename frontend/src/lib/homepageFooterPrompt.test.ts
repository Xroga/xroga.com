import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FOOTER = read('../components/layout/MarketingFooter.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the static footer wordmark is replaced by seven concise rotating prompts', () => {
  assert.doesNotMatch(FOOTER, /footer__wordmark/);
  assert.equal((FOOTER.match(/\{ lead:/g) ?? []).length, 7);
  assert.match(CSS, /animation:\s*xv-footer-prompt-cycle 35s/);
});

test('footer prompts stay on one line with light theme-aware weight and two-tone ink', () => {
  assert.match(CSS, /\.xv-marketing-footer__prompt span\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(CSS, /font-size:\s*clamp\(2rem, 4\.35vw, 4rem\)/);
  assert.match(CSS, /font-weight:\s*390/);
  assert.match(CSS, /color:\s*var\(--text-muted\)/);
  assert.match(CSS, /span b \{ color:var\(--text-primary\);font-weight:460/);
});
