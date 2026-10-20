import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const source = 'f011d7e1a8e29970e883b921e2a36fa672a8107a', runId = 39439419199, jobId = 118685013898;
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const run = JSON.parse(gh('api', `repos/Xroga/xroga.com/actions/runs/${runId}`));
const job = JSON.parse(gh('api', `repos/Xroga/xroga.com/actions/jobs/${jobId}`));
assert.equal(run.head_sha, source); assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
assert.equal(job.run_id, runId); assert.equal(job.status, 'completed'); assert.equal(job.conclusion, 'success');
assert.equal(job.steps.find(s => s.name === 'Real tenant authorization and concurrency integration')?.conclusion, 'success');
const log = gh('api', `repos/Xroga/xroga.com/actions/jobs/${jobId}/logs`, '--allow-escape-sequences');
assert.ok(log.includes(source), 'The actual checkout must identify the exact source');
const tests = [
  'real canonical business confirmation claims once and persists exact dispatch and terminal receipts with a synthetic provider',
  'real business dispatch admission rejects foreign, changed, cancelled, expired and replayed claims and browser roles',
  'real business dispatch rechecks expiry, cancellation and plan after lock waits and rolls admission back',
  'real business dispatch observes a read-only policy committed during its final policy lock wait',
];
for (const name of tests) assert.ok(log.split('\n').some(line => /\bok \d+ - /.test(line) && line.trimEnd().endsWith(name)), `Passing actual test not observed: ${name}`);
assert.ok(/# tests 208/.test(log)); assert.ok(/# pass 208/.test(log));
const receipt = { version: 1, scope: 'AUTHENTICATED_EXACT_SOURCE_BUSINESS_AUTHORITY_SUBSET_NOT_PHASE3_ACCEPTANCE',
  sourceSha: source, runId, jobId, workflow: run.name, conclusion: run.conclusion,
  jobLogSha256: createHash('sha256').update(log).digest('hex'), logNormalization: 'CRLF_TO_LF_WITH_GH_ALLOW_ESCAPE_SEQUENCES',
  passedTests: tests, fullSecuritySuite: { tests: 208, passed: 208, failed: 0, skipped: 0 },
  database: 'REAL_DISPOSABLE_SUPABASE', provider: 'INTERCEPTED_SYNTHETIC_NOT_LIVE',
  productionChanges: false, phase3Accepted: false };
const directory = 'docs/xroga/evidence/command-008'; mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/business-authority-receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
