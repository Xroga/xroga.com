import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BuildStreamNarrator,
  narrationLine,
  type NarrationEvent,
} from './buildStreamNarrator.js';
import { extractProjectFiles } from './siteBuilder.js';

/**
 * Cover for the live build narration.
 *
 * A user asked to watch the product being built rather than read a waiting message:
 * *"WE WANT TO SEE FULL CONSTRUCTION FULL BEHIND WORKING … WE WANT REAL WORKING SEE
 * EVERYTIME WHAT XROGA AI DONE BEHIND AND HOW THEY BUILD OUR PRODUCTS."*
 *
 * The tokens were always there — `callBuilderStream` collected them into
 * `bufferedDeltas` and released them only once the response passed validation, which is
 * why the four minutes in which a project is written showed nothing.
 *
 * The property that makes this trustworthy rather than decorative: every line reports
 * bytes that have already arrived. A file cannot be announced before its fence opens,
 * and a line count cannot exceed the newlines actually received.
 */

const RESPONSE = [
  "I'll build the landing page.\n\n",
  '```html path=index.html\n',
  '<!doctype html>\n<html>\n<body>\n<h1>Lumina Dental</h1>\n</body>\n</html>\n',
  '```\n\n',
  '```file:styles.css\n',
  'body { margin: 0 }\n:root { color-scheme: dark }\n',
  '```\n',
].join('');

/** Feeds a response in chunks of a fixed size, the way a network delivers it. */
function narrate(text: string, chunkSize: number): NarrationEvent[] {
  const narrator = new BuildStreamNarrator();
  const events: NarrationEvent[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    events.push(...narrator.push(text.slice(i, i + chunkSize)));
  }
  events.push(...narrator.finish());
  return events;
}

test('a file is announced the moment its fence opens', () => {
  const narrator = new BuildStreamNarrator();
  assert.deepEqual(narrator.push('Here we go.\n\n'), []);
  assert.deepEqual(narrator.push('```html path=index.html\n'), [
    { kind: 'file_start', path: 'index.html' },
  ]);
});

test('both fence forms are recognised', () => {
  const events = narrate(RESPONSE, RESPONSE.length);
  const started = events.filter((e) => e.kind === 'file_start').map((e) => e.path);
  assert.deepEqual(started, ['index.html', 'styles.css']);
});

test('the narration matches what the final parser extracts', () => {
  // If these ever disagree, the terminal is describing a different build from the one
  // that ships — the exact drift the shared event model exists to prevent.
  const narrated = narrate(RESPONSE, 7)
    .filter((e) => e.kind === 'file_done')
    .map((e) => e.path)
    .sort();
  const extracted = extractProjectFiles(RESPONSE).map((f) => f.path).sort();
  assert.deepEqual(narrated, extracted);
});

test('a fence split across chunk boundaries is still recognised', () => {
  // The normal case: no provider aligns its chunks to markdown.
  for (const size of [1, 2, 3, 5, 13, 64, 1000]) {
    const paths = narrate(RESPONSE, size)
      .filter((e) => e.kind === 'file_start')
      .map((e) => e.path);
    assert.deepEqual(paths, ['index.html', 'styles.css'], `chunk size ${size}`);
  }
});

test('the same stream narrates identically however it is chunked', () => {
  const reference = JSON.stringify(narrate(RESPONSE, 1000));
  for (const size of [1, 4, 17, 128]) {
    assert.equal(JSON.stringify(narrate(RESPONSE, size)), reference, `chunk size ${size}`);
  }
});

test('a completed file reports the lines it actually contains', () => {
  const done = narrate(RESPONSE, 9).find(
    (e): e is Extract<NarrationEvent, { kind: 'file_done' }> =>
      e.kind === 'file_done' && e.path === 'index.html',
  );
  assert.ok(done);
  assert.equal(done.lines, 6);
});

test('a long file reports progress while it is still being written', () => {
  const body = Array.from({ length: 90 }, (_, i) => `  <p>line ${i}</p>`).join('\n');
  const events = narrate(`\`\`\`html path=index.html\n${body}\n\`\`\`\n`, 40);
  const progress = events.filter((e) => e.kind === 'file_progress');
  assert.ok(progress.length >= 4, `expected several progress reports, got ${progress.length}`);
  // Monotonic: a line count that went backwards would look like work being undone.
  const counts = progress.map((e) => (e as { lines: number }).lines);
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b));
});

test('progress is throttled — a 600-line file is not 600 events', () => {
  const body = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n');
  const progress = narrate(`\`\`\`ts path=big.ts\n${body}\n\`\`\`\n`, 50).filter(
    (e) => e.kind === 'file_progress',
  );
  assert.ok(progress.length < 80, `emitted ${progress.length} progress events`);
});

test('prose between files produces nothing', () => {
  // Commentary is not construction. Only file structure is narrated.
  const narrator = new BuildStreamNarrator();
  assert.deepEqual(narrator.push('Now I will explain my approach in detail. '.repeat(40)), []);
});

test('a truncated response still reports the file it was writing', () => {
  // The response was cut off mid-file. Reporting the partial file is the evidence that
  // it was truncated; dropping it silently hides exactly what went wrong.
  const narrator = new BuildStreamNarrator();
  narrator.push('```html path=index.html\n<!doctype html>\n<html>\n<body>\n');
  const closing = narrator.finish();
  assert.equal(closing.length, 1);
  assert.equal(closing[0].kind, 'file_done');
  assert.equal((closing[0] as { path: string }).path, 'index.html');
});

test('finishing a completed stream adds nothing', () => {
  const narrator = new BuildStreamNarrator();
  narrator.push(RESPONSE);
  assert.deepEqual(narrator.finish(), []);
});

test('a leading ./ is stripped so paths match the shipped files', () => {
  const narrator = new BuildStreamNarrator();
  assert.deepEqual(narrator.push('```tsx path=./app/page.tsx\n'), [
    { kind: 'file_start', path: 'app/page.tsx' },
  ]);
});

test('an unbounded stream of prose does not grow memory without limit', () => {
  // The parser keeps only enough tail to complete a fence that straddles a chunk.
  const narrator = new BuildStreamNarrator();
  for (let i = 0; i < 500; i += 1) narrator.push('x'.repeat(1000));
  assert.deepEqual(narrator.push('```css path=a.css\n'), [{ kind: 'file_start', path: 'a.css' }]);
});

test('lines are present tense while writing and past tense when done', () => {
  assert.equal(narrationLine({ kind: 'file_start', path: 'app/page.tsx' }), 'Writing app/page.tsx');
  assert.match(
    narrationLine({ kind: 'file_progress', path: 'app/page.tsx', lines: 40 }),
    /^Writing app\/page\.tsx — 40 lines so far$/,
  );
  assert.equal(
    narrationLine({ kind: 'file_done', path: 'app/page.tsx', lines: 84, bytes: 2000 }),
    'Wrote app/page.tsx — 84 lines',
  );
});

test('a one-line file is singular', () => {
  assert.match(narrationLine({ kind: 'file_done', path: 'a.txt', lines: 1, bytes: 4 }), /1 line$/);
});

test('no line predicts work that has not happened', () => {
  const lines = narrate(RESPONSE, 11).map(narrationLine);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.doesNotMatch(line, /will |about to|remaining|%|ETA/i, line);
  }
});
