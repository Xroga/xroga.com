import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MODAL = read('../components/terminal/MessageShareModal.tsx');
const PAGE = read('../app/share/[token]/page.tsx');

test('private and public shares are distinct experiences', () => {
  assert.match(MODAL, /Only your account/);
  assert.match(MODAL, /Anyone with the link/);
  assert.match(MODAL, /created\.visibility === 'private'/);
  assert.match(MODAL, /Only your signed-in Xroga account can open it/);
  assert.match(MODAL, /created\.visibility === 'private'[\s\S]*?\) : \([\s\S]*?SOCIALS\.map/);
});

test('the private page forwards the current session for owner verification', () => {
  assert.match(PAGE, /supabase\.auth\.getSession\(\)/);
  assert.match(PAGE, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(PAGE, /response\.status === 403/);
  assert.match(PAGE, /Only the Xroga account that created it can open this page/);
});

test('share choices use filled surfaces rather than outlined button cards', () => {
  const choices = MODAL.slice(MODAL.indexOf('grid grid-cols-2 gap-2'), MODAL.indexOf('max-h-32'));
  assert.doesNotMatch(choices, /\bborder\b/);
  assert.match(choices, /bg-\[var\(--surface-inset\)\]/);
});
