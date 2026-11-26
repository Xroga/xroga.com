// Builds the discovery index of browser-harness's field-tested skills (github.com/browser-use/browser-harness, MIT):
//   node scripts/build-harness-index.mjs <path to a browser-harness checkout> <40-hex commit sha>
// agent-workspace/domain-skills/<site>/<file>.md: one site each, with its real endpoints, rate limits, robots rules and pitfalls, tested against the live site.
// interaction-skills/<file>.md: how to handle shadow DOM, iframes, dropdowns, dialogs, uploads, downloads and similar.
// Only discovery data is kept (id, kind, name, a short description, the hosts the file names); the body is fetched from the pinned commit when the agent reads it.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [root, sha] = process.argv.slice(2);
if (!root || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
  console.error('usage: node scripts/build-harness-index.mjs <browser-harness checkout> <40-hex sha>');
  process.exit(2);
}
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;
const SKIP_HOSTS = /^(?:github\.com|raw\.githubusercontent\.com|example\.com|localhost|127\.0\.0\.1|schema\.org|w3\.org|developer\.mozilla\.org|wikipedia\.org|en\.wikipedia\.org|browser-use\.com|docs\.browser-use\.com|cloud\.browser-use\.com)$/;

function describe(text) {
  // A file may open with front matter: its description is the best summary there is.
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm) {
    const d = /^description:\s*(.+)$/m.exec(fm[1])?.[1];
    const n = /^name:\s*(.+)$/m.exec(fm[1])?.[1];
    const inner = describeBody(text.slice(fm[0].length));
    return { title: inner.title || clean(n ?? ''), desc: clean(d ?? '').slice(0, 220) || inner.desc };
  }
  return describeBody(text);
}

function describeBody(text) {
  const lines = text.split(/\r?\n/);
  const title = clean((lines.find(l => /^#\s+/.test(l)) ?? '').replace(/^#\s+/, ''));
  // The first paragraph after the title that is prose: not a heading, a list marker, a code fence or the "field-tested" provenance line alone.
  let desc = '';
  const start = lines.findIndex(l => /^#\s+/.test(l)) + 1;
  for (let i = start; i < lines.length && !desc; i++) {
    const l = clean(lines[i]);
    if (!l || l.startsWith('#') || l.startsWith('```') || /^field-tested/i.test(l)) continue;
    desc = l.replace(/^[-*]\s+/, '');
  }
  return { title, desc: desc.slice(0, 220) };
}

function hostsIn(text) {
  const found = new Set();
  for (const m of text.slice(0, 4000).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const h = m[1].toLowerCase().replace(/^www\./, '');
    if (!SKIP_HOSTS.test(h)) found.add(h);
    if (found.size >= 6) break;
  }
  return [...found].join(' ');
}

const rows = [];
let skipped = 0;
const base = join(root, 'agent-workspace', 'domain-skills');
for (const dir of readdirSync(base).sort()) {
  const full = join(base, dir);
  if (!statSync(full).isDirectory()) continue;
  for (const file of readdirSync(full).filter(f => f.endsWith('.md')).sort()) {
    const text = readFileSync(join(full, file), 'utf8');
    const stem = file.replace(/\.md$/, '');
    const id = `${dir}--${stem}`;
    if (!ID.test(id) || !ID.test(dir) || !ID.test(stem)) { skipped++; continue; }
    const { title, desc } = describe(text);
    rows.push([id, 'site', title || dir, desc, hostsIn(text), dir, stem]);
  }
}
const how = join(root, 'interaction-skills');
for (const file of readdirSync(how).filter(f => f.endsWith('.md')).sort()) {
  const text = readFileSync(join(how, file), 'utf8');
  const stem = file.replace(/\.md$/, '');
  const id = `how--${stem}`;
  if (!ID.test(id) || !ID.test(stem)) { skipped++; continue; }
  const { title, desc } = describe(text);
  rows.push([id, 'how-to', title || stem, desc, '', '', stem]);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent/data/harness-index.json');
writeFileSync(out, JSON.stringify({ repo: 'browser-use/browser-harness', sha, licence: 'MIT', count: rows.length, skipped, rows }));
console.log(`wrote ${rows.length} skills (${skipped} skipped), ${statSync(out).size} bytes, to ${out}`);
