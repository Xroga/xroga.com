import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FOOTER = read('../components/layout/MarketingFooter.tsx');
const CSS = read('../styles/public-marketing.css');

test('the static footer wordmark is replaced by seven concise rotating prompts', () => {
  assert.doesNotMatch(FOOTER, /footer__wordmark/);
  assert.equal((FOOTER.match(/\{ lead:/g) ?? []).length, 7);
  assert.match(CSS, /animation:xv-public-footer-prompt 35s/);
});

test('footer prompts stay on one line with light theme-aware weight and two-tone ink', () => {
  assert.match(CSS, /\.xv-marketing-footer__prompt[^}]*white-space:nowrap/);
  assert.match(CSS, /font:390 clamp\(1\.7rem,4vw,3\.65rem\)/);
  assert.match(CSS, /color:var\(--marketing-text-muted\)/);
  assert.match(CSS, /span b \{ color:var\(--marketing-text-primary\); font-weight:450/);
});
