import { createHash } from 'crypto';
import type { ProjectFile } from '../ai/patches.js';
import { redactSecrets } from '../lib/truthfulExecution.js';

export const PRODUCT_DEFINITION_SCHEMA_VERSION = '1.0.0' as const;

export type RequirementPriority = 'required' | 'recommended' | 'optional';
export type RequirementStatus = 'specified' | 'assumed' | 'unsupported' | 'external_blocker';

export interface ProductRequirement {
  id: string;
  statement: string;
  priority: RequirementPriority;
  status: RequirementStatus;
  source: 'explicit' | 'inferred_from_workflow' | 'repository';
  verification: string[];
}

export interface ProductActor {
  id: string;
  label: string;
  kind: 'human' | 'service' | 'system' | 'device';
  roles: string[];
  tenantScope: 'global' | 'organisation' | 'team' | 'personal';
}

export interface ProductWorkflow {
  id: string;
  objective: string;
  actors: string[];
  steps: string[];
  data: string[];
  permissions: string[];
  failureStates: string[];
  evidence: string[];
  critical: boolean;
}

export interface DomainEntityDefinition {
  id: string;
  label: string;
  purpose: string;
  fields: Array<{ name: string; type: string; required: boolean; unique?: boolean; sensitive?: boolean }>;
  relationships: Array<{ target: string; kind: 'one_to_one' | 'one_to_many' | 'many_to_many'; required: boolean }>;
  ownership: string;
  tenantBoundary: string | null;
  retention: string;
  deletion: 'hard' | 'soft' | 'archive';
  audit: boolean;
}

export interface LifecycleDefinition {
  id: string;
  entity: string;
  initialState: string;
  terminalStates: string[];
  transitions: Array<{
    from: string;
    to: string;
    actors: string[];
    preconditions: string[];
    sideEffects: string[];
    events: string[];
    idempotency: string;
    failureBehaviour: string;
    audit: boolean;
  }>;
}

export interface PermissionDefinition {
  id: string;
  actor: string;
  operation: string;
  resource: string;
  scope: 'own' | 'team' | 'organisation' | 'tenant' | 'global';
  enforcement: 'server' | 'database' | 'both';
  audit: boolean;
  denialTest: string;
}

export interface IntegrationRequirement {
  id: string;
  purpose: string;
  operations: string[];
  ownership: 'user_owned' | 'local' | 'self_hosted';
  credentialFields: string[];
  externalSetupRequired: boolean;
  authoritativeSourceRequired: boolean;
}

export interface ProductDefinitionV1 {
  schema: 'xroga.product-definition';
  schemaVersion: typeof PRODUCT_DEFINITION_SCHEMA_VERSION;
  migrationPath: string[];
  id: string;
  objective: string;
  targetUsers: string[];
  personas: string[];
  actors: ProductActor[];
  organisations: { required: boolean; model: string };
  teams: { required: boolean; model: string };
  tenants: { required: boolean; isolation: string };
  journeys: string[];
  criticalWorkflows: ProductWorkflow[];
  secondaryWorkflows: ProductWorkflow[];
  functionalRequirements: ProductRequirement[];
  nonFunctionalRequirements: ProductRequirement[];
  domainEntities: DomainEntityDefinition[];
  relationships: string[];
  lifecycles: LifecycleDefinition[];
  businessRules: string[];
  validationRules: string[];
  permissions: PermissionDefinition[];
  ownershipRules: string[];
  tenantBoundaries: string[];
  integrations: IntegrationRequirement[];
  events: string[];
  notifications: string[];
  scheduledWork: string[];
  backgroundWork: string[];
  apis: string[];
  webhooks: string[];
  imports: string[];
  exports: string[];
  reports: string[];
  search: string[];
  analytics: string[];
  storage: string[];
  realtime: string[];
  offline: string[];
  deviceCapabilities: string[];
  aiCapabilities: string[];
  paymentCapabilities: string[];
  domainCapabilities: string[];
  blockchainCapabilities: string[];
  contractRequirements: string[];
  walletRequirements: string[];
  hackathonRequirements: string[];
  testnetEvidenceRequirements: string[];
  webResearchRequirements: string[];
  xSearchRequirements: string[];
  researchRequirements: string[];
  sourceAuthorityRequirements: string[];
  researchConstraints: { freshness: string; budget: string; citationsRequired: boolean };
  authentication: { required: boolean; methods: string[]; serviceAccounts: boolean; sessionRequirements: string[] };
  deploymentTargets: string[];
  quality: {
    availability: string[];
    performance: string[];
    security: string[];
    privacy: string[];
    accessibility: string[];
    internationalisation: string[];
    compliance: string[];
  };
  evidenceRequirements: string[];
  externalBlockers: string[];
  userOwnedInfrastructure: string[];
  userOwnedCredentials: string[];
  unsupportedRequirements: string[];
  assumptions: string[];
  limitations: string[];
  repositoryContext: { present: boolean; fileCount: number; detectedManifests: string[] };
  createdAt: string;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 12)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function phrases(prompt: string): string[] {
  return prompt
    .replace(/[\r\n]+/g, ' ')
    .split(/[.;]|\b(?:and then|then|also)\b/i)
    .map((value) => value.trim())
    .filter((value) => value.length > 8)
    .slice(0, 24);
}

function inferActors(prompt: string): ProductActor[] {
  const actors: ProductActor[] = [];
  const add = (label: string, roles: string[], scope: ProductActor['tenantScope'] = 'personal', kind: ProductActor['kind'] = 'human') => {
    const id = stableId('actor', label);
    if (!actors.some((actor) => actor.id === id)) actors.push({ id, label, roles, tenantScope: scope, kind });
  };
  if (/\b(admin|administrator|operator|manager)\b/i.test(prompt)) add('Administrator', ['administrator'], 'global');
  if (/\b(staff|clinician|doctor|teacher|agent|dispatcher|worker)\b/i.test(prompt)) add('Staff member', ['staff'], 'organisation');
  if (/\b(customer|patient|student|client|member|buyer|requester)\b/i.test(prompt)) add('Service user', ['user'], 'personal');
  if (/\b(team|organisation|organization|tenant|workspace)\b/i.test(prompt)) add('Organisation owner', ['owner'], 'organisation');
  if (/\b(api|webhook|integration|service account)\b/i.test(prompt)) add('External service', ['service'], 'global', 'service');
  if (!actors.some((actor) => actor.kind === 'human')) add('Product user', ['user']);
  return actors;
}

function inferEntities(prompt: string, actors: ProductActor[]): DomainEntityDefinition[] {
  const entities: DomainEntityDefinition[] = [];
  const tenantRequired = /\b(team|organisation|organization|tenant|workspace|clinic|company)\b/i.test(prompt);
  const add = (label: string, purpose: string, stateful = false) => {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (entities.some((entity) => entity.id === id)) return;
    entities.push({
      id, label, purpose,
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        ...(stateful ? [{ name: 'status', type: `${id}_status`, required: true }] : []),
        { name: 'created_at', type: 'timestamp', required: true },
        { name: 'updated_at', type: 'timestamp', required: true },
      ],
      relationships: [], ownership: actors[0]?.id ?? 'system', tenantBoundary: tenantRequired ? 'tenant_id' : null,
      retention: 'product-defined retention policy', deletion: 'soft', audit: stateful,
    });
  };
  if (/\b(account|login|auth|member|user|patient|customer|staff)\b/i.test(prompt)) add('Account', 'Authenticated actor identity and lifecycle', true);
  if (tenantRequired) add('Organisation', 'Tenant and ownership boundary', true);
  const behaviourEntities: Array<[RegExp, string, string, boolean]> = [
    [/\b(book|booking|appointment|reservation|schedule)\b/i, 'Appointment', 'A time-bound reservation between actors', true],
    [/\b(inventory|warehouse|stock|shipment|delivery|logistics)\b/i, 'Inventory movement', 'A traceable movement of goods or stock', true],
    [/\b(ticket|request|case|application|submission|approval)\b/i, 'Request', 'A submitted unit of work requiring lifecycle handling', true],
    [/\b(document|file|media|upload|asset)\b/i, 'Asset', 'Stored input or generated product asset', true],
    [/\b(message|conversation|chat|comment)\b/i, 'Message', 'Communication exchanged between actors', false],
    [/\b(job|task|queue|process|pipeline|transform)\b/i, 'Job', 'A bounded executable unit with retry and result state', true],
    [/\b(product|listing|catalog|order|purchase)\b/i, 'Order', 'A requested exchange with fulfilment state', true],
    [/\b(cart|checkout|discount|tax|shipping|fulfil|fulfill|return|refund|subscription|marketplace|vendor|payout)\b/i, 'Commerce transaction', 'A durable commerce lifecycle with fulfilment and financial state', true],
    [/\b(article|content|publish|draft|moderation|transcod|video|audio|image processing)\b/i, 'Content item', 'A versioned content or media asset with processing state', true],
    [/\b(report|metric|evaluation|score|assessment)\b/i, 'Evaluation', 'A versioned measurement or report result', true],
  ];
  for (const [pattern, label, purpose, stateful] of behaviourEntities) if (pattern.test(prompt)) add(label, purpose, stateful);
  if (!entities.length) add('Record', 'Primary domain record inferred from the requested workflow', true);
  const organisation = entities.find((entity) => entity.id === 'organisation');
  if (organisation) {
    for (const entity of entities.filter((candidate) => candidate.id !== organisation.id)) {
      entity.relationships.push({ target: organisation.id, kind: 'many_to_many', required: true });
    }
  }
  return entities;
}

function inferLifecycle(entity: DomainEntityDefinition, prompt: string): LifecycleDefinition | null {
  if (!entity.fields.some((field) => field.name === 'status')) return null;
  let states = ['draft', 'active', 'archived'];
  if (/\b(book|appointment|reservation|schedule)\b/i.test(prompt)) states = ['requested', 'confirmed', 'completed', 'cancelled'];
  else if (/\b(queue|job|process|pipeline|transform)\b/i.test(prompt)) states = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
  else if (/\b(approval|approve|submission|review)\b/i.test(prompt)) states = ['draft', 'submitted', 'approved', 'rejected', 'archived'];
  else if (/\b(order|fulfil|fulfill|refund|shipment)\b/i.test(prompt)) states = ['created', 'reserved', 'fulfilled', 'cancelled'];
  const terminal = states.filter((state) => /completed|cancelled|rejected|archived|fulfilled/.test(state));
  return {
    id: `${entity.id}_lifecycle`, entity: entity.id, initialState: states[0], terminalStates: terminal,
    transitions: states.slice(1).map((to, index) => ({
      from: states[index], to, actors: ['authorised_actor'], preconditions: [`${entity.id} is currently ${states[index]}`],
      sideEffects: ['persist transition atomically', 'append audit history'], events: [`${entity.id}.${to}`],
      idempotency: `repeat transition to ${to} returns the existing result`, failureBehaviour: 'retain previous valid state', audit: true,
    })),
  };
}

function workflowFromPhrase(value: string, actors: ProductActor[], entities: DomainEntityDefinition[], critical: boolean): ProductWorkflow {
  const id = stableId('workflow', value);
  return {
    id, objective: value, actors: actors.map((actor) => actor.id),
    steps: ['validate actor and input', 'execute domain operation', 'persist outcome', 'return evidence-backed result'],
    data: entities.map((entity) => entity.id), permissions: ['authorise operation server-side'],
    failureStates: ['validation rejected', 'authorisation rejected', 'dependency unavailable', 'operation failed'],
    evidence: ['validated output', 'state transition or immutable result'], critical,
  };
}

export function synthesizeProductDefinition(input: { prompt: string; repositoryFiles?: ProjectFile[]; now?: Date }): ProductDefinitionV1 {
  const prompt = redactSecrets(input.prompt).trim();
  if (!prompt) throw new Error('A product outcome is required');
  const actors = inferActors(prompt);
  const entities = inferEntities(prompt, actors);
  const allPhrases = phrases(prompt);
  const workflows = (allPhrases.length ? allPhrases : [prompt]).map((value, index) => workflowFromPhrase(value, actors, entities, index < 3));
  const tenantRequired = actors.some((actor) => actor.tenantScope === 'organisation');
  const roles = unique(actors.flatMap((actor) => actor.roles));
  const permissions = entities.flatMap((entity) => roles.map<PermissionDefinition>((role) => ({
    id: stableId('permission', `${role}:${entity.id}:manage`), actor: role, operation: role === 'user' ? 'read_and_update' : 'manage',
    resource: entity.id, scope: role === 'administrator' ? 'global' : tenantRequired ? 'tenant' : 'own',
    enforcement: tenantRequired ? 'both' : 'server', audit: role !== 'user',
    denialTest: `${role} outside the allowed ${tenantRequired ? 'tenant' : 'ownership'} boundary is rejected`,
  })));
  const requiresAuth = /\b(auth|login|account|member|staff|admin|private|tenant|patient|customer)\b/i.test(prompt) || actors.length > 1;
  const integrations: IntegrationRequirement[] = [];
  const addIntegration = (purpose: string, operations: string[], fields: string[] = []) => integrations.push({
    id: stableId('integration', purpose), purpose, operations, ownership: 'user_owned', credentialFields: fields,
    externalSetupRequired: fields.length > 0, authoritativeSourceRequired: fields.length > 0,
  });
  if (/\b(email|notification|invite|magic link)\b/i.test(prompt)) addIntegration('transactional communication', ['send', 'delivery_status'], ['EMAIL_PROVIDER_API_KEY']);
  if (/\b(calendar|calendar sync)\b/i.test(prompt)) addIntegration('calendar synchronisation', ['read_availability', 'create_event', 'cancel_event'], ['CALENDAR_ACCESS_TOKEN']);
  if (/\b(external api|third[- ]party|webhook)\b/i.test(prompt)) addIntegration('external API integration', ['request', 'receive_webhook'], ['PROVIDER_ACCESS_TOKEN', 'PROVIDER_WEBHOOK_SECRET']);
  if (/\b(ai|model|llm|embedding|rag)\b/i.test(prompt)) addIntegration('user-owned AI provider', ['generate', 'health_check'], ['AI_PROVIDER_API_KEY']);
  if (/\b(payment|checkout|charge|refund|subscription)\b/i.test(prompt)) addIntegration('user-owned payment provider', ['create', 'verify_webhook', 'refund'], ['PAYMENT_SECRET_KEY', 'PAYMENT_WEBHOOK_SECRET']);
  if (/\b(custom domain|domain connect|dns|buy domain)\b/i.test(prompt)) addIntegration('user-owned domain provider', ['detect', 'authorise', 'configure', 'verify'], ['DOMAIN_PROVIDER_ACCESS_TOKEN']);
  if (/\b(blockchain|smart contract|web3|on[- ]chain|wallet authentication|wallet connect|evm|solana|soroban|stellar)\b/i.test(prompt)) addIntegration('user-owned chain infrastructure', ['wallet_authenticate', 'submit_transaction', 'index_events'], ['CHAIN_RPC_API_KEY', 'DEPLOYMENT_SIGNER_REFERENCE']);
  const repositoryFiles = input.repositoryFiles ?? [];
  const manifests = repositoryFiles.filter((file) => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|composer\.json)$/.test(file.path)).map((file) => file.path);
  const requiredCredentials = unique(integrations.flatMap((integration) => integration.credentialFields));
  const objective = allPhrases[0] ?? prompt;
  const deploymentTargets = unique([
    /\b(web|website|dashboard|portal|storefront|admin console)\b/i.test(prompt) ? 'user-owned web deployment' : '',
    /\b(mobile|android|ios)\b/i.test(prompt) ? 'user-owned mobile build' : '',
    /\b(browser extension)\b/i.test(prompt) ? 'user-owned browser extension package' : '',
    /\b(cli|command line)\b/i.test(prompt) ? 'user-owned package or release artifact' : '',
    /\b(api|backend service)\b/i.test(prompt) ? 'user-owned service deployment' : '',
    /\b(smart contract|program deploy|soroban)\b/i.test(prompt) ? 'owner-authorised chain deployment' : '',
  ]);
  return {
    schema: 'xroga.product-definition', schemaVersion: PRODUCT_DEFINITION_SCHEMA_VERSION,
    migrationPath: ['0.x -> 1.0.0: normalize actors, workflows, domain entities, permissions and evidence requirements'],
    id: stableId('product', prompt), objective,
    targetUsers: actors.filter((actor) => actor.kind === 'human').map((actor) => actor.label), personas: [], actors,
    organisations: { required: tenantRequired, model: tenantRequired ? 'user-owned organisation with membership' : 'not required' },
    teams: { required: /\b(team|staff|department)\b/i.test(prompt), model: 'role-bearing membership' },
    tenants: { required: tenantRequired, isolation: tenantRequired ? 'tenant identifier enforced server-side and in storage policies' : 'single owner boundary' },
    journeys: workflows.map((workflow) => workflow.objective), criticalWorkflows: workflows.filter((workflow) => workflow.critical),
    secondaryWorkflows: workflows.filter((workflow) => !workflow.critical),
    functionalRequirements: workflows.map((workflow) => ({ id: stableId('requirement', workflow.objective), statement: workflow.objective, priority: workflow.critical ? 'required' : 'recommended', status: 'specified', source: 'explicit', verification: workflow.evidence })),
    nonFunctionalRequirements: [
      { id: 'nfr-security', statement: 'Authorisation is enforced at the trusted execution boundary', priority: 'required', status: 'assumed', source: 'inferred_from_workflow', verification: ['negative permission tests'] },
      { id: 'nfr-recovery', statement: 'Failures preserve the last valid state and expose evidence', priority: 'required', status: 'assumed', source: 'inferred_from_workflow', verification: ['failure and retry tests'] },
    ],
    domainEntities: entities, relationships: entities.flatMap((entity) => entity.relationships.map((relation) => `${entity.id} ${relation.kind} ${relation.target}`)),
    lifecycles: entities.map((entity) => inferLifecycle(entity, prompt)).filter((value): value is LifecycleDefinition => Boolean(value)),
    businessRules: ['Only valid lifecycle transitions are accepted', 'Mutations are idempotent where retries are possible'],
    validationRules: ['Validate input schemas before side effects', 'Validate ownership and tenant scope before data access'], permissions,
    ownershipRules: ['Every mutable resource has an explicit owner or tenant'], tenantBoundaries: tenantRequired ? ['Cross-tenant access is denied in server and persistence layers'] : [],
    integrations, events: unique(entities.flatMap((entity) => [`${entity.id}.created`, `${entity.id}.updated`])),
    notifications: /\b(notification|email|alert|remind)\b/i.test(prompt) ? ['Notify authorised recipients after verified state changes'] : [],
    scheduledWork: /\b(schedule|cron|daily|weekly|remind)\b/i.test(prompt) ? ['Execute scheduled work with idempotency and retry evidence'] : [],
    backgroundWork: /\b(queue|background|process|pipeline|worker|async)\b/i.test(prompt) ? ['Execute bounded background jobs with retry and dead-letter state'] : [],
    apis: /\b(api|integration|webhook|client|mobile|frontend)\b/i.test(prompt) ? ['Versioned API for required product operations'] : [],
    webhooks: /\bwebhook\b/i.test(prompt) ? ['Signed, replay-protected webhook receiver'] : [],
    imports: /\bimport|upload|ingest\b/i.test(prompt) ? ['Validated, bounded import'] : [], exports: /\bexport|download\b/i.test(prompt) ? ['Authorised data export'] : [],
    reports: /\breport|dashboard|analytics\b/i.test(prompt) ? ['Evidence-backed report derived from persisted data'] : [],
    search: /\bsearch|find|filter\b/i.test(prompt) ? ['Permission-filtered search'] : [], analytics: /\banalytics|metric\b/i.test(prompt) ? ['Privacy-safe product events'] : [],
    storage: entities.length && !/\b(no (?:database|storage|persistence)|stateless|stdout only)\b/i.test(prompt)
      ? ['Persist domain entities and audit history using a selected user-owned or local store'] : [],
    realtime: /\brealtime|real-time|live collaboration|presence\b/i.test(prompt) ? ['Authorised realtime updates with reconnect reconciliation'] : [],
    offline: /\boffline|local-first\b/i.test(prompt) ? ['Local operation queue and deterministic conflict reconciliation'] : [],
    deviceCapabilities: /\b(camera|gps|bluetooth|sensor|device)\b/i.test(prompt) ? ['Explicitly authorised device capability'] : [],
    aiCapabilities: /\b(ai|model|llm|rag|embedding)\b/i.test(prompt) ? ['Provider-backed AI operation with structured output and evaluation'] : [],
    paymentCapabilities: /\b(payment|checkout|refund|subscription)\b/i.test(prompt) ? ['Provider-backed payment lifecycle with verified webhooks'] : [],
    domainCapabilities: workflows.map((workflow) => workflow.objective),
    blockchainCapabilities: /\b(blockchain|smart contract|web3|on[- ]chain|wallet authentication|wallet connect|evm|solana|soroban|stellar)\b/i.test(prompt)
      ? unique([/\b(evm|ethereum|polygon|base|arbitrum|optimism)\b/i.test(prompt) ? 'evm' : '', /\bsolana\b/i.test(prompt) ? 'solana' : '', /\b(stellar|soroban)\b/i.test(prompt) ? 'stellar_soroban' : '', 'runtime-verified chain integration']) : [],
    contractRequirements: /\b(smart contract|contract deploy|program deploy|soroban)\b/i.test(prompt) ? ['Specify invariants, roles, upgrade policy and emergency controls before implementation'] : [],
    walletRequirements: /\b(wallet|sign[- ]in with ethereum|siwe)\b/i.test(prompt) ? ['One-time domain- and chain-bound challenge; user-owned signing; no raw private material'] : [],
    hackathonRequirements: /\bhackathon\b/i.test(prompt) ? ['Reproducible setup, demo fixture and judge-verifiable evidence'] : [],
    testnetEvidenceRequirements: /\b(blockchain|smart contract|web3|on[- ]chain|wallet|evm|solana|soroban|stellar)\b/i.test(prompt) ? ['Local deterministic chain test first; testnet transaction evidence requires user-owned infrastructure'] : [],
    webResearchRequirements: /\b(latest|current|research|official documentation|web search)\b/i.test(prompt) ? ['Retrieve current authoritative web sources'] : [],
    xSearchRequirements: /\b(?:x search|x\.com|twitter)\b/i.test(prompt) ? ['Retrieve X posts as non-authoritative discovery sources'] : [],
    researchRequirements: /\b(latest|current|research|official documentation|web search|x search|x\.com|twitter)\b/i.test(prompt) ? ['Retrieve current sources and verify consequential facts with authoritative sources'] : [],
    sourceAuthorityRequirements: integrations.length ? ['Provider-specific facts require official documentation and expiry'] : [],
    researchConstraints: { freshness: 'record source timestamp and expiry', budget: 'bounded by run budget', citationsRequired: integrations.length > 0 },
    authentication: {
      required: requiresAuth,
      methods: requiresAuth ? ['owner-selected password, passwordless or OAuth provider'] : [],
      serviceAccounts: actors.some((actor) => actor.kind === 'service'),
      sessionRequirements: requiresAuth ? ['server-validated session', 'revocation takes effect', 'account deletion and export are authorised'] : [],
    },
    deploymentTargets: deploymentTargets.length ? deploymentTargets : /\b(desktop|local-only)\b/i.test(prompt) ? ['user-owned desktop artifact'] : ['user-owned deployment target'],
    quality: {
      availability: ['critical workflows fail safely when dependencies are unavailable'], performance: ['budgets and timeouts are explicit'],
      security: ['least privilege', 'secret redaction', 'server-side authorisation'], privacy: ['data minimisation and owner-controlled retention'],
      accessibility: ['keyboard and semantic access for interactive interfaces', 'automated accessibility checks plus documented manual review'],
      internationalisation: /\b(i18n|international|multiple locales|rtl|right-to-left|translation)\b/i.test(prompt) ? ['locale routing and translation resources', 'locale-safe dates, times, numbers and currency', 'RTL layout verification when required'] : ['locale-safe dates, times and text'], compliance: [],
    },
    evidenceRequirements: ['generated file evidence', 'validation command evidence', 'critical workflow test evidence', 'external provider evidence when used'],
    externalBlockers: requiredCredentials.map((credential) => `User-owned ${credential} must be supplied and validated before live use`),
    userOwnedInfrastructure: unique(['source repository', ...integrations.map((integration) => integration.purpose)]), userOwnedCredentials: requiredCredentials,
    unsupportedRequirements: [], assumptions: requiresAuth ? ['Authentication method remains selectable until the owner chooses a provider'] : [],
    limitations: ['External systems remain incomplete until authenticated verification succeeds'],
    repositoryContext: { present: repositoryFiles.length > 0, fileCount: repositoryFiles.length, detectedManifests: manifests },
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

export function migrateProductDefinition(input: Record<string, unknown>): ProductDefinitionV1 {
  if (input.schema === 'xroga.product-definition' && input.schemaVersion === PRODUCT_DEFINITION_SCHEMA_VERSION) return input as unknown as ProductDefinitionV1;
  const prompt = typeof input.objective === 'string' ? input.objective : typeof input.prompt === 'string' ? input.prompt : 'Migrate legacy product definition';
  const migrated = synthesizeProductDefinition({ prompt, now: new Date(String(input.createdAt ?? new Date().toISOString())) });
  migrated.assumptions.push('Migrated from a legacy product-definition record; revalidate inferred requirements');
  return migrated;
}
