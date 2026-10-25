import { z } from 'zod';

export const states = ['IMPLEMENTED_AND_REACHABLE', 'IMPLEMENTED_BUT_UNVERIFIED', 'PARTIAL', 'PLACEHOLDER', 'DEAD_OR_UNREACHABLE', 'PROPOSED_ONLY', 'UNKNOWN_BLOCKED'];
const strings = z.array(z.string());
const location = { sourcePath: z.string(), line: z.number().int().positive() };
const registration = z.object({
  id: z.string(), ...location, receiver: z.string(), method: z.string(), path: z.string().nullable(),
  handlers: strings, scope: z.enum(['module', 'conditional', 'function']), functionName: z.string(), inlineResponse: z.boolean(),
}).strict();
export const inventorySchema = z.object({
  version: z.literal('1.0'),
  identity: z.object({ repository: z.string(), branch: z.string(), sha: z.string().regex(/^[a-f0-9]{40}$/),
    sourceTimestampUtc: z.string(), auditStartedUtc: z.string(), initialWorkingTreeState: z.string(),
    sourceTreeState: z.string(), node: z.string(), npm: z.string(), lockfiles: strings, runtimeDeclarations: strings }).strict(),
  requiredPaths: z.array(z.object({ sourcePath: z.string(), presence: z.enum(['PRESENT', 'ABSENT']), reason: z.string() }).strict()),
  surfaces: z.array(z.object({
    id: z.string(), subsystem: z.string(), sourcePath: z.string(), sha256: z.string(), symbols: strings,
    imports: strings, runtimeImports: strings, entryPoints: strings, callers: strings, reachable: z.boolean(),
    persistenceDependencies: strings, externalProviderDependencies: strings, authBoundary: strings,
    tenantBoundary: strings, approvalBoundary: strings, costBoundary: strings, evidenceBoundary: strings,
    testCoverage: strings, state: z.enum(states), confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    reason: z.string(), knownRisk: z.string(), recommendedDisposition: z.string(), nextEvidenceNeeded: z.string(),
  }).strict()),
  routeRegistrations: z.array(registration),
  routes: z.array(z.object({ id: z.string(), registrationId: z.string(), sourcePath: z.string(), line: z.number().int(),
    method: z.string(), path: z.string(), mountChain: strings, authBoundary: strings,
    reachable: z.boolean(), state: z.enum(states), reason: z.string() }).strict()),
  queues: z.array(z.object({ id: z.string(), name: z.string(), definitions: strings, factorySymbols: strings,
    producers: strings, consumers: strings, callers: strings, producerStatus: z.string(), consumerStatus: z.string(),
    reachable: z.boolean(), state: z.enum(states), reason: z.string() }).strict()),
  scheduledJobs: z.array(z.object({ id: z.string(), ...location, kind: z.string(), symbol: z.string(), reachable: z.boolean(), state: z.enum(states) }).strict()),
  migrations: z.array(z.object({ id: z.string(), sourcePath: z.string(), version: z.string(), order: z.number().int(), sha256: z.string() }).strict()),
  workflows: z.array(z.object({ id: z.string(), sourcePath: z.string(), sha256: z.string(), sourceEntrypoints: strings, hasSchedule: z.boolean() }).strict()),
  findings: z.array(z.object({ id: z.string(), ...location, kind: z.string(), reachable: z.boolean(), state: z.enum(states), reason: z.string(), nextEvidenceNeeded: z.string() }).strict()),
  frontendCallers: z.array(z.object({ id: z.string(), ...location, callee: z.string(), reachable: z.boolean() }).strict()),
  testSuites: z.array(z.object({ id: z.string(), sourcePath: z.string(), declaredTests: z.number().int(), skipLocations: strings, focusLocations: strings }).strict()),
  duplicateCandidates: z.array(z.object({ id: z.string(), family: z.string(), sourcePaths: strings, reason: z.string(), disposition: z.literal('CANDIDATE_FOR_REVIEW') }).strict()),
  unresolved: strings,
}).strict();

export function validateInventory(value) {
  const parsed = inventorySchema.parse(value);
  const seen = new Set();
  for (const field of ['surfaces', 'routeRegistrations', 'routes', 'queues', 'scheduledJobs', 'migrations', 'workflows', 'findings', 'frontendCallers', 'testSuites', 'duplicateCandidates']) {
    for (const item of parsed[field]) {
      if (seen.has(item.id)) throw new Error(`Duplicate inventory ID: ${item.id}`);
      seen.add(item.id);
      if (item.state === 'UNKNOWN_BLOCKED' && !item.nextEvidenceNeeded) throw new Error(`Unknown item lacks next evidence: ${item.id}`);
    }
  }
  const registrations = new Set(parsed.routeRegistrations.map(item => item.id));
  for (const route of parsed.routes) {
    if (!registrations.has(route.registrationId)) throw new Error(`Route lacks registration: ${route.id}`);
    if (!route.reachable && route.state === 'IMPLEMENTED_AND_REACHABLE') throw new Error(`Unreachable route misclassified: ${route.id}`);
  }
  return parsed;
}

export const jsonSchema = z.toJSONSchema(inventorySchema, { target: 'draft-7' });
