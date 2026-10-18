import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL, COPY, ROWS } from './capabilities';

const dir = fileURLToPath(new URL('./', import.meta.url));
const src = (name: string) => readFileSync(join(dir, name), 'utf8');
const strings = JSON.stringify({ COPY, ROWS });

test('content: twelve capability tiles in two rows of six, in the founder-approved order', () => {
  assert.equal(ROWS.length, 2);
  assert.deepEqual(
    ROWS.map((r) => r.map((c) => c.title)),
    [
      ['Travel & Bookings', 'Email & Calendars', 'CRM & Support', 'Payments & Accounting', 'Workflow Templates', 'Workflows & Triggers'],
      ['Custom APIs & MCPs', 'Web3 & Blockchain', 'Hackathons & Projects', 'Desktop Applications', 'Domains & Infrastructure', 'Live Operations'],
    ],
  );
  assert.deepEqual(COPY.rows, ['Everyday & business', 'Specialized & technical']);
  assert.equal(new Set(ALL.map((c) => c.id)).size, 12);
  for (const c of ALL) assert.match(c.source, /^§\d+/, `${c.id} cites the founder capability map`);
});

test('content: S05 extends the page instead of repeating S00 to S04', () => {
  const titles = ALL.map((c) => c.title).join(' | ');
  assert.doesNotMatch(titles, /Build Websites|Browser Automation|AI Employees|Research|SEO|AEO|Marketing|App Store|Google Play|Chrome Web Store/i);
});

test('copy: short, truthful, no em or en dashes, one section-level boundary note', () => {
  assert.equal(COPY.title, 'Beyond what you’ve seen.');
  assert.doesNotMatch(strings, /[–—]/);
  for (const c of ALL) {
    assert.ok(c.line.length <= 60, `${c.id} line stays short`);
    assert.ok(c.title.length <= 26, `${c.id} title fits one line`);
  }
  // nothing promises an outcome the visitor's own accounts and third parties control
  assert.doesNotMatch(strings, /\b(guarantee[sd]?|booked for you|payment (sent|taken)|approved|uptime|recovered|profit|anything\. everything)\b/i);
  assert.match(COPY.note, /accounts and services you connect/);
});

test('motion: every tile has its own graphic and its own movement', () => {
  const art = src('Art.tsx');
  const css = src('Art.module.css');
  for (const c of ALL) assert.match(art, new RegExp(`\\b${c.id}: \\w+,`), `${c.id} has an art component`);
  // twelve distinct pieces, each with movement keyed to what it does
  const moves = ['tvMark', 'mlLetter', '.link', '.row', '.mod', 'trSig', 'apFlow', '.drop', 'hkProg', '.winB', 'inVerify', 'opPulse'];
  for (const m of moves) assert.ok(css.includes(m), `motion ${m}`);
  // transform, opacity and stroke offsets only: no layout properties animate
  assert.doesNotMatch(css, /transition:[^;]*\b(width|height|top|left|margin|padding)\b/);
  assert.doesNotMatch(css, /@keyframes[^{]*\{[^}]*\b(width|height|top|left)\s*:/);
  // reduced motion: no travel, finished state at once
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
});

test('rails: native scrolling with snap, labelled arrows, keyboard, no auto drift, hover without re-render', () => {
  const ui = src('S05Capabilities.tsx');
  const css = src('S05.module.css');
  assert.match(css, /overflow-x: auto;/);
  assert.match(css, /scroll-snap-type: x mandatory;/);
  assert.match(ui, /aria-label=\{`Show earlier \$\{label\.toLowerCase\(\)\} capabilities`\}/);
  assert.match(ui, /aria-label=\{`Show more \$\{label\.toLowerCase\(\)\} capabilities`\}/);
  assert.match(ui, /ArrowRight: i \+ 1, ArrowLeft: i - 1/);
  assert.match(ui, /tabIndex=\{0\}/);
  // no conveyor: nothing moves the rails on its own
  assert.doesNotMatch(ui, /setInterval|requestAnimationFrame|animation:/);
  // the tile's on-state is a DOM attribute, not React state
  assert.match(ui, /setAttribute\('data-on', ''\)/);
  const tile = ui.slice(ui.indexOf('function Tile'), ui.indexOf('function Rail'));
  assert.doesNotMatch(tile, /useState/);
  // smooth paging respects reduced motion
  assert.match(ui, /prefers-reduced-motion: reduce\)'\)\.matches/);
});

test('page: S05 follows S04 directly; no reference media ships with it', () => {
  const page = readFileSync(join(dir, '../../homepage/HomepageClient.tsx'), 'utf8');
  assert.match(page, /<S04Publish loggedIn=\{loggedIn\} \/>\s*<S05Capabilities \/>/);
  for (const f of readdirSync(dir)) assert.doesNotMatch(f, /\.(mp4|webm|mov)$/i);
  for (const f of readdirSync(dir).filter((x) => /\.(tsx?|css)$/.test(x) && !x.endsWith('.test.ts'))) assert.doesNotMatch(src(f), /\.mp4|aiven/i, f);
});
