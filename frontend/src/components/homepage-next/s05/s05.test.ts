import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART } from './art';
import { ALL, COPY, ROWS } from './capabilities';

const dir = fileURLToPath(new URL('./', import.meta.url));
const src = (name: string) => readFileSync(join(dir, name), 'utf8');
const strings = JSON.stringify({ COPY, ROWS });
const css = src('S05.css');

test('content: thirteen capability tiles in two rails, in the founder-approved order', () => {
  assert.deepEqual(
    ROWS.map((r) => r.map((c) => c.title)),
    [
      ['Travel & Bookings', 'Email & Calendars', 'CRM & Support', 'Payments & Accounting', 'Workflow Templates', 'Workflows & Triggers'],
      ['Coding & Repositories', 'Custom APIs & MCPs', 'Web3 & Blockchain', 'Hackathons & Projects', 'Desktop Applications', 'Domains & Infrastructure', 'Live Operations'],
    ],
  );
  assert.deepEqual(COPY.rows, ['Everyday & business', 'Specialized & technical']);
  assert.equal(new Set(ALL.map((c) => c.id)).size, 13);
  for (const c of ALL) assert.match(c.source, /^§\d+/, `${c.id} cites the founder capability map`);
  assert.equal(ROWS[1][0].line, 'Write, debug and improve code across new and existing projects.');
});

test('content: S05 extends the page instead of repeating S00 to S04', () => {
  const titles = ALL.map((c) => c.title).join(' | ');
  assert.doesNotMatch(titles, /Build Websites|Browser Automation|AI Employees|Research|SEO|AEO|Marketing|App Store|Google Play|Chrome Web Store/i);
});

test('copy: a short outcome line, truthful claims, no em or en dashes, one boundary note', () => {
  assert.equal(`${COPY.titleLead} ${COPY.titleAccent}`, 'The possibilities go further.');
  assert.equal(COPY.lede, 'From everyday services to specialized systems, explore what else Xroga can help you accomplish.');
  assert.doesNotMatch(strings, /[–—]/);
  for (const c of ALL) {
    assert.ok(c.line.length <= 66, `${c.id} line stays short`);
    assert.ok(c.title.length <= 26, `${c.id} title fits one line`);
  }
  assert.doesNotMatch(strings, /\b(guarantee[sd]?|booked for you|payment (sent|taken)|approved|uptime|recovered|profit|anything\. everything)\b/i);
  assert.match(COPY.note, /accounts and services you connect/);
});

test('art: thirteen original compositions on one canvas, each with its own choreography', () => {
  for (const c of ALL) {
    assert.match(ART[c.id], new RegExp(`^<svg class="s5-art" data-art="${c.id}" viewBox="0 0 300 160" aria-hidden="true"`), c.id);
    assert.doesNotMatch(ART[c.id], /<script|on[a-z]+=|href=/i, `${c.id} art is inert markup`);
  }
  // a distinct movement per tile, keyed to what it does
  const moves = ['s5Plane', '.s5-letterIn', '.s5-deal', '.s5-lrow', '.s5-mod', 's5Sig', '.s5-add', 's5Packet', '.s5-drop', '.s5-prog', '.s5-w3', 's5Pulse', 's5Tele'];
  for (const m of moves) assert.ok(css.includes(m), `motion ${m}`);
  // the coding tile is a working-looking IDE: tree, code, inline diff, branch and checks
  for (const part of ['s5-tree', 's5-kw', 's5-del', 's5-add', 's5-gitB', 's5-checkTick']) assert.ok(ART.coding.includes(part), `coding ${part}`);
  // transform, opacity and stroke offsets only: no layout properties animate
  assert.doesNotMatch(css, /transition:[^;]*\b(width|height|top|left|margin|padding)\b/);
  assert.doesNotMatch(css, /@keyframes[^{]*\{[^}]*\b(width|height|top|left)\s*:/);
  // colour at rest: accents stay near full strength, the hover saturates them
  assert.match(css, /--c1r: color-mix\(in oklab, var\(--c1\) 86%/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  // every rule is scoped to the section's own prefix
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^@\s{}][^{}]*\{/gm) ?? []) {
    if (/^(from|to|\d+%)/.test(sel.trim())) continue;
    assert.match(sel, /\.s5|\[data-on\]/, `scoped: ${sel.trim()}`);
  }
});

test('rails: native scrolling with snap, labelled arrows, keyboard, no auto drift, hover without re-render', () => {
  const ui = src('S05Capabilities.tsx');
  assert.match(css, /overflow-x: auto;/);
  assert.match(css, /scroll-snap-type: x mandatory;/);
  assert.match(ui, /aria-label=\{`Show earlier \$\{label\.toLowerCase\(\)\} capabilities`\}/);
  assert.match(ui, /aria-label=\{`Show more \$\{label\.toLowerCase\(\)\} capabilities`\}/);
  assert.match(ui, /ArrowRight: i \+ 1, ArrowLeft: i - 1/);
  assert.match(ui, /tabIndex=\{0\}/);
  assert.doesNotMatch(ui, /setInterval|requestAnimationFrame/);
  assert.match(ui, /setAttribute\('data-on', ''\)/);
  const tile = ui.slice(ui.indexOf('function Tile'), ui.indexOf('function Rail'));
  assert.doesNotMatch(tile, /useState/);
  assert.match(ui, /prefers-reduced-motion: reduce\)'\)\.matches/);
  // no heavy fade over the next tile's text: the rail simply runs to the screen edge
  assert.doesNotMatch(css, /mask-image/);
});

test('page: S05 follows S04 directly; no reference media ships with it', () => {
  const page = readFileSync(join(dir, '../../homepage/HomepageClient.tsx'), 'utf8');
  assert.match(page, /<S04Publish loggedIn=\{loggedIn\} \/>\s*<S05Capabilities \/>/);
  for (const f of readdirSync(dir)) assert.doesNotMatch(f, /\.(mp4|webm|mov|png|jpe?g)$/i);
  for (const f of readdirSync(dir).filter((x) => /\.(tsx?|css)$/.test(x) && !x.endsWith('.test.ts'))) assert.doesNotMatch(src(f), /\.mp4|aiven/i, f);
});
