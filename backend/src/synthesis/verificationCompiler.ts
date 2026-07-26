import { createHash } from 'crypto';
import type { DynamicCapabilityGraph } from './capabilityGraph.js';
import type { GeneratedProductOperationsManifest } from './operationsManifest.js';
import type { ProductDefinitionV1 } from './productDefinition.js';

export type VerificationKind = 'unit' | 'integration' | 'contract' | 'api' | 'database' | 'migration' | 'permission' | 'tenant_isolation' | 'state_transition' | 'webhook' | 'background_job' | 'provider_adapter' | 'browser' | 'mobile' | 'extension' | 'cli' | 'build' | 'security' | 'accessibility' | 'offline' | 'realtime' | 'domain' | 'payment' | 'ai_evaluation' | 'end_to_end' | 'blockchain';
export interface DerivedVerification { id: string; kind: VerificationKind; capabilityId: string; objective: string; invariant: string; required: boolean; executorKey: string; evidenceRequirements: string[]; external: boolean; blocker?: string; }
export interface VerificationPlan { schema: 'xroga.verification-plan'; schemaVersion: '1.0.0'; migrationPath: string[]; productDefinitionId: string; tests: DerivedVerification[]; expectedTestCount: number; digest: string; }
export interface VerificationResult { testId: string; status: 'passed' | 'failed' | 'external_validation_pending'; evidenceIds: string[]; error?: string; }

function stableId(value: string): string { return `verify-${createHash('sha256').update(value).digest('hex').slice(0, 14)}`; }
function addTest(tests: DerivedVerification[], input: Omit<DerivedVerification, 'id'>): void { const id = stableId(`${input.kind}:${input.capabilityId}:${input.invariant}`); if (!tests.some((item) => item.id === id)) tests.push({ id, ...input }); }

export function compileVerificationPlan(input: { definition: ProductDefinitionV1; graph: DynamicCapabilityGraph; operations: GeneratedProductOperationsManifest }): VerificationPlan {
  const tests: DerivedVerification[] = []; const definition = input.definition;
  for (const permission of definition.permissions) addTest(tests, { kind: permission.scope === 'tenant' ? 'tenant_isolation' : 'permission', capabilityId: 'product-authorisation', objective: `Deny unauthorized ${permission.operation} on ${permission.resource}`, invariant: permission.denialTest, required: true, executorKey: 'authorisation.denial', evidenceRequirements: ['denial result', 'audit evidence when required'], external: false });
  for (const lifecycle of definition.lifecycles) for (const transition of lifecycle.transitions) addTest(tests, { kind: 'state_transition', capabilityId: lifecycle.id, objective: `${transition.from} -> ${transition.to}`, invariant: transition.preconditions.join('; '), required: true, executorKey: 'lifecycle.transition', evidenceRequirements: ['persisted state transition', 'invalid transition denial'], external: false });
  for (const workflow of definition.criticalWorkflows) addTest(tests, { kind: 'end_to_end', capabilityId: workflow.id, objective: workflow.objective, invariant: workflow.evidence.join('; '), required: true, executorKey: 'workflow.critical', evidenceRequirements: workflow.evidence, external: false });
  if (definition.paymentCapabilities.length) for (const invariant of ['sandbox checkout belongs to owner account', 'webhook signature is verified', 'duplicate event is idempotent', 'failed/refunded/cancelled state is durable', 'live activation stays pending without live evidence']) addTest(tests, { kind: 'payment', capabilityId: 'user-owned-payments', objective: invariant, invariant, required: true, executorKey: 'payments.fixture', evidenceRequirements: ['provider fixture response', 'durable state'], external: false });
  if (definition.integrations.some((item) => /domain/i.test(item.purpose))) for (const invariant of ['provider detection', 'DNS record preservation', 'conflict authorization', 'SSL and expected-product verification', 'unsupported provider guided fallback', 'purchase explicit confirmation']) addTest(tests, { kind: 'domain', capabilityId: 'domain-autopilot', objective: invariant, invariant, required: true, executorKey: 'domain.fixture', evidenceRequirements: ['DNS snapshot or verification evidence'], external: false });
  if (definition.aiCapabilities.length) for (const invariant of ['schema-valid structured output', 'invalid output repair or human review', 'provider timeout/failover']) addTest(tests, { kind: 'ai_evaluation', capabilityId: 'product-ai', objective: invariant, invariant, required: true, executorKey: 'ai.fixture', evidenceRequirements: ['evaluation result'], external: false });
  if (definition.blockchainCapabilities.length) {
    for (const invariant of ['contract or program source compiles in selected toolchain', 'wallet nonce expiry and replay are rejected', 'user rejection causes no transaction', 'economic and access-control invariants hold under fuzz inputs', 'indexer is idempotent and reorg-aware', 'mainnet remains blocked without separate review']) addTest(tests, { kind: 'blockchain', capabilityId: 'product-chain-runtime', objective: invariant, invariant, required: true, executorKey: 'chain.local', evidenceRequirements: ['local test output', 'content hash'], external: false });
    for (const invariant of ['authorized testnet deployment receipt', 'explorer source or program verification', 'testnet finality and end-to-end evidence']) addTest(tests, { kind: 'blockchain', capabilityId: 'product-chain-runtime', objective: invariant, invariant, required: true, executorKey: 'chain.testnet', evidenceRequirements: ['real transaction', 'network', 'address', 'explorer evidence'], external: true, blocker: 'Owner RPC/signing credentials, faucet funds and explicit testnet authorization are required' });
  }
  for (const node of input.graph.nodes) for (const strategy of node.validationStrategy) addTest(tests, { kind: 'integration', capabilityId: node.id, objective: strategy, invariant: strategy, required: true, executorKey: 'capability.validation', evidenceRequirements: node.evidenceRequirements, external: false });
  addTest(tests, { kind: 'build', capabilityId: 'product-build', objective: 'Actual production build exits successfully', invariant: input.operations.architecture.buildCommand ?? 'framework has no build step and requires runtime preview', required: true, executorKey: 'framework.production_build', evidenceRequirements: ['command', 'exit code', 'output digest'], external: false });
  if (input.operations.quality.accessibility.length) addTest(tests, { kind: 'accessibility', capabilityId: 'product-interface', objective: 'Automated accessibility checks plus manual-review findings', invariant: input.operations.quality.accessibility.join('; '), required: true, executorKey: 'interface.accessibility', evidenceRequirements: ['automated findings', 'manual review state'], external: false });
  if (!tests.length) throw new Error('verification compiler generated zero tests');
  const digest = createHash('sha256').update(JSON.stringify(tests)).digest('hex');
  return { schema: 'xroga.verification-plan', schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial product-derived verification plan'], productDefinitionId: definition.id, tests, expectedTestCount: tests.length, digest };
}

export async function executeVerificationPlan(plan: VerificationPlan, executors: Record<string, (test: DerivedVerification) => Promise<{ passed: boolean; evidenceIds: string[]; error?: string }>>): Promise<{ status: 'passed' | 'failed' | 'external_validation_pending'; results: VerificationResult[] }> {
  if (plan.expectedTestCount < 1 || plan.tests.length !== plan.expectedTestCount) throw new Error('verification plan has zero or missing required tests');
  const results: VerificationResult[] = [];
  for (const test of plan.tests) {
    if (test.external && !executors[test.executorKey]) { results.push({ testId: test.id, status: 'external_validation_pending', evidenceIds: [], error: test.blocker }); continue; }
    const executor = executors[test.executorKey]; if (!executor) { results.push({ testId: test.id, status: 'failed', evidenceIds: [], error: `missing executor ${test.executorKey}` }); continue; }
    try { const result = await executor(test); results.push({ testId: test.id, status: result.passed && result.evidenceIds.length ? 'passed' : 'failed', evidenceIds: result.evidenceIds, error: result.error ?? (result.evidenceIds.length ? undefined : 'no execution evidence') }); } catch (error) { results.push({ testId: test.id, status: 'failed', evidenceIds: [], error: error instanceof Error ? error.message : 'verification failed' }); }
  }
  if (results.some((item) => item.status === 'failed')) return { status: 'failed', results };
  if (results.some((item) => item.status === 'external_validation_pending')) return { status: 'external_validation_pending', results };
  return { status: 'passed', results };
}
