import { z } from 'zod';
const texts = z.array(z.string().min(1)).min(1);
export const journeyIds = ['CHAT', 'WEB-RESEARCH', 'EXISTING-REPO-CODING', 'NEW-SAAS', 'BUSINESS-READ', 'BUSINESS-WRITE', 'MIXED-MULTI-OUTCOME', 'DOCUMENTS', 'WORK-PACK', 'AI-EMPLOYEE', 'PAID-ANDROID-PUBLISH', 'SEO-DRIVE'].map(id => `GJ-${id}`);
export const goldenMatrixSchema = z.strictObject({
  version: z.literal('1.0'), sourceSha: z.string().regex(/^[0-9a-f]{40}$/), scope: z.literal('ACCEPTANCE_CONTRACTS_NOT_PRODUCT_COMPLETION'),
  journeys: z.array(z.strictObject({
    id: z.enum(journeyIds), fixtureId: z.string().min(1), userIntent: z.string().min(1),
    tenant: z.strictObject({ownerId: z.string().uuid(), outsiderId: z.string().uuid(), realm: z.literal('ISOLATED_FIXTURE_ONLY')}),
    requirements: texts, prerequisiteConnections: texts, capabilityClasses: texts,
    planningGraph: z.array(z.strictObject({id: z.string().min(1), operation: z.string().min(1), dependencies: z.array(z.string())})).min(1),
    authorityPoints: z.array(z.strictObject({authority: z.string().min(1), boundary: z.string().min(1)})).min(1),
    budgetRules: texts, durableState: texts, providerSandboxBehavior: z.string().min(1),
    verificationEvidence: z.array(z.strictObject({id: z.string().min(1), kind: z.string().min(1), requirement: z.string().min(1)})).min(1),
    uiEventsBlocks: texts, completionSemantics: z.string().min(1), timeoutRetry: z.string().min(1), cleanup: z.string().min(1),
    positiveAssertions: texts, negativeAssertions: texts, implementationPaths: z.array(z.string()),
    state: z.enum(['PASS', 'FAIL', 'BLOCKED_KNOWN_GAP', 'NOT_APPLICABLE']),
    blockers: z.array(z.strictObject({requirementIds: texts, ownerCommands: texts, missingCapability: z.string().min(1)})),
    goal: z.record(z.string(), z.unknown()),
  })),
});
export const goldenJsonSchema = z.toJSONSchema(goldenMatrixSchema, {target: 'draft-7'});

export function validateGoldenMatrix(value, requirementIds, pathExists = () => true) {
  const matrix = goldenMatrixSchema.parse(value), ids = new Set(), fixtures = new Set();
  for (const journey of matrix.journeys) {
    if (ids.has(journey.id) || fixtures.has(journey.fixtureId)) throw new Error('Duplicate journey/fixture');
    ids.add(journey.id); fixtures.add(journey.fixtureId);
    if (journey.tenant.ownerId === journey.tenant.outsiderId) throw new Error('Tenant isolation fixture actors must differ');
    for (const id of [...journey.requirements, ...journey.blockers.flatMap(row => row.requirementIds)]) if (!requirementIds.has(id)) throw new Error('Unknown journey requirement');
    if (journey.implementationPaths.some(path => !pathExists(path))) throw new Error('Unverified implementation path');
    if (journey.state === 'BLOCKED_KNOWN_GAP' && !journey.blockers.length) throw new Error('Blocked journey has no owned, precise gap');
    if (journey.state === 'PASS') throw new Error('Contracts cannot grant PASS: independent execution evidence must be reconciled separately');
    const nodes = new Map(journey.planningGraph.map(node => [node.id, node]));
    if (nodes.size !== journey.planningGraph.length) throw new Error('Duplicate graph node');
    const visiting = new Set(), visited = new Set();
    const walk = id => { if (visiting.has(id)) throw new Error('Cyclic journey graph'); if (visited.has(id)) return;
      const node = nodes.get(id); if (!node) throw new Error('Missing graph dependency'); visiting.add(id); node.dependencies.forEach(walk); visiting.delete(id); visited.add(id); };
    for (const id of nodes.keys()) walk(id);
  }
  if (ids.size !== journeyIds.length || journeyIds.some(id => !ids.has(id))) throw new Error('Missing mandatory journey');
  return {result: 'PASS_CONTRACT_INTEGRITY_ONLY', journeyStates: Object.fromEntries(['PASS','FAIL','BLOCKED_KNOWN_GAP','NOT_APPLICABLE'].map(state => [state, matrix.journeys.filter(row => row.state === state).length])), liveJourneysCertified: 0};
}
