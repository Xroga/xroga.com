// Builds the compact discovery index of the Agentic Awesome Skills pool (sickn33/agentic-awesome-skills, code MIT, content CC BY 4.0) from its skills_index.json:
//   node scripts/build-aas-index.mjs <path-to-skills_index.json> <40-hex commit sha>
// Only discovery data is kept (id, category, name, a short description); a skill's body is fetched on demand from the pinned commit. Skills the pool itself marks
// "offensive" (attack tooling) are left out: Xroga does not suggest them.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, sha] = process.argv.slice(2);
if (!src || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
  console.error('usage: node scripts/build-aas-index.mjs <skills_index.json> <40-hex sha>');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(src, 'utf8'));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const rows = [];
let dropped = 0;
for (const s of raw) {
  if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(s.id)) { dropped++; continue; }
  if (s.risk === 'offensive') { dropped++; continue; }
  rows.push([s.id, clean(s.category).slice(0, 30), clean(s.name).slice(0, 80), clean(s.description).slice(0, 220), s.risk === 'critical' ? 1 : 0]);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent/data/aas-index.json');
writeFileSync(out, JSON.stringify({ repo: 'sickn33/agentic-awesome-skills', sha, licence: 'MIT (code), CC BY 4.0 (content)', count: rows.length, dropped, rows }));
console.log(`wrote ${rows.length} skills (${dropped} left out) to ${out}`);
