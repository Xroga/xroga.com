// Bounded source-position refresh, not security certification. The accepted
// Phase 2 Git snapshot and its external proof are never modified by this tool.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { discoverPersistenceCalls } from './audit-tenant-policies.mjs';
const accepted = 'a21a82029276d38d53c9e17c580a15f57b653fe3';
const paths = ['backend/src/routes/phase1.ts', 'backend/src/services/integrations/businessActionConfirmations.ts',
  'backend/src/services/integrations/credentialEnvelope.ts', 'frontend/src/lib/formatAiMarkdown.tsx',
  'backend/src/ai/providerBudget.ts', 'backend/src/operations/operationsService.ts',
  'backend/src/services/integrations/githubAuth.ts', 'backend/src/services/integrations/githubTokenStore.ts',
  'backend/src/services/integrations/oauthPkceStore.ts', 'backend/src/services/integrations/userProviderKeys.ts',
  'backend/src/services/integrations/vercelAuth.ts', 'backend/src/synthesis/projectRuntime/secretManager.ts',
  'backend/src/synthesis/projectRuntime/store.ts'];
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const historical = path => execFileSync('git', ['show', `${accepted}:${path}`], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const registryPath = 'docs/xroga/security/caller-reviews.json';
const original = JSON.parse(historical(registryPath)), current = JSON.parse(read(registryPath));
const remappings = new Map(), sourceHashes = new Map(), newCalls = [], retiredCalls = [];
for (const path of paths) {
  const before = discoverPersistenceCalls(path, historical(path)), after = discoverPersistenceCalls(path, read(path));
  sourceHashes.set(path, hash(read(path)));
  for (const old of before) {
    const peers = before.filter(c => c.enclosing === old.enclosing && c.kind === old.kind && c.target === old.target);
    const next = after.filter(c => c.enclosing === old.enclosing && c.kind === old.kind && c.target === old.target);
    const ordinal = peers.findIndex(c => c.id === old.id);
    if (next[ordinal]) remappings.set(old.id, next[ordinal].id);
    else retiredCalls.push({ ...old, reason: 'The accepted Phase2 persistence expression was removed during the Phase3 credential or authority cutover. No replacement operation is inferred and no prior acceptance scope is extended.' });
  }
  newCalls.push(...after.filter(c => ![...remappings.values()].includes(c.id)));
}
const note = 'Phase3 extends the existing confirmation boundary with issued-actor canonical authority and final dispatch admission. Prior receipts certify the accepted Phase2 snapshot only. Current-source database and integrated regression proof is required, not inferred from this source-position refresh.';
const changed = original.reviews.filter(r => paths.includes(r.path)).map(record => {
  const structuredCallIds = record.structuredOrigin?.callIds.flatMap(id => remappings.has(id) ? [remappings.get(id)] : []);
  return { ...record,
    sourceSha256: sourceHashes.get(record.path), callIds: record.callIds.flatMap(id => remappings.has(id) ? [remappings.get(id)] : []),
    reason: `${record.reason} ${note}`,
    ...(record.path.endsWith('/credentialEnvelope.ts') ? { evidence: [
      { path: record.path, marker: 'export function sealCredentialEnvelope' },
      { path: record.path, marker: 'export function openCredentialEnvelope' },
    ] } : {}),
    acceptedPhaseTwoReview: { sourceSha: accepted, sourceSha256: record.sourceSha256, callIds: record.callIds },
    ...(record.structuredOrigin ? { structuredOrigin: { ...record.structuredOrigin, callIds: structuredCallIds,
      id: `OB-${hash(`${record.path}:${[...structuredCallIds].sort().join(',')}`).slice(0, 16)}` } } : {}),
  };
}).filter(record => record.callIds.length > 0);
for (const call of newCalls) {
  if (call.path === paths[1]) {
    assert.ok(['authorize_business_action_dispatch', 'cancel_business_action_confirmation', 'getSupabaseAdmin'].includes(call.target));
    changed.push({ path: call.path, sourceSha256: call.sourceSha256, callIds: [call.id], disposition: 'REVIEWED_GAP',
      authority: 'The dispatch closure captures the original issued actor and exact claimed owner/plan. The private cancellation helper is reachable only from authenticated owner-filtered cancellation. Service-only RPCs bind owner and exact row under lock. Database verification remains pending for this changed source.',
      reason: 'New Phase3 dispatch and in-flight revocation obligations are retained as explicit missing proof, not invented vulnerabilities or current-source security certificates. Unit and synthetic SQL checks cannot replace real disposable concurrency and authenticated CI.',
      evidence: [{ path: 'backend/src/security/businessAuthority.local.integration.ts', marker: 'registerBusinessAuthorityTests' }],
      phase3Requirements: ['XB01-C008-AC02', 'XB01-C008-AC07'],
    });
  } else if (call.path === paths[4]) {
    assert.ok(['reserve_operations_provider_budget', 'ensure_xroga_free_cycle', 'getSupabaseAdmin'].includes(call.target));
    changed.push({ path: call.path, sourceSha256: call.sourceSha256, callIds: [call.id], disposition: 'REVIEWED_GAP',
      authority: 'The Operations-only reservation boundary receives the issued actor and immutable admitted action. Its service-only database routine locks and rechecks actor membership, owner, project, approval, lease, action snapshot, normal entitlement and the admitted action ceiling before returning an exact owner-bound reservation receipt.',
      reason: 'This new Phase3 spend boundary is retained as current-source work until the disposable database and integrated regression jobs pass. It does not change or extend the accepted Phase2 conclusion for the earlier provider-budget callers.',
      evidence: [{ path: 'backend/src/operations/operationsProviderBudget.local.integration.ts', marker: 'registerOperationsProviderBudgetTests' }],
      phase3Requirements: ['XB01-C008-AC05', 'XB01-C008-AC06', 'XB01-C008-AC07'],
    });
  } else {
    changed.push({ path: call.path, sourceSha256: call.sourceSha256, callIds: [call.id], disposition: 'REVIEWED_GAP',
      authority: 'This persistence expression belongs to the Phase3 authority or CredentialVault cutover. The exact caller remains bound to current source and retains its original actor, owner, project and parent checks. It receives no inherited Phase2 certification.',
      reason: 'Current-source Phase3 tests and source-bound CI are required for this added expression. Recording it prevents a stale or unexplained service-role boundary while keeping all original acceptance scopes unchanged.',
      evidence: [{ path: call.path, marker: call.enclosing }],
      phase3Requirements: call.path.includes('operations') ? ['XB01-C008-AC02', 'XB01-C008-AC07'] : ['XB01-C009-AC03', 'XB01-C009-AC07', 'XB01-C009-AC08'],
    });
  }
}
const pureModules = [
  ['backend/src/security/authority/digest.ts', 'export function canonicalAuthorityValue'],
  ['backend/src/services/integrations/cryptoProvider.ts', 'export class DevelopmentCryptoProvider'],
  ['backend/src/services/integrations/credentialVault.ts', 'export class CredentialVault'],
  ['backend/src/services/integrations/credentialVaultRuntime.ts', 'export function runtimeCredentialVault'],
  ['backend/src/services/integrations/googleCloudKmsCryptoProvider.ts', 'export class GoogleCloudKmsCryptoProvider'],
];
for (const [path, marker] of pureModules) {
  const calls = discoverPersistenceCalls(path, read(path));
  assert.ok(calls.length > 0 && calls.every(c => c.kind === 'TABLE_OR_BUCKET_CANDIDATE'));
  changed.push({ path, sourceSha256: hash(read(path)), callIds: calls.map(c => c.id), disposition: 'NOT_PERSISTENCE',
    authority: 'Inspected each exact receiver in this module. Buffer.from, Array.from and strictBase64 perform only local UTF8/base64 encoding, authenticated crypto buffer construction, response validation, JSON envelope encoding or dense local array construction. No classified receiver is a database client, bucket or provider transport. The Google Cloud KMS transport itself remains an explicit Command009 custody boundary and is not excluded by this disposition.',
    reason: 'Only these built-in local conversions are excluded from persistence. This does not certify key custody, credential writer cutover, an external effect, rotation persistence, any database lifecycle or a complete Command008/009 criterion.',
    evidence: [{ path, marker }],
  });
}
current.reviews = [...current.reviews.filter(r => ![...paths, ...pureModules.map(([p]) => p)].includes(r.path)), ...changed];
const decisionsPath = 'docs/xroga/batch-1/phases/PHASE-2-REVIEW-DECISIONS.json';
const decisions = JSON.parse(read(decisionsPath));
const originalDecisions = JSON.parse(historical(decisionsPath));
const frozenPackets = new Map(JSON.parse(read('docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json')).packets.map(packet => [packet.id, packet.baselinePath]));
const packetPaths = new Map();
for (const mapping of originalDecisions.callerRemappings ?? []) if (paths.includes(mapping.path)) packetPaths.set(mapping.reviewPacketId, mapping.path);
for (const [packetId, path] of packetPaths) {
  const oldDecision = originalDecisions.decisions.find(d => d.packetId === packetId);
  const index = decisions.decisions.findIndex(d => d.packetId === packetId);
  assert.ok(oldDecision && index >= 0);
  decisions.decisions[index] = { ...oldDecision, sourceSha256: sourceHashes.get(path),
    phase3SourceDelta: { acceptedPhaseTwoSource: accepted, historicalSourceSha256: oldDecision.sourceSha256,
      scope: note, currentSourceCertification: 'NOT_INFERRED_REQUIRES_REGRESSION' },
    ...(oldDecision.current007Evidence ? { current007Evidence: { ...oldDecision.current007Evidence,
      verifiedCurrentCallerIds: oldDecision.current007Evidence.verifiedCurrentCallerIds.map(id => remappings.get(id) ?? id),
      remainingCurrentCallerIds: oldDecision.current007Evidence.remainingCurrentCallerIds.map(id => remappings.get(id) ?? id),
    } } : {}),
  };
}
decisions.decisions = decisions.decisions.map(decision => ({ ...decision,
  ...(sourceHashes.has(frozenPackets.get(decision.packetId)) ? {
    sourceSha256: sourceHashes.get(frozenPackets.get(decision.packetId)),
    phase3SourceDelta: { acceptedPhaseTwoSource: accepted, historicalSourceSha256: originalDecisions.decisions.find(item => item.packetId === decision.packetId)?.sourceSha256,
      scope: note, currentSourceCertification: 'NOT_INFERRED_REQUIRES_REGRESSION' },
    ...(decision.current007Evidence ? { current007Evidence: { ...decision.current007Evidence,
      verifiedCurrentCallerIds: decision.current007Evidence.verifiedCurrentCallerIds.map(id => remappings.get(id) ?? id),
      remainingCurrentCallerIds: decision.current007Evidence.remainingCurrentCallerIds.map(id => remappings.get(id) ?? id),
    } } : {}),
  } : {}),
  ...(decision.relatedSourceBindings ? { relatedSourceBindings: decision.relatedSourceBindings.map(binding =>
    sourceHashes.has(binding.path) ? { ...binding, sha256: sourceHashes.get(binding.path) } : binding) } : {}),
}));
const retiredAcceptedIds = new Set(retiredCalls.map(call => call.id));
const retiredPhaseOneMappings = [];
decisions.callerRemappings = originalDecisions.callerRemappings.flatMap(mapping => {
  if (!paths.includes(mapping.path)) return [mapping];
  const next = remappings.get(mapping.currentCallerId);
  if (next) return [{ ...mapping, currentCallerId: next }];
  if (retiredAcceptedIds.has(mapping.currentCallerId)) {
    retiredPhaseOneMappings.push({ ...mapping, acceptedPhaseTwoCallerId: mapping.currentCallerId,
      acceptedPhaseTwoSource: accepted, reason: `${mapping.reason} The exact persistence expression is absent from current Phase3 source.` });
    return [];
  }
  assert.fail(`Unreconciled Phase2 caller mapping: ${mapping.path}:${mapping.currentCallerId}`);
});
decisions.phase3RetiredCallerRemappings = retiredPhaseOneMappings;
const outputs = new Map([[registryPath, current], [decisionsPath, decisions],
  ['docs/xroga/security/phase-three-authority-delta.json', { version: 1, scope: 'SOURCE_POSITION_DELTA_NOT_SECURITY_CERTIFICATION',
    acceptedPhaseTwoSource: accepted, remappings: [...remappings].map(([previousCallerId, currentCallerId]) => ({ previousCallerId, currentCallerId })),
    retiredCalls, newCalls, completion: 'ACTUAL_DISPOSABLE_AND_SOURCE_BOUND_REGRESSION_PENDING', productionEffects: false }]]);
for (const [path, value] of outputs) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--write')) writeFileSync(path, text);
  else assert.equal(read(path), text, `Source-position delta drift: ${path}`);
}
console.log(JSON.stringify({ result: 'SOURCE_POSITION_DELTA_ONLY', mapped: remappings.size, retired: retiredCalls.length, newMissingProof: newCalls.length, acceptedSourceUnchanged: accepted }));
