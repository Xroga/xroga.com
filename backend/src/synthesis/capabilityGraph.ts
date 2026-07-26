import { createHash } from 'crypto';
import type { ExecutableTaskNode } from '../ai/executionRuntime.js';
import type { ProductDefinitionV1 } from './productDefinition.js';

export const CAPABILITY_GRAPH_SCHEMA_VERSION = '1.0.0' as const;
export const CAPABILITY_SPEC_SCHEMA_VERSION = '1.0.0' as const;

export type CapabilityRelationshipKind =
  | 'requires'
  | 'provides'
  | 'conflicts_with'
  | 'replaces'
  | 'extends'
  | 'optional_dependency'
  | 'runtime_dependency'
  | 'build_dependency'
  | 'deployment_dependency'
  | 'external_dependency';

export interface CapabilityRelationship {
  from: string;
  to: string;
  kind: CapabilityRelationshipKind;
  reason: string;
}

export interface DynamicCapabilityNode {
  id: string;
  purpose: string;
  operations: string[];
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  dataDependencies: string[];
  runtimeDependencies: string[];
  securityRequirements: string[];
  permissionRequirements: string[];
  providerRequirements: string[];
  chainRequirements: { families: string[]; networks: Array<{ name: string; chainId?: string }> };
  contractRequirements: string[];
  walletRequirements: string[];
  testnetRequirements: string[];
  hackathonEvidenceRequirements: string[];
  researchRequirements: { web: string[]; x: string[]; authoritativeSources: string[]; freshness: string; citations: boolean; budget: string };
  implementationOptions: { local: string[]; hosted: string[] };
  frameworkRequirements: string[];
  environmentVariables: string[];
  credentialRequirements: string[];
  installationRequirements: string[];
  files: { generate: string[]; modify: string[] };
  integrationPoints: string[];
  eventsEmitted: string[];
  eventsConsumed: string[];
  failureStates: string[];
  retryBehaviour: string;
  validationStrategy: string[];
  evidenceRequirements: string[];
  lifecycle: { removal: string; replacement: string; upgrade: string };
  implementationStatus: 'available' | 'must_synthesise' | 'external_only';
  externalSetupStatus: 'not_required' | 'required' | 'verified';
  limitations: string[];
}

export interface DynamicCapabilityGraph {
  schema: 'xroga.capability-graph';
  schemaVersion: typeof CAPABILITY_GRAPH_SCHEMA_VERSION;
  migrationPath: string[];
  productDefinitionId: string;
  nodes: DynamicCapabilityNode[];
  relationships: CapabilityRelationship[];
  missingCapabilities: string[];
  createdAt: string;
}

export interface CapabilitySpecification {
  schema: 'xroga.capability-specification';
  schemaVersion: typeof CAPABILITY_SPEC_SCHEMA_VERSION;
  migrationPath: string[];
  id: string;
  name: string;
  purpose: string;
  supportedOperations: string[];
  apiContract: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  errorSchema: Record<string, unknown>;
  dataSchema: Record<string, unknown>;
  securityModel: string[];
  authenticationModel: string;
  authorisationModel: string[];
  tenantModel: string;
  providerOptions: string[];
  localOptions: string[];
  runtimeRequirements: string[];
  frameworkRequirements: string[];
  packageRequirements: Array<{ name: string; version: string; licence?: string }>;
  environmentVariables: Array<{ name: string; required: boolean; secret: boolean }>;
  secretClassifications: string[];
  installationSteps: string[];
  generatedFiles: string[];
  modifiedFiles: string[];
  databaseChanges: string[];
  migrationRequirements: string[];
  backgroundJobs: string[];
  webhooks: string[];
  events: { emitted: string[]; consumed: string[] };
  tests: string[];
  verification: string[];
  evidence: string[];
  externalSetup: string[];
  failureHandling: string[];
  limitations: string[];
  removalAndRollback: string[];
}

export interface CompiledCapabilityPlan {
  schemaVersion: '1.0.0';
  migrationPath: string[];
  tasks: ExecutableTaskNode[];
  environmentRequirements: string[];
  testRequirements: string[];
  verificationRequirements: string[];
  deploymentRequirements: string[];
  userSetupInstructions: string[];
  evidenceExpectations: string[];
}

function id(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 12)}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'capability';
}

function node(input: Partial<DynamicCapabilityNode> & Pick<DynamicCapabilityNode, 'id' | 'purpose' | 'operations'>): DynamicCapabilityNode {
  return {
    inputs: { type: 'object' }, outputs: { type: 'object' }, dataDependencies: [], runtimeDependencies: [],
    securityRequirements: ['validate untrusted input', 'redact secrets and sensitive errors'], permissionRequirements: [], providerRequirements: [],
    chainRequirements: { families: [], networks: [] }, contractRequirements: [], walletRequirements: [], testnetRequirements: [], hackathonEvidenceRequirements: [],
    researchRequirements: { web: [], x: [], authoritativeSources: [], freshness: 'not applicable', citations: false, budget: 'bounded by run budget' },
    implementationOptions: { local: [], hosted: [] }, frameworkRequirements: [], environmentVariables: [], credentialRequirements: [],
    installationRequirements: [], files: { generate: [], modify: [] }, integrationPoints: [], eventsEmitted: [], eventsConsumed: [],
    failureStates: ['validation_failure', 'runtime_failure'], retryBehaviour: 'retry only classified transient failures with idempotency',
    validationStrategy: ['schema validation', 'critical workflow test'], evidenceRequirements: ['executed operation evidence', 'validation evidence'],
    lifecycle: { removal: 'remove generated files and configuration after dependency analysis', replacement: 'migrate state before switching implementation', upgrade: 'pin and validate the new version before promotion' },
    implementationStatus: 'must_synthesise', externalSetupStatus: 'not_required', limitations: [],
    ...input,
  };
}

export function buildCapabilityGraph(definition: ProductDefinitionV1): DynamicCapabilityGraph {
  const nodes: DynamicCapabilityNode[] = [];
  const add = (value: DynamicCapabilityNode) => { if (!nodes.some((existing) => existing.id === value.id)) nodes.push(value); };
  add(node({
    id: 'product-domain', purpose: 'Implement domain entities, business rules, lifecycles and validation',
    operations: ['define_schema', 'enforce_rules', 'transition_state'], dataDependencies: definition.domainEntities.map((entity) => entity.id),
    permissionRequirements: definition.permissions.map((permission) => permission.id), eventsEmitted: definition.events,
    files: { generate: ['product/domain-model', 'product/state-machines'], modify: [] }, implementationStatus: 'available',
  }));
  if (definition.actors.some((actor) => actor.kind === 'human') && !/\b(cli|command line|api[- ]only|worker[- ]only|headless)\b/i.test(definition.objective)) add(node({
    id: 'product-interface', purpose: 'Implement accessible user journeys and validated client interactions',
    operations: ['render_journey', 'submit_action', 'display_validated_result', 'display_safe_failure'],
    dataDependencies: definition.domainEntities.map((entity) => entity.id), permissionRequirements: definition.permissions.map((permission) => permission.id),
    frameworkRequirements: ['architecture-selected user interface adapter'], files: { generate: ['product/interface', 'tests/critical-journeys'], modify: [] },
    validationStrategy: ['critical journey test', 'accessibility validation', 'no dead controls or fabricated live data'],
  }));
  if (definition.apis.length || definition.webhooks.length) add(node({
    id: 'product-api', purpose: 'Expose versioned trusted product operations', operations: ['validate_request', 'authorize', 'execute', 'normalise_error'],
    dataDependencies: definition.domainEntities.map((entity) => entity.id), permissionRequirements: definition.permissions.map((permission) => permission.id),
    files: { generate: ['product/api', 'tests/api'], modify: [] }, validationStrategy: ['API contract test', 'unauthorised request denial test'],
  }));
  if (definition.notifications.length) add(node({
    id: 'product-notifications', purpose: 'Deliver notifications only after verified domain events', operations: ['compose', 'send', 'record_delivery'],
    eventsConsumed: definition.events, files: { generate: ['product/notifications', 'tests/notifications'], modify: [] },
    validationStrategy: ['deterministic provider record/replay test', 'failure does not falsify delivery'],
  }));
  if (definition.search.length || definition.reports.length || definition.analytics.length) add(node({
    id: 'product-query-and-reporting', purpose: 'Provide permission-filtered search, reporting and product analytics', operations: ['query', 'filter_permissions', 'derive_report'],
    dataDependencies: definition.domainEntities.map((entity) => entity.id), permissionRequirements: definition.permissions.map((permission) => permission.id),
    files: { generate: ['product/query-reporting', 'tests/query-reporting'], modify: [] }, validationStrategy: ['permission-filtered query test', 'report source-data reconciliation'],
  }));
  if (definition.realtime.length || definition.offline.length) add(node({
    id: 'product-synchronisation', purpose: 'Reconcile realtime or offline product state', operations: ['subscribe', 'queue_local_change', 'reconcile', 'recover_connection'],
    dataDependencies: definition.domainEntities.map((entity) => entity.id), files: { generate: ['product/synchronisation', 'tests/synchronisation'], modify: [] },
    validationStrategy: ['disconnect and reconnect test', 'conflict reconciliation test', 'cross-tenant event denial test'],
  }));
  if (definition.permissions.length) add(node({
    id: 'product-authorisation', purpose: 'Enforce product permissions and tenant boundaries at trusted boundaries',
    operations: ['authorize', 'deny', 'audit'], dataDependencies: definition.domainEntities.map((entity) => entity.id),
    securityRequirements: ['server-side enforcement', 'cross-tenant denial', 'revocation takes effect'],
    validationStrategy: definition.permissions.map((permission) => permission.denialTest), files: { generate: ['product/authorisation', 'tests/permissions'], modify: [] }, implementationStatus: 'available',
  }));
  for (const workflow of [...definition.criticalWorkflows, ...definition.secondaryWorkflows]) add(node({
    id: id('workflow', workflow.objective), purpose: workflow.objective,
    operations: workflow.steps.map((step) => slug(step)), dataDependencies: workflow.data,
    permissionRequirements: workflow.permissions, eventsEmitted: workflow.data.map((data) => `${data}.changed`),
    failureStates: workflow.failureStates, validationStrategy: workflow.evidence,
    files: { generate: [`product/workflows/${slug(workflow.objective)}`], modify: [] },
  }));
  for (const integration of definition.integrations) add(node({
    id: integration.id, purpose: integration.purpose, operations: integration.operations,
    providerRequirements: [integration.ownership], credentialRequirements: integration.credentialFields,
    environmentVariables: integration.credentialFields, externalSetupStatus: integration.externalSetupRequired ? 'required' : 'not_required',
    implementationStatus: integration.externalSetupRequired ? 'external_only' : 'must_synthesise',
    researchRequirements: {
      web: integration.authoritativeSourceRequired ? [`verify ${integration.purpose} from official documentation`] : [], x: [],
      authoritativeSources: integration.authoritativeSourceRequired ? ['official provider documentation'] : [],
      freshness: integration.authoritativeSourceRequired ? 'must be current at implementation time' : 'not applicable',
      citations: integration.authoritativeSourceRequired, budget: definition.researchConstraints.budget,
    },
    files: { generate: [`product/integrations/${slug(integration.purpose)}-adapter`], modify: ['.env.example'] },
    limitations: integration.externalSetupRequired ? ['Cannot report connected until an authenticated request succeeds'] : [],
  }));
  if (definition.backgroundWork.length || definition.scheduledWork.length) add(node({
    id: 'background-execution', purpose: 'Execute durable background and scheduled work', operations: ['enqueue', 'execute', 'retry', 'cancel'],
    runtimeDependencies: ['long-running or durable job runtime'], eventsConsumed: definition.events,
    validationStrategy: ['retry test', 'idempotency test', 'interruption recovery test'], files: { generate: ['product/workers', 'tests/workers'], modify: [] },
  }));
  if (definition.storage.length) add(node({
    id: 'product-persistence', purpose: 'Persist domain data, ownership boundaries and audit history', operations: ['create', 'read', 'update', 'delete', 'migrate'],
    dataDependencies: definition.domainEntities.map((entity) => entity.id), securityRequirements: ['tenant isolation', 'ownership enforcement', 'migration rollback'],
    implementationOptions: { local: ['embedded database', 'local files when appropriate'], hosted: ['user-owned database provider'] },
    files: { generate: ['product/persistence', 'migrations', 'tests/persistence'], modify: [] },
  }));
  const relationships: CapabilityRelationship[] = [];
  const relate = (from: string, to: string, kind: CapabilityRelationshipKind, reason: string) => {
    if (nodes.some((entry) => entry.id === from) && nodes.some((entry) => entry.id === to)) relationships.push({ from, to, kind, reason });
  };
  for (const workflow of nodes.filter((entry) => entry.id.startsWith('workflow-'))) {
    relate(workflow.id, 'product-domain', 'requires', 'workflow operations use the domain model');
    relate(workflow.id, 'product-authorisation', 'requires', 'workflow operations require trusted authorisation');
    relate(workflow.id, 'product-persistence', 'runtime_dependency', 'workflow state must be persisted');
  }
  for (const integration of definition.integrations) for (const workflow of nodes.filter((entry) => entry.id.startsWith('workflow-'))) {
    if (workflow.purpose.toLowerCase().includes(integration.purpose.split(' ')[0].toLowerCase())) relate(workflow.id, integration.id, 'external_dependency', 'workflow explicitly requires the integration');
  }
  return {
    schema: 'xroga.capability-graph', schemaVersion: CAPABILITY_GRAPH_SCHEMA_VERSION,
    migrationPath: ['0.x -> 1.0.0: normalize nodes, typed relationships, lifecycle and evidence fields'],
    productDefinitionId: definition.id, nodes, relationships,
    missingCapabilities: nodes.filter((entry) => entry.implementationStatus === 'must_synthesise').map((entry) => entry.id),
    createdAt: definition.createdAt,
  };
}

export function capabilitySpecification(nodeValue: DynamicCapabilityNode, definition: ProductDefinitionV1): CapabilitySpecification {
  return {
    schema: 'xroga.capability-specification', schemaVersion: CAPABILITY_SPEC_SCHEMA_VERSION,
    migrationPath: ['1.0.0 specifications are forward-migrated through explicit version adapters'],
    id: nodeValue.id, name: nodeValue.purpose, purpose: nodeValue.purpose, supportedOperations: nodeValue.operations,
    apiContract: { operations: nodeValue.operations }, inputSchema: nodeValue.inputs, outputSchema: nodeValue.outputs,
    errorSchema: { type: 'object', required: ['code', 'safeMessage'], properties: { code: { type: 'string' }, safeMessage: { type: 'string' }, retryable: { type: 'boolean' } } },
    dataSchema: { entities: nodeValue.dataDependencies }, securityModel: nodeValue.securityRequirements,
    authenticationModel: nodeValue.credentialRequirements.length ? 'user-owned credentials at server runtime' : 'product-defined actor session or local trust boundary',
    authorisationModel: nodeValue.permissionRequirements, tenantModel: definition.tenants.isolation,
    providerOptions: nodeValue.implementationOptions.hosted, localOptions: nodeValue.implementationOptions.local,
    runtimeRequirements: nodeValue.runtimeDependencies, frameworkRequirements: nodeValue.frameworkRequirements, packageRequirements: [],
    environmentVariables: nodeValue.environmentVariables.map((name) => ({ name, required: true, secret: nodeValue.credentialRequirements.includes(name) })),
    secretClassifications: nodeValue.credentialRequirements, installationSteps: nodeValue.installationRequirements,
    generatedFiles: nodeValue.files.generate, modifiedFiles: nodeValue.files.modify,
    databaseChanges: nodeValue.dataDependencies.length ? [`support ${nodeValue.dataDependencies.join(', ')}`] : [],
    migrationRequirements: nodeValue.dataDependencies.length ? ['versioned forward migration and rollback evidence'] : [],
    backgroundJobs: nodeValue.id === 'background-execution' ? definition.backgroundWork : [],
    webhooks: nodeValue.operations.filter((operation) => operation.includes('webhook')), events: { emitted: nodeValue.eventsEmitted, consumed: nodeValue.eventsConsumed },
    tests: nodeValue.validationStrategy, verification: nodeValue.validationStrategy, evidence: nodeValue.evidenceRequirements,
    externalSetup: nodeValue.externalSetupStatus === 'required' ? nodeValue.credentialRequirements.map((name) => `Owner supplies and validates ${name}`) : [],
    failureHandling: [nodeValue.retryBehaviour, ...nodeValue.failureStates], limitations: nodeValue.limitations,
    removalAndRollback: [nodeValue.lifecycle.removal, nodeValue.lifecycle.replacement, nodeValue.lifecycle.upgrade],
  };
}

export function compileCapabilitySpecifications(graph: DynamicCapabilityGraph, definition: ProductDefinitionV1): CompiledCapabilityPlan {
  const specifications = graph.nodes.map((entry) => capabilitySpecification(entry, definition));
  const tasks = specifications.flatMap<ExecutableTaskNode>((specification, index) => {
    const dependencies = graph.relationships
      .filter((relationship) => relationship.from === specification.id && ['requires', 'runtime_dependency', 'build_dependency'].includes(relationship.kind))
      .map((relationship) => `capability-${relationship.to}`);
    const implementation: ExecutableTaskNode = {
      id: `capability-${specification.id}`, objective: `Implement ${specification.purpose}`, operationType: 'capability_implementation',
      requiredCapabilities: [specification.id], selectedRuntime: 'canonical_mutation_service', selectedProvider: null, selectedModel: null,
      requiredContextReferences: [`product-definition:${definition.id}`, `capability-specification:${specification.id}`],
      allowedFiles: [...specification.generatedFiles, ...specification.modifiedFiles], expectedOutputSchema: { type: 'object', required: ['changedFiles', 'evidence'] },
      dependencies, riskLevel: specification.secretClassifications.length || specification.authorisationModel.length ? 'high' : 'medium', timeoutMs: 120_000,
      retryPolicy: { maximumAttempts: 2, initialBackoffMs: 500, maximumBackoffMs: 4_000 }, budget: { maximumTokens: 12_000 },
      validationMethod: specification.verification, evidenceRequirements: specification.evidence,
      fallbackRoutes: specification.localOptions.length ? [{ provider: 'local', model: null }] : [], status: dependencies.length || index > 0 ? 'pending' : 'ready', attempts: 0, evidence: [],
    };
    const validation: ExecutableTaskNode = {
      ...implementation, id: `verify-${specification.id}`, objective: `Verify ${specification.purpose}`, operationType: 'capability_verification',
      selectedRuntime: 'validation_pipeline', allowedFiles: [], dependencies: [implementation.id], riskLevel: implementation.riskLevel,
      expectedOutputSchema: { type: 'object', required: ['validationResults', 'evidence'] }, status: 'pending',
    };
    return [implementation, validation];
  });
  return {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial executable capability-plan schema'], tasks,
    environmentRequirements: [...new Set(specifications.flatMap((specification) => specification.environmentVariables.map((item) => item.name)))],
    testRequirements: [...new Set(specifications.flatMap((specification) => specification.tests))],
    verificationRequirements: [...new Set(specifications.flatMap((specification) => specification.verification))],
    deploymentRequirements: definition.deploymentTargets,
    userSetupInstructions: [...new Set(specifications.flatMap((specification) => specification.externalSetup))],
    evidenceExpectations: [...new Set(specifications.flatMap((specification) => specification.evidence))],
  };
}

export function validateCapabilityGraph(graph: DynamicCapabilityGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((entry) => entry.id));
  if (ids.size !== graph.nodes.length) errors.push('capability node IDs must be unique');
  for (const relation of graph.relationships) if (!ids.has(relation.from) || !ids.has(relation.to)) errors.push(`relationship references missing node: ${relation.from} -> ${relation.to}`);
  for (const entry of graph.nodes) {
    if (!entry.operations.length) errors.push(`${entry.id} has no operations`);
    if (!entry.validationStrategy.length || !entry.evidenceRequirements.length) errors.push(`${entry.id} has no meaningful verification`);
  }
  return errors;
}
