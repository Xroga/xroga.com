// Builds the Agentic Awesome Skills pool (sickn33/agentic-awesome-skills, code MIT, content CC BY 4.0) into the extension:
//   node scripts/build-aas-bundle.mjs <path-to-a-clone-of-the-repo>
// Writes
//   src/agent/data/aas-index.json   discovery rows: [id, category, name, description, critical, headings, offset, length]
//   public/pool/skills.bin          the SKILL.md of every skill whose licence allows redistribution, each gzip-compressed, one after another
// so a skill opens offline and at once. A skill whose upstream licence does not allow redistribution (AGPL, GPL, source-available and unknown licences) keeps offset -1: it is
// still found and still opens, from the pinned commit of the pool, and its text is not copied into the extension. Skills the pool itself marks "offensive" are left out.
// Files that sit beside a SKILL.md (references, templates) are not bundled: they are fetched from the pinned commit when a skill points to them.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repo = process.argv[2];
if (!repo || !existsSync(join(repo, 'skills_index.json'))) {
  console.error('usage: node scripts/build-aas-bundle.mjs <path to a clone of sickn33/agentic-awesome-skills>');
  process.exit(2);
}
const sha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(repo, 'skills_index.json'), 'utf8'));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// Licences that allow the text to travel with the extension (with the attribution in NOTICE). "none" is a skill with no licence of its own: the pool's licence for its content applies.
const REDISTRIBUTABLE = /^(?:none|mit|mit-0|mit license|mit license|apache-2\.0|apache-2\.0 license|bsd-3-clause|bsd-3-clause license|3-clause bsd license|cc0-1\.0|cc-by-4\.0|cc-by-3\.0|mit or apache-2\.0)$/i;

const rows = [];
const chunks = [];
let offset = 0;
let dropped = 0;
let notBundled = 0;
for (const s of raw) {
  if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(s.id)) { dropped++; continue; }
  if (s.risk === 'offensive') { dropped++; continue; }
  const file = join(repo, 'skills', s.id, 'SKILL.md');
  if (!existsSync(file)) { dropped++; continue; }
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => clean(m[1]).replace(/[`*_]/g, '')).filter(Boolean).slice(0, 40).join(' | ').slice(0, 260);
  const licence = clean(s.license ?? s.licence ?? 'none') || 'none';
  let at = -1;
  let length = 0;
  if (REDISTRIBUTABLE.test(licence) && !/agpl|gpl|fsl|treg/i.test(licence)) {
    const gz = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
    chunks.push(gz);
    at = offset;
    length = gz.length;
    offset += gz.length;
  } else notBundled++;
  rows.push([s.id, clean(s.category).slice(0, 30), clean(s.name).slice(0, 80), clean(s.description).slice(0, 220), s.risk === 'critical' ? 1 : 0, headings, at, length]);
}
const bin = Buffer.concat(chunks);
mkdirSync(resolve(here, '../public/pool'), { recursive: true });
writeFileSync(resolve(here, '../public/pool/skills.bin'), bin);
const digest = createHash('sha256').update(bin).digest('hex');
writeFileSync(
  resolve(here, '../src/agent/data/aas-index.json'),
  JSON.stringify({ repo: 'sickn33/agentic-awesome-skills', sha, licence: 'MIT (code), CC BY 4.0 (content); each skill keeps its upstream licence', count: rows.length, dropped, bundled: rows.length - notBundled, notBundled, binBytes: bin.length, binSha256: digest, rows }),
);
console.log(`${rows.length} skills (${dropped} left out); ${rows.length - notBundled} bundled in ${(bin.length / 1e6).toFixed(1)} MB; ${notBundled} stay remote because of their licence; pinned ${sha.slice(0, 10)}`);
