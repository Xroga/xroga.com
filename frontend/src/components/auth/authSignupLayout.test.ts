import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('capability slides use text rather than feature images', () => {
  const showcase = read('./AuthShowcase.tsx');
  assert.doesNotMatch(showcase, /auth-stories|<figure/);
  assert.match(showcase, /hidden=\{activeSlide !== index\}/);
  assert.match(showcase, /aria-current/);
});

test('carousel cleans up its timer and honors reduced motion', () => {
  const showcase = read('./AuthShowcase.tsx');
  assert.match(showcase, /window.clearTimeout/);
  assert.match(showcase, /if \(reducedMotion \|\| paused\) return/);
  assert.match(showcase, /query.removeEventListener/);
});
