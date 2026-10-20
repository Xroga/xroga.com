// Bounded source-position refresh, not security certification. The accepted
// Phase 2 Git snapshot and its external proof are never modified by this tool.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { discoverPersistenceCalls } from './audit-tenant-policies.mjs';
const accepted = 'a21a82029276d38d53c9e17c580a15f57b653fe3';
const paths = ['backend/src/routes/phase1.ts', 'backend/src/services/integrations/businessActionConfirmations.ts',
  'backend/src/services/integrations/credentialEnvelope.ts', 'frontend/src/lib/formatAiMarkdown.tsx'];
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const historical = path => execFileSync('git', ['show', `${accepted}:${path}`], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const registryPath = 'docs/xroga/security/caller-reviews.json';
const original = JSON.parse(historical(registryPath)), current = JSON.parse(read(registryPath));
const remappings = new Map(), sourceHashes = new Map(), newCalls = [];
for (const path of paths) {
  const before = discoverPersistenceCalls(path, historical(path)), after = discoverPersistenceCalls(path, read(path));
  sourceHashes.set(path, hash(read(path)));
  for (const old of before) {
    const peers = before.filter(c => c.enclosing === old.enclosing && c.kind === old.kind && c.target === old.target);
    const next = after.filter(c => c.enclosing === old.enclosing && c.kind === old.kind && c.target === old.target);
    assert.equal(peers.length, next.length, `Changed semantic boundary requires explicit review: ${path}:${old.enclosing}:${old.target}`);
    remappings.set(old.id, next[peers.findIndex(c => c.id === old.id)].id);
  }
  newCalls.push(...after.filter(c => ![...remappings.values()].includes(c.id)));
}
const note = 'Phase3 extends the existing confirmation boundary with issued-actor canonical authority and final dispatch admission. Prior receipts certify the accepted Phase2 snapshot only. Current-source database and integrated regression proof is required, not inferred from this source-position refresh.';
const changed = original.reviews.filter(r => paths.includes(r.path)).map(record => ({ ...record,
  sourceSha256: sourceHashes.get(record.path), callIds: record.callIds.map(id => { assert.ok(remappings.has(id)); return remappings.get(id); }),
  reason: `${record.reason} ${note}`,
  ...(record.path.endsWith('/credentialEnvelope.ts') ? { evidence: [
    { path: record.path, marker: 'export function sealCredentialEnvelope' },
    { path: record.path, marker: 'export function openCredentialEnvelope' },
  ] } : {}),
  acceptedPhaseTwoReview: { sourceSha: accepted, sourceSha256: record.sourceSha256, callIds: record.callIds },
}));
for (const call of newCalls) {
  assert.equal(call.path, paths[1]);
  assert.ok(['authorize_business_action_dispatch', 'cancel_business_action_confirmation', 'getSupabaseAdmin'].includes(call.target));
  changed.push({ path: call.path, sourceSha256: call.sourceSha256, callIds: [call.id], disposition: 'REVIEWED_GAP',
    authority: 'The dispatch closure captures the original issued actor and exact claimed owner/plan. The private cancellation helper is reachable only from authenticated owner-filtered cancellation. Service-only RPCs bind owner and exact row under lock. Database verification remains pending for this changed source.',
    reason: 'New Phase3 dispatch and in-flight revocation obligations are retained as explicit missing proof, not invented vulnerabilities or current-source security certificates. Unit and synthetic SQL checks cannot replace real disposable concurrency and authenticated CI.',
    evidence: [{ path: 'backend/src/security/businessAuthority.local.integration.ts', marker: 'registerBusinessAuthorityTests' }],
    phase3Requirements: ['XB01-C008-AC02', 'XB01-C008-AC07'],
  });
}
const pureModules = [
  ['backend/src/security/authority/digest.ts', 'export function canonicalAuthorityValue'],
  ['backend/src/services/integrations/cryptoProvider.ts', 'export class DevelopmentCryptoProvider'],
  ['backend/src/services/integrations/credentialVault.ts', 'export class CredentialVault'],
];
for (const [path, marker] of pureModules) {
  const calls = discoverPersistenceCalls(path, read(path));
  assert.ok(calls.length > 0 && calls.every(c => c.kind === 'TABLE_OR_BUCKET_CANDIDATE'));
  changed.push({ path, sourceSha256: hash(read(path)), callIds: calls.map(c => c.id), disposition: 'NOT_PERSISTENCE',
    authority: 'Inspected each exact receiver in this module. Buffer.from and Array.from perform only local UTF8/base64 encoding, authenticated crypto buffer construction, JSON envelope encoding or dense local array construction. No receiver is a database client, bucket or provider transport.',
    reason: 'Only these built-in local conversions are excluded from persistence. This does not certify key custody, credential writer cutover, an external effect, rotation persistence, any database lifecycle or a complete Command008/009 criterion.',
    evidence: [{ path, marker }],
  });
}
current.reviews = [...current.reviews.filter(r => ![...paths, ...pureModules.map(([p]) => p)].includes(r.path)), ...changed];
const decisionsPath = 'docs/xroga/batch-1/phases/PHASE-2-REVIEW-DECISIONS.json';
const decisions = JSON.parse(read(decisionsPath));
const originalDecisions = JSON.parse(historical(decisionsPath));
const oldDecision = originalDecisions.decisions.find(d => d.packetId === 'B1-P2-84b9011a0d2b4754');
const index = decisions.decisions.findIndex(d => d.packetId === oldDecision.packetId);
assert.ok(index >= 0);
decisions.decisions[index] = { ...oldDecision, sourceSha256: sourceHashes.get(paths[1]),
  phase3SourceDelta: { acceptedPhaseTwoSource: accepted, historicalSourceSha256: oldDecision.sourceSha256,
    scope: note, currentSourceCertification: 'NOT_INFERRED_REQUIRES_REGRESSION' },
  current007Evidence: { ...oldDecision.current007Evidence,
    verifiedCurrentCallerIds: oldDecision.current007Evidence.verifiedCurrentCallerIds.map(id => remappings.get(id) ?? id),
    remainingCurrentCallerIds: oldDecision.current007Evidence.remainingCurrentCallerIds.map(id => remappings.get(id) ?? id),
  },
};
const outputs = new Map([[registryPath, current], [decisionsPath, decisions],
  ['docs/xroga/security/phase-three-authority-delta.json', { version: 1, scope: 'SOURCE_POSITION_DELTA_NOT_SECURITY_CERTIFICATION',
    acceptedPhaseTwoSource: accepted, remappings: [...remappings].map(([previousCallerId, currentCallerId]) => ({ previousCallerId, currentCallerId })),
    newCalls, completion: 'ACTUAL_DISPOSABLE_AND_SOURCE_BOUND_REGRESSION_PENDING', productionEffects: false }]]);
for (const [path, value] of outputs) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--write')) writeFileSync(path, text);
  else assert.equal(read(path), text, `Source-position delta drift: ${path}`);
}
console.log(JSON.stringify({ result: 'SOURCE_POSITION_DELTA_ONLY', mapped: remappings.size, newMissingProof: newCalls.length, acceptedSourceUnchanged: accepted }));
