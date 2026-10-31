// Scoped continuation of existing reviews. Refuse to rebind changed transports.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = 'C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-batch15-batch2-activation';
const base = 'e41e6cdbbdf1a273200a0afe73c9871733191be8';
const path = 'backend/src/workers/browserRunDispatch.ts';
const read = p => readFileSync(root + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const hash = v => createHash('sha256').update(v).digest('hex');
const save = (p, v) => writeFileSync(root + '/' + p, JSON.stringify(v, null, 2) + '\n');
const before = execFileSync('git', ['show', base + ':' + path], { cwd: root, encoding: 'utf8' });
const after = read(path);
const { inspectEgress } = await import(pathToFileURL(root + '/scripts/security/audit-egress-callers.mjs'));
const a = inspectEgress(path, before), b = inspectEgress(path, after);
if (a.length !== b.length || a.some((row, i) => row.id !== b[i].id || row.callSha256 !== b[i].callSha256)) throw Error('Transport changed, fresh semantic review required');
const reviewPath = 'docs/xroga/security/egress-caller-reviews.json';
const reviews = JSON.parse(read(reviewPath));
for (const row of reviews.reviews.filter(r => a.some(x => x.id === r.id))) {
  if (row.sourceFileSha256 !== hash(before)) throw Error('Unexpected original egress source binding');
  row.sourceFileSha256 = hash(after);
  for (const evidence of row.evidence) if (evidence.path === 'backend/src/workers/browserRunDispatch.test.ts') evidence.sha256 = hash(read(evidence.path));
}
save(reviewPath, reviews);
const { discoverPersistenceCalls } = await import(pathToFileURL(root + '/scripts/security/audit-tenant-policies.mjs'));
const oldCalls = discoverPersistenceCalls(path, before), newCalls = discoverPersistenceCalls(path, after);
if (oldCalls.length !== 1 || newCalls.length !== 1 || !before.includes("Buffer.from(JSON.stringify({ runId })).toString('base64')") || !after.includes("Buffer.from(JSON.stringify({ runId })).toString('base64')")) throw Error('Byte conversion requires fresh review');
const registryPath = 'docs/xroga/security/caller-reviews.json';
const registry = JSON.parse(read(registryPath));
const row = registry.reviews.find(r => r.path === path);
if (row.disposition !== 'NOT_PERSISTENCE' || row.callIds.length !== 1 || row.callIds[0] !== oldCalls[0].id) throw Error('Unexpected original conversion scope');
row.sourceSha256 = hash(after);
row.callIds = [newCalls[0].id];
save(registryPath, registry);
console.log('UNCHANGED_TRANSPORT_AND_BYTE_CONVERSION_BINDINGS_REFRESHED');
