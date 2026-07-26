import { createHash } from 'crypto';
import type { ArchitectureDecision, FrameworkAdapter } from './adapters.js';
import type { DynamicCapabilityGraph } from './capabilityGraph.js';
import type { ProductDefinitionV1 } from './productDefinition.js';
import { CHAIN_TOOLCHAINS } from './chain/chainRuntime.js';
import { DOMAIN_PROVIDER_ADAPTERS } from './integrations/domainAutopilot.js';

export interface GeneratedProductOperationsManifest {
  schema: 'xroga.generated-product-operations';
  schemaVersion: '1.0.0';
  migrationPath: string[];
  productDefinitionId: string;
  architecture: { primary: string; framework: string; buildCommand: string | null; testCommand: string | null };
  runtimes: string[];
  persistence: { required: boolean; database: string; migrations: string[]; storage: string[] };
  authentication: { required: boolean; model: string[] };
  environment: Array<{ name: string; secret: boolean; ownerSupplied: boolean }>;
  integrations: Array<{ purpose: string; ownership: string; status: 'implementation_required' | 'credentials_required'; credentialFields: string[]; verification: string[] }>;
  payments: { required: boolean; supportedProviders: string[]; entitlementSource: string; liveStatus: 'not_required' | 'activation_pending' };
  domains: { required: boolean; providerAdapters: string[]; preservesExistingRecords: boolean; purchaseRequiresExplicitAuthorisation: boolean };
  research: { required: boolean; providers: string[]; trustPolicy: string; citationsRequired: boolean; budget: string };
  chain: { required: boolean; families: string[]; toolchains: string[]; signerBoundary: string; networkFacts: 'runtime_verified_only' };
  communication: { required: boolean; deliveryEvidenceRequired: boolean; consentRequiredForMarketing: boolean };
  ai: { required: boolean; structuredOutputRequired: boolean; criticalFailureHandling: string };
  repositoryEvolution: { repositoryPresent: boolean; preserveUnrelatedFiles: boolean; migrationRequired: boolean; compatibilityValidation: string[] };
  outputs: { targets: string[]; sharedContracts: string[] };
  execution: { scheduledJobs: string[]; workers: string[]; queues: string[]; webhooks: string[]; healthChecks: string[] };
  quality: { accessibility: string[]; internationalisation: string[]; security: string[] };
  testTiers: Array<{ tier: 'unit' | 'integration_fixture' | 'provider_sandbox' | 'live'; required: boolean; status: 'required' | 'external_action_required' }>;
  externalActions: string[];
  currentStatus: 'implementation_planned' | 'external_setup_required';
  knownLimitations: string[];
  rollback: string[];
  evidenceRequirements: string[];
  digest: string;
}

export function buildOperationsManifest(input: { definition: ProductDefinitionV1; graph: DynamicCapabilityGraph; architecture: ArchitectureDecision; framework: FrameworkAdapter }): GeneratedProductOperationsManifest {
  const definition = input.definition;
  const paymentRequired = definition.paymentCapabilities.length > 0;
  const domainRequired = /\b(custom domain|domain connect|dns|buy domain)\b/i.test([definition.objective, ...definition.journeys].join(' '));
  const chainRequired = definition.blockchainCapabilities.length > 0;
  const manifest: Omit<GeneratedProductOperationsManifest, 'digest'> = {
    schema: 'xroga.generated-product-operations', schemaVersion: '1.0.0', migrationPath: ['1.0.0: initial integration, research and chain operations contract'],
    productDefinitionId: definition.id,
    architecture: { primary: input.architecture.primary, framework: input.framework.id, buildCommand: input.framework.buildCommand, testCommand: input.framework.testCommand },
    runtimes: [input.architecture.needsBackend ? 'trusted server runtime' : 'client or local runtime', ...(input.architecture.needsLongRunningRuntime ? ['durable worker runtime'] : [])],
    persistence: { required: definition.storage.length > 0, database: definition.storage.length ? 'selected user-owned or local store' : 'not required', migrations: definition.storage.length ? ['versioned schema migration and rollback required'] : [], storage: definition.storage },
    authentication: { required: definition.authentication.required, model: definition.authentication.methods },
    environment: [...new Set(definition.integrations.flatMap((integration) => integration.credentialFields))].map((name) => ({ name, secret: !/(?:PUBLIC|ADDRESS|ID)$/.test(name), ownerSupplied: true })),
    integrations: definition.integrations.map((integration) => ({ purpose: integration.purpose, ownership: integration.ownership, status: integration.credentialFields.length ? 'credentials_required' : 'implementation_required', credentialFields: integration.credentialFields, verification: ['authenticated capability probe', 'deterministic record/replay fixture', 'real provider evidence before live status'] })),
    payments: { required: paymentRequired, supportedProviders: paymentRequired ? ['stripe', 'paypal', 'lemon_squeezy'] : [], entitlementSource: 'verified idempotent webhook state only', liveStatus: paymentRequired ? 'activation_pending' : 'not_required' },
    domains: { required: domainRequired, providerAdapters: domainRequired ? DOMAIN_PROVIDER_ADAPTERS.map((adapter) => adapter.id) : [], preservesExistingRecords: true, purchaseRequiresExplicitAuthorisation: true },
    research: { required: definition.researchRequirements.length > 0, providers: ['xai', 'tavily', 'direct_official'], trustPolicy: 'consequential facts require current official evidence; X is discovery unless independently verified', citationsRequired: definition.researchConstraints.citationsRequired, budget: definition.researchConstraints.budget },
    chain: { required: chainRequired, families: definition.blockchainCapabilities.filter((value) => !value.startsWith('runtime-')), toolchains: chainRequired ? CHAIN_TOOLCHAINS.map((toolchain) => toolchain.id) : [], signerBoundary: 'user wallet or restricted external signer; raw private material forbidden', networkFacts: 'runtime_verified_only' },
    communication: { required: definition.notifications.length > 0, deliveryEvidenceRequired: true, consentRequiredForMarketing: true },
    ai: { required: definition.aiCapabilities.length > 0, structuredOutputRequired: true, criticalFailureHandling: 'bounded failover then human_review_required' },
    repositoryEvolution: { repositoryPresent: definition.repositoryContext.present, preserveUnrelatedFiles: true, migrationRequired: definition.repositoryContext.present, compatibilityValidation: ['existing tests', 'production build', 'critical workflow regression'] },
    outputs: { targets: definition.deploymentTargets, sharedContracts: ['domain model', 'API schemas', 'authorisation rules', 'event schemas'] },
    execution: { scheduledJobs: definition.scheduledWork, workers: definition.backgroundWork, queues: definition.backgroundWork.length ? ['idempotent durable queue with dead-letter state'] : [], webhooks: definition.webhooks, healthChecks: ['critical dependency health', 'persistence readiness', 'external provider authenticated capability probe when configured'] },
    quality: { accessibility: definition.quality.accessibility, internationalisation: definition.quality.internationalisation, security: definition.quality.security },
    testTiers: [
      { tier: 'unit', required: true, status: 'required' }, { tier: 'integration_fixture', required: true, status: 'required' },
      { tier: 'provider_sandbox', required: definition.integrations.length > 0 || chainRequired, status: 'external_action_required' },
      { tier: 'live', required: false, status: 'external_action_required' },
    ],
    externalActions: definition.externalBlockers,
    currentStatus: definition.externalBlockers.length ? 'external_setup_required' : 'implementation_planned',
    knownLimitations: definition.limitations,
    rollback: ['restore pre-change repository snapshot', 'reverse versioned migrations where safe', 'restore DNS from captured snapshot', 'revoke provider credentials on disconnect'],
    evidenceRequirements: [...definition.evidenceRequirements, 'integration status evidence', 'research evidence references', 'chain transaction or testnet evidence when required'],
  };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  return { ...manifest, digest };
}

export function migrateOperationsManifest(value: Record<string, unknown>): GeneratedProductOperationsManifest {
  if (value.schema === 'xroga.generated-product-operations' && value.schemaVersion === '1.0.0') return value as unknown as GeneratedProductOperationsManifest;
  throw new Error('legacy operations manifests must be regenerated from the product definition');
}
