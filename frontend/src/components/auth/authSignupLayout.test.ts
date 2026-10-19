import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('auth mounts exactly one form and does not depend on workspace theme', () => {
  const shell = read('./AuthShell.tsx');
  assert.match(shell, /mode === 'signup' \? <SignupForm \/> : <LoginForm \/>/);
  assert.doesNotMatch(shell, /useThemeStore|<aside/);
});

test('email fields precede preserved workspace personalization', () => {
  const form = read('./SignupForm.tsx');
  assert.ok(form.indexOf('id="signup-email"') < form.indexOf('styles.setupGroup'));
  assert.match(form, /styles.themeGrid/);
  assert.match(form, /styles.avatarRow/);
});

test('supplied artwork has distinct cache keys and optimized assets', () => {
  const showcase = read('./AuthShowcase.tsx');
  for (const name of ['responsive-growth-v2.webp', 'xroga-employees-original-v2.webp']) {
    assert.ok(showcase.includes(name));
    const size = statSync(new URL('../../../public/brand/auth-stories/' + name, import.meta.url)).size;
    assert.ok(size > 1000 && size < 200000);
  }
  assert.doesNotMatch(showcase, /styles.launchPanel/);
});

test('carousel cleans up its timer and honors reduced motion', () => {
  const showcase = read('./AuthShowcase.tsx');
  assert.match(showcase, /window.clearTimeout/);
  assert.match(showcase, /if \(reducedMotion\) return/);
  assert.match(showcase, /query.removeEventListener/);
});
