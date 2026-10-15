import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { APPROVAL, BRANCH, COPY, DESTS, EVIDENCE, INTRO, STEPS, STORY, isStep, reached } from './publish';
import { STORE_MARKS_CLEARED } from './storeMarks';

const dir = new URL('./', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, dir), 'utf8');
const sources = readdirSync(dir)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => [f, read(f)] as const);
// the disclaimer is the one place these words appear, and only negated
const strings = JSON.stringify({ COPY: { ...COPY, note: '' }, STORY, EVIDENCE, APPROVAL });

test('the intro and the store branch walk every step in order, inside their time budgets', () => {
  for (const [list, max, min] of [[INTRO, 12000, 8500], [BRANCH, 7000, 4000]] as const) {
    assert.deepEqual(list.map((b) => b.step), STEPS);
    assert.equal(list[0].at, 0);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].at > list[i - 1].at);
    const last = list[list.length - 1].at;
    assert.ok(last >= min && last <= max, `${last} not in ${min}..${max}`);
  }
  assert.ok(reached('approval', 'capture'));
  assert.ok(!reached('inspect', 'listing'));
  assert.ok(isStep('package') && !isStep('live'));
});

test('copy follows the brief', () => {
  assert.equal(COPY.title, 'Build anywhere. Publish with Xroga.');
  assert.equal(COPY.lede, 'Bring an app or website. Xroga prepares its release for iOS, Android and Chrome.');
  assert.equal(COPY.cta, 'Prepare a release in Xroga');
  assert.deepEqual(DESTS.map((d) => STORY[d].storeName), ['App Store', 'Google Play', 'Chrome Web Store']);
});

test('nothing is shown as submitted, approved, live, published or paid, and no price is invented', () => {
  assert.doesNotMatch(strings, /\b(submitted|approved|is live|now live|published|paid|charged \$|\$\d)/i);
  assert.match(COPY.note, /nothing is submitted or charged/);
  assert.equal(APPROVAL.price, 'Price shown before payment');
  assert.doesNotMatch(strings, /available on|get it on|download on/i);
});

test('every store step stays with the owner; Google Play uploads are theirs', () => {
  for (const d of DESTS) assert.match(STORY[d].approval.accountStep, /you /);
  assert.match(STORY.android.approval.accountStep, /you upload the bundle/);
  assert.equal(EVIDENCE[EVIDENCE.length - 1].owner, true);
});

test('store marks stay neutral until brand approval is recorded', () => {
  assert.equal(STORE_MARKS_CLEARED, false);
});

test('no coding-tool brands and no "sample" wording', () => {
  for (const [f, src] of sources) {
    assert.doesNotMatch(src, /replit|bolt\.new|lovable|cursor\.(com|sh)|v0\.dev/i, f);
    assert.doesNotMatch(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /['">]\s*sample/i, f);
  }
});

test('one section, one h2, review hook gated away from production, no prototype switches', () => {
  const main = read('S04Publish.tsx');
  assert.equal(main.match(/<section\b/g)?.length, 1);
  assert.equal(main.match(/<h2\b/g)?.length, 1);
  assert.match(main, /NODE_ENV !== 'production'/);
  assert.match(main, /NEXT_PUBLIC_VERCEL_ENV !== 'production'/);
  for (const [f, src] of sources) assert.doesNotMatch(src, /s04Comp|ConceptA|ConceptB/, f);
  assert.doesNotMatch(main, /\b(Replay|Skip|Start over)\b/);
});
