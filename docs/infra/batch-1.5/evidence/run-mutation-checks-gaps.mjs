#!/usr/bin/env node
/**
 * Injected-defect checks for the closure of Gap A (multipart migration), Gap B (run-output artifacts) and the new engine rules.
 * Each defect is applied to a COPY-RESTORED source file, the covering tests must FAIL, and the file is restored byte-for-byte
 * (also on crash). Equivalent mutants are avoided by choosing defects that remove the only check of a property.
 * Cross-platform (no python/bash). Results: logs/08-mutation-checks-gaps.log (+ .json).
 *
 *   node docs/infra/batch-1.5/evidence/run-mutation-checks-gaps.mjs      (STORAGE_TEST_DATABASE_URL enables the PostgreSQL-backed ones)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../../../../backend');
const out = path.join(here, 'logs'); mkdirSync(out, { recursive: true });
const hasPg = !!process.env.STORAGE_TEST_DATABASE_URL;
const S = 'src/storage/storageService.ts', E = 'src/storage/migration/engine.ts', R = 'src/storage/migration/sources.ts';
const LO = 'src/storage/migration/largeObject.test.ts', RO = 'src/storage/migration/runOutputArtifacts.integration.test.ts', EN = 'src/storage/migration/engine.test.ts';
const mutants = [
  { name: 'multipart: stored parts trusted without comparing MD5 to the source', file: S, old: "have.etag.replace(/\"/g, '') === md5.replace(/\"/g, '')", neu: 'true', tests: [LO] },
  { name: 'multipart: provider part ETag not compared to the MD5 of what was sent', file: S, old: "if (hex.test(etag) && etag.replace(/\"/g, '').toLowerCase() !== md5.replace(/\"/g, '')) throw", neu: 'if (false) throw', tests: [LO] },
  { name: 'multipart: stream length vs measured size not checked', file: S, old: 'if (total !== input.size) throw', neu: 'if (false) throw', tests: [LO] },
  { name: 'multipart: part-count check removed', file: S, old: 'if (ordered.length !== parts) throw', neu: 'if (false) throw', tests: [LO] },
  { name: 'engine: large objects no longer routed to multipart', file: E, old: 'opened.size > this.#d.maxStreamCopyBytes', neu: 'false', tests: [LO] },
  { name: 'engine: source not re-checked after the copy (changed-source acceptance)', file: E, old: 'if (!again || again.fingerprint !== opened.fingerprint) {', neu: 'if (false) {', tests: [LO] },
  { name: 'engine: adapter block reason flattened', file: E, old: "if (it.sourceFingerprint?.startsWith('unrecoverable:'))", neu: 'if (false)', tests: [RO], pg: true },
  { name: 'engine: permanent destination NOT_FOUND retried instead of BLOCKED', file: E, old: "'BAD_STATE', 'NOT_FOUND', 'INVALID_REQUEST'", neu: "'BAD_STATE'", tests: [RO], pg: true },
  { name: 'run-output: credential NAME detection disabled', file: R, old: 'SECRET_NAME.test(name) ||', neu: 'false ||', tests: [RO], pg: true },
  { name: 'run-output: non-terminal runs included', file: R, old: "status in ('completed','failed') and ", neu: '', tests: [RO], pg: true },
  { name: 'run-output: declared-size mismatch accepted', file: R, old: "else if (typeof raw.sizeBytes === 'number' && raw.sizeBytes !== bytes.length) blockedReason = 'DECLARED_SIZE_MISMATCH';", neu: '', tests: [RO], pg: true },
  { name: 'run-output: duplicate ids not blocked', file: R, old: "if ((counts.get(raw.id) ?? 0) > 1) blockedReason = 'DUPLICATE_ARTIFACT_ID';", neu: "if (false) blockedReason = 'DUPLICATE_ARTIFACT_ID';", tests: [RO], pg: true },
];

const results = [];
for (const m of mutants) {
  if (m.pg && !hasPg) { results.push({ name: m.name, verdict: 'NOT_RUN (needs STORAGE_TEST_DATABASE_URL)' }); continue; }
  const file = path.join(backend, m.file);
  const original = readFileSync(file);
  let text = original.toString('utf8');
  const crlf = text.includes('\r\n');
  const old = crlf ? m.old.replace(/\n/g, '\r\n') : m.old;
  if (!text.includes(old)) { results.push({ name: m.name, verdict: 'ERROR: mutation target not found' }); continue; }
  try {
    writeFileSync(file, text.replace(old, () => (crlf ? m.neu.replace(/\n/g, '\r\n') : m.neu)));
    const p = spawnSync('npx', ['tsx', '--test', ...m.tests], { cwd: backend, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 26 });
    const t = `${p.stdout}\n${p.stderr}`;
    const fail = Number((t.match(/^# fail (\d+)/m) ?? [])[1] ?? 0), pass = Number((t.match(/^# pass (\d+)/m) ?? [])[1] ?? 0);
    const compile = /error TS\d+|SyntaxError|Transform failed/.test(t) && pass === 0;
    results.push({ name: m.name, verdict: compile ? 'INVALID_MUTANT (did not compile)' : fail > 0 ? 'CAUGHT' : 'SURVIVED', pass, fail });
  } finally {
    writeFileSync(file, original);
  }
}
const lines = results.map((r) => `${r.verdict.padEnd(34)} | ${r.name}${r.pass !== undefined ? ` | pass=${r.pass} fail=${r.fail}` : ''}`);
writeFileSync(path.join(out, '08-mutation-checks-gaps.log'), `${lines.join('\n')}\n`);
writeFileSync(path.join(out, '08-mutation-checks-gaps.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log(lines.join('\n'));
const survived = results.filter((r) => r.verdict === 'SURVIVED' || r.verdict.startsWith('INVALID') || r.verdict.startsWith('ERROR'));
const git = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'backend/src'], { cwd: path.resolve(backend, '..'), encoding: 'utf8' }).stdout.trim();
console.log(git ? `WARNING: tracked source differs from HEAD:\n${git}` : 'restored: no injected defect remains in tracked source');
process.exit(survived.length ? 1 : 0);
