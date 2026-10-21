import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { draftForExplicitHide, type ComposerDraftSnapshot } from './composerDraft';

const scope = { owner: 'owner-A', session: 'conversation-A', project: 'project-A' };
const snapshot: ComposerDraftSnapshot = { ...scope, value: ' latest draft \n', restoring: false };

test('explicit hide captures the exact latest draft, including deliberate empty clears', () => {
  assert.equal(draftForExplicitHide([snapshot], scope, false), snapshot.value);
  assert.equal(draftForExplicitHide([{ ...snapshot, value: '' }], scope, false), '');
  for (const value of ['a', 'rapid typing', '日本語 draft\nsecond line', '']) {
    assert.equal(draftForExplicitHide([{ ...snapshot, value }], scope, false), value);
  }
});

test('hide cannot transfer drafts across accounts, conversations or projects', () => {
  for (const field of ['owner', 'session', 'project'] as const) {
    assert.equal(draftForExplicitHide([snapshot], { ...scope, [field]: 'foreign' }, false), undefined);
    assert.equal(draftForExplicitHide([{ ...snapshot, [field]: 'foreign' }], scope, false), undefined);
  }
  assert.equal(draftForExplicitHide([snapshot], { ...scope, owner: '' }, false), undefined);
  assert.equal(draftForExplicitHide([snapshot], { ...scope, session: '' }, false), undefined);
});

test('restoration, missing or duplicate composers never flush stale input', () => {
  assert.equal(draftForExplicitHide([snapshot], scope, true), undefined);
  assert.equal(draftForExplicitHide([{ ...snapshot, restoring: true }], scope, false), undefined);
  assert.equal(draftForExplicitHide([], scope, false), undefined);
  assert.equal(draftForExplicitHide([snapshot, snapshot], scope, false), undefined);
  assert.deepEqual(snapshot, { ...scope, value: ' latest draft \n', restoring: false });
});

test('the correction writes only on explicit hide and preserves typing debounce and existing reset owners', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const launcher = read('../components/terminal/WorkspaceLauncher.tsx');
  const bar = read('../components/terminal/TerminalChatBar.tsx');
  assert.match(launcher, /if \(!chatbarHidden\)/);
  assert.match(launcher, /draftForExplicitHide/);
  assert.ok(launcher.indexOf('setPrompt(latestDraft)') < launcher.indexOf('setChatbarHidden(!chatbarHidden)'));
  assert.doesNotMatch(launcher, /useEffect|setTimeout|localStorage|sessionStorage/);
  assert.match(bar, /setPrompt\(draft\);[\s\S]*?\}, 300\);\s*return \(\) => window\.clearTimeout\(timer\)/);
  assert.doesNotMatch(bar, /return \(\) => \{?\s*setPrompt\(draftRef\.current\)/);
});
