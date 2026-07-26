import { createHash } from 'crypto';
import type { ProjectFile } from '../ai/patches.js';
import type { DynamicCapabilityGraph } from './capabilityGraph.js';
import type { ProductDefinitionV1 } from './productDefinition.js';

export type ArchitectureKind =
  | 'static_site' | 'server_rendered_application' | 'single_page_application' | 'full_stack_web_application'
  | 'api_service' | 'serverless_system' | 'long_running_service' | 'background_worker' | 'scheduled_system'
  | 'event_driven_system' | 'message_queue_system' | 'realtime_system' | 'multi_tenant_system' | 'single_tenant_system'
  | 'mobile_application' | 'desktop_application' | 'browser_extension' | 'command_line_tool' | 'library' | 'sdk'
  | 'data_pipeline' | 'streaming_system' | 'ai_pipeline' | 'rag_system' | 'search_system' | 'vector_system'
  | 'local_first_application' | 'offline_first_application' | 'device_integrated_application' | 'blockchain_application'
  | 'multi_service_product' | 'multi_repository_product' | 'multi_output_product';

export interface ArchitectureDecision {
  schemaVersion: '1.0.0';
  migrationPath: string[];
  primary: ArchitectureKind;
  supporting: ArchitectureKind[];
  needsFrontend: boolean;
  needsBackend: boolean;
  needsPersistentStorage: boolean;
  needsLongRunningRuntime: boolean;
  tenancy: 'none' | 'single_tenant' | 'multi_tenant';
  reasoning: string[];
  tradeoffs: string[];
  rejected: Array<{ architecture: ArchitectureKind; reason: string }>;
}

export interface FrameworkAdapter {
  schemaVersion: '1.0.0';
  migrationPath: string[];
  id: string;
  initialize: { command?: string; requiredFiles: string[] };
  fileConventions: string[];
  routingConventions: string[];
  configurationFiles: string[];
  environmentHandling: string;
  buildCommand: string | null;
  testCommand: string | null;
  productionVerification: string[];
  deploymentCompatibility: string[];
  runtimeLimitations: string[];
  integrationPoints: string[];
  repairStrategy: string[];
  source: { kind: 'existing' | 'official_documentation_required'; reference: string; verifiedAt?: string; expiresAt?: string };
}

export interface ProviderAdapter {
  schemaVersion: '1.0.0';
  migrationPath: string[];
  id: string;
  capabilityIds: string[];
  authentication: string;
  secretRequirements: string[];
  operations: string[];
  supportedNetworks: Array<{ family: string; network: string; chainId?: string; source?: string; expiresAt?: string }>;
  webhooks: string[];
  retryPolicy: string;
  idempotency: string;
  errorNormalisation: string[];
  modes: Array<'local' | 'sandbox' | 'test' | 'live'>;
  verification: string[];
  healthCheck: string;
  disconnection: string;
  secretRotation: string;
  environmentSynchronisation: string;
  pricingLimitations: Array<{ statement: string; source: string; expiresAt: string }>;
  evidence: string[];
  limitations: string[];
  userOwned: boolean;
  source: { authority: string; verifiedAt: string; expiresAt: string } | null;
}

export type CredentialClassification =
  | 'public_config' | 'server_secret' | 'webhook_secret' | 'access_token' | 'refresh_token' | 'private_key'
  | 'signing_key' | 'restricted_identifier' | 'wallet_public_address' | 'deployment_signer_reference'
  | 'rpc_api_key' | 'explorer_api_key' | 'indexer_api_key' | 'search_api_key' | 'research_api_key' | 'X_search_api_key';

export interface CredentialPolicy {
  field: string;
  classification: CredentialClassification;
  exposure: 'browser_allowed' | 'server_only' | 'reference_only';
  encryptedAtRest: boolean;
  modelContext: 'never' | 'redacted_reference' | 'strictly_required';
  syncTargets: string[];
  rotationRequired: boolean;
}

const browserPublicAllowList = new Set([
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'PUBLIC_APP_URL', 'VITE_PUBLIC_APP_URL', 'WALLET_PUBLIC_ADDRESS',
]);

export function classifyCredentialField(field: string): CredentialPolicy {
  const name = field.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid credential field: ${field}`);
  let classification: CredentialClassification = 'server_secret';
  let exposure: CredentialPolicy['exposure'] = 'server_only';
  if (browserPublicAllowList.has(name)) { classification = name.includes('WALLET') ? 'wallet_public_address' : 'public_config'; exposure = 'browser_allowed'; }
  else if (/WEBHOOK.*SECRET|SIGNATURE.*SECRET/.test(name)) classification = 'webhook_secret';
  else if (/REFRESH.*TOKEN/.test(name)) classification = 'refresh_token';
  else if (/ACCESS.*TOKEN|(?:^|_)TOKEN$/.test(name)) classification = 'access_token';
  else if (/PRIVATE.*KEY|KEY_P8|SERVICE_ACCOUNT_JSON/.test(name)) classification = 'private_key';
  else if (/SIGNING.*KEY|SIGNER.*KEY/.test(name)) classification = 'signing_key';
  else if (/SIGNER.*REFERENCE|MULTISIG.*ADDRESS/.test(name)) { classification = 'deployment_signer_reference'; exposure = 'reference_only'; }
  else if (/WALLET.*ADDRESS/.test(name)) { classification = 'wallet_public_address'; exposure = 'browser_allowed'; }
  else if (/RPC.*KEY/.test(name)) classification = 'rpc_api_key';
  else if (/EXPLORER.*KEY/.test(name)) classification = 'explorer_api_key';
  else if (/INDEXER.*KEY/.test(name)) classification = 'indexer_api_key';
  else if (/XAI.*KEY|X_SEARCH.*KEY/.test(name)) classification = 'X_search_api_key';
  else if (/TAVILY|RESEARCH.*KEY/.test(name)) classification = 'research_api_key';
  else if (/SEARCH.*KEY/.test(name)) classification = 'search_api_key';
  else if (/CLIENT_ID|PROJECT_ID|STORE_ID|VARIANT_ID|ISSUER_ID/.test(name)) classification = 'restricted_identifier';
  // Prefixes never override secret semantics. NEXT_PUBLIC_PAYMENT_SECRET_KEY remains server-only.
  if (/SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN|SIGNING/.test(name)) exposure = 'server_only';
  return {
    field: name, classification, exposure, encryptedAtRest: exposure !== 'browser_allowed',
    modelContext: exposure === 'browser_allowed' ? 'redacted_reference' : 'never',
    syncTargets: exposure === 'browser_allowed' ? ['generated public environment'] : exposure === 'reference_only' ? ['deployment metadata'] : ['trusted server environment'],
    rotationRequired: !['public_config', 'restricted_identifier', 'wallet_public_address', 'deployment_signer_reference'].includes(classification),
  };
}

function has(prompt: ProductDefinitionV1, pattern: RegExp): boolean {
  return pattern.test([prompt.objective, ...prompt.journeys, ...prompt.domainCapabilities].join(' '));
}

export function selectArchitecture(definition: ProductDefinitionV1, graph: DynamicCapabilityGraph): ArchitectureDecision {
  const cli = has(definition, /\b(cli|command line|terminal utility)\b/i);
  const library = has(definition, /\b(library|sdk|package)\b/i);
  const browser = has(definition, /\b(browser extension|content script)\b/i);
  const mobile = has(definition, /\b(mobile|android|ios|device app)\b/i);
  const desktop = has(definition, /\bdesktop|electron|tauri\b/i);
  const interactive = !cli && !library && !/\b(api[- ]only|worker[- ]only|headless)\b/i.test(definition.objective);
  const persistent = definition.storage.length > 0;
  const backend = persistent || definition.apis.length > 0 || definition.integrations.length > 0 || definition.permissions.length > 0 || definition.backgroundWork.length > 0;
  let primary: ArchitectureKind = 'static_site';
  if (cli) primary = 'command_line_tool';
  else if (library) primary = has(definition, /sdk/i) ? 'sdk' : 'library';
  else if (browser) primary = 'browser_extension';
  else if (mobile) primary = 'mobile_application';
  else if (desktop) primary = 'desktop_application';
  else if (!interactive && definition.backgroundWork.length) primary = 'background_worker';
  else if (!interactive && definition.apis.length) primary = 'api_service';
  else if (backend) primary = 'full_stack_web_application';
  const supporting: ArchitectureKind[] = [];
  if (definition.backgroundWork.length) supporting.push('background_worker');
  if (definition.scheduledWork.length) supporting.push('scheduled_system');
  if (definition.realtime.length) supporting.push('realtime_system');
  if (definition.offline.length) supporting.push('offline_first_application');
  if (definition.aiCapabilities.length) supporting.push('ai_pipeline');
  if (graph.nodes.length > 8 && supporting.length > 1) supporting.push('multi_service_product');
  const tenancy = definition.tenants.required ? 'multi_tenant' : definition.actors.length ? 'single_tenant' : 'none';
  return {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial architecture-decision schema'], primary, supporting: [...new Set(supporting)], needsFrontend: interactive,
    needsBackend: backend, needsPersistentStorage: persistent, needsLongRunningRuntime: definition.backgroundWork.length > 0,
    tenancy,
    reasoning: [
      `Selected ${primary} from required workflows and runtime behaviour`,
      interactive ? 'Interactive journeys require a user-facing surface' : 'No interactive frontend is required by the requested outcome',
      persistent ? 'Domain state and audit history require persistence' : 'No persistent store is forced',
      backend ? 'Trusted operations require a server or local trusted runtime' : 'No backend is forced',
    ],
    tradeoffs: ['Prefer the smallest architecture that satisfies critical workflows', 'Split services only when runtime or scaling boundaries require it'],
    rejected: [
      ...(primary !== 'full_stack_web_application' ? [{ architecture: 'full_stack_web_application' as const, reason: 'Not required by the requested workflows' }] : []),
      ...(!persistent ? [{ architecture: 'multi_tenant_system' as const, reason: 'No tenant-scoped persistent data is required' }] : []),
    ],
  };
}

const packageContent = (files: ProjectFile[]) => files.find((file) => /(^|\/)package\.json$/.test(file.path))?.content ?? '';

export const FRAMEWORK_ADAPTERS: FrameworkAdapter[] = [
  {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: 'static-web',
    initialize: { requiredFiles: ['index.html'] }, fileConventions: ['index.html', 'assets/**'], routingConventions: ['file-based URLs'], configurationFiles: [],
    environmentHandling: 'No secrets in browser files', buildCommand: null, testCommand: null,
    productionVerification: ['HTML structure validation', 'runtime preview'], deploymentCompatibility: ['static hosting', 'object storage'], runtimeLimitations: ['browser-only trusted boundary'],
    integrationPoints: ['HTTP APIs'], repairStrategy: ['target affected HTML, CSS or JavaScript'], source: { kind: 'existing', reference: 'backend/src/services/projectScaffold.ts' },
  },
  {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: 'nextjs-app-router',
    initialize: { command: 'create-next-app', requiredFiles: ['package.json', 'app/layout.tsx', 'app/page.tsx'] },
    fileConventions: ['app/**', 'public/**'], routingConventions: ['App Router file conventions', 'route.ts for HTTP endpoints'], configurationFiles: ['next.config.*', 'tsconfig.json'],
    environmentHandling: 'Server secrets remain server-only; explicitly approved public config may use NEXT_PUBLIC_', buildCommand: 'npm run build', testCommand: 'npm test',
    productionVerification: ['next build exits 0', 'critical routes render'], deploymentCompatibility: ['Node.js hosting', 'Vercel'], runtimeLimitations: ['Edge runtime excludes Node-only APIs'],
    integrationPoints: ['Route Handlers', 'Server Components', 'Server Actions'], repairStrategy: ['repair affected route/module then rerun next build'],
    source: { kind: 'existing', reference: 'backend/src/services/scaffolds/nextjsScaffold.ts' },
  },
  {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: 'expo', initialize: { requiredFiles: ['package.json', 'app.json'] },
    fileConventions: ['app/**', 'assets/**'], routingConventions: ['Expo Router'], configurationFiles: ['app.json', 'eas.json'], environmentHandling: 'Secrets are supplied to trusted build/runtime environments',
    buildCommand: 'npx expo export', testCommand: 'npm test', productionVerification: ['Expo export/build succeeds'], deploymentCompatibility: ['EAS', 'self-owned store accounts'], runtimeLimitations: ['native APIs require device permissions'],
    integrationPoints: ['native modules', 'HTTP APIs'], repairStrategy: ['target affected platform and rerun export'], source: { kind: 'existing', reference: 'backend/src/services/scaffolds/expoScaffold.ts' },
  },
  {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: 'browser-extension', initialize: { requiredFiles: ['manifest.json'] },
    fileConventions: ['manifest.json', 'background.*', 'content.*', 'popup.*'], routingConventions: ['extension entry points'], configurationFiles: ['manifest.json'], environmentHandling: 'No server secrets in extension bundles',
    buildCommand: 'npm run build', testCommand: 'npm test', productionVerification: ['manifest validation', 'extension bundle produced'], deploymentCompatibility: ['user-owned browser publisher account'], runtimeLimitations: ['browser extension permission model'],
    integrationPoints: ['background worker', 'content scripts'], repairStrategy: ['repair affected entry point and validate permissions'], source: { kind: 'existing', reference: 'backend/src/services/scaffolds/chromeExtensionScaffold.ts' },
  },
  {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: 'node-cli', initialize: { requiredFiles: ['package.json', 'src/cli.ts'] },
    fileConventions: ['src/**', 'test/**'], routingConventions: ['subcommands and flags'], configurationFiles: ['package.json', 'tsconfig.json'], environmentHandling: 'Read credentials from process environment or OS credential store',
    buildCommand: 'npm run build', testCommand: 'npm test', productionVerification: ['compiled CLI exits successfully for --help', 'fixture command executes'], deploymentCompatibility: ['npm package', 'release archive', 'local executable'], runtimeLimitations: ['local runtime permissions'],
    integrationPoints: ['stdin/stdout', 'filesystem', 'HTTP APIs'], repairStrategy: ['repair affected command and rerun command fixture'], source: { kind: 'official_documentation_required', reference: 'selected runtime official documentation' },
  },
];

export function selectFrameworkAdapter(architecture: ArchitectureDecision, files: ProjectFile[] = []): FrameworkAdapter {
  const manifest = packageContent(files);
  const detectedId = /"expo"/.test(manifest) ? 'expo'
    : /"next"/.test(manifest) ? 'nextjs-app-router'
      : /"bin"\s*:/.test(manifest) ? 'node-cli'
        : files.some((file) => file.path === 'manifest.json') ? 'browser-extension'
          : files.some((file) => file.path === 'index.html') ? 'static-web' : null;
  const detected = FRAMEWORK_ADAPTERS.find((adapter) => adapter.id === detectedId);
  if (detected) return detected;
  const preferred = architecture.primary === 'command_line_tool' ? 'node-cli'
    : architecture.primary === 'browser_extension' ? 'browser-extension'
      : architecture.primary === 'mobile_application' ? 'expo'
        : architecture.primary === 'static_site' ? 'static-web' : 'nextjs-app-router';
  return FRAMEWORK_ADAPTERS.find((adapter) => adapter.id === preferred)!;
}

/** Builds an unfamiliar framework contract only from caller-verified official facts. */
export function createFrameworkAdapterFromVerifiedSource(input: {
  id: string;
  officialSource: string;
  verifiedAt: string;
  expiresAt: string;
  requiredFiles: string[];
  buildCommand: string;
  testCommand: string;
  productionVerification: string[];
}): FrameworkAdapter {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) throw new Error('Framework adapter ID must be a safe stable identifier');
  if (!/^https:\/\//.test(input.officialSource)) throw new Error('Framework adapter synthesis requires an HTTPS official source');
  if (new Date(input.expiresAt).getTime() <= new Date(input.verifiedAt).getTime()) throw new Error('Framework source facts require a future expiry');
  if (!input.requiredFiles.length || !input.buildCommand.trim() || !input.testCommand.trim() || !input.productionVerification.length) {
    throw new Error('Framework adapter cannot be completed without files, test, build and production verification contracts');
  }
  return {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial framework-adapter schema'], id: input.id,
    initialize: { requiredFiles: input.requiredFiles }, fileConventions: [], routingConventions: [], configurationFiles: [],
    environmentHandling: 'Classify every field; keep secrets in a trusted runtime', buildCommand: input.buildCommand,
    testCommand: input.testCommand, productionVerification: input.productionVerification,
    deploymentCompatibility: [], runtimeLimitations: ['Only verified official-source behavior is supported'], integrationPoints: [],
    repairStrategy: ['target the failed official build or test contract'],
    source: { kind: 'official_documentation_required', reference: input.officialSource, verifiedAt: input.verifiedAt, expiresAt: input.expiresAt },
  };
}

export function createProviderAdapter(input: {
  id: string; capabilityIds: string[]; operations: string[]; authentication?: string; secrets?: string[];
  source?: { authority: string; verifiedAt: string; expiresAt: string };
}): ProviderAdapter {
  if (!input.id.trim() || !input.operations.length) throw new Error('Provider adapter identity and operations are required');
  if (input.source && (!/^https:\/\//.test(input.source.authority) || new Date(input.source.expiresAt).getTime() <= new Date(input.source.verifiedAt).getTime())) {
    throw new Error('Provider source must be authoritative and have a valid expiry');
  }
  return {
    schemaVersion: '1.0.0', migrationPath: ['1.0.0 is the initial provider-adapter schema'], id: input.id, capabilityIds: input.capabilityIds,
    authentication: input.authentication ?? (input.secrets?.length ? 'user-owned server credential' : 'none'), secretRequirements: input.secrets ?? [], operations: input.operations,
    supportedNetworks: [], webhooks: [], retryPolicy: 'retry only normalised transient failures with bounded exponential backoff',
    idempotency: 'use operation-specific idempotency key before retrying side effects',
    errorNormalisation: ['authentication', 'rate_limit', 'timeout', 'invalid_request', 'not_found', 'transient'],
    modes: input.secrets?.length ? ['sandbox', 'test', 'live'] : ['local'],
    verification: ['authenticated health request when credentials are required', 'operation-specific result evidence'], healthCheck: 'safe authenticated capability probe',
    disconnection: 'revoke or delete stored credentials and stop future calls', secretRotation: 'replace encrypted credential and invalidate prior health state',
    environmentSynchronisation: 'sync only to explicitly authorised trusted runtimes', pricingLimitations: [],
    evidence: ['safe provider identity', 'operation identifier', 'response status', 'timestamp'], limitations: input.source ? [] : ['Current provider-specific facts require official-source verification'],
    userOwned: true, source: input.source ?? null,
  };
}

export interface DependencyInventoryEntry {
  name: string;
  version: string;
  licence: string | null;
  source: string;
  securityCritical: boolean;
}

export function dependencyInventory(files: ProjectFile[]): { entries: DependencyInventoryEntry[]; blockers: string[]; digest: string } {
  const lock = files.find((file) => file.path === 'package-lock.json');
  const entries: DependencyInventoryEntry[] = [];
  if (lock) {
    try {
      const parsed = JSON.parse(lock.content) as { packages?: Record<string, { version?: string; license?: string }> };
      for (const [path, value] of Object.entries(parsed.packages ?? {})) {
        const name = path.replace(/^node_modules\//, '');
        if (!name || !value.version) continue;
        entries.push({ name, version: value.version, licence: value.license ?? null, source: 'package-lock.json', securityCritical: /auth|crypto|jsonwebtoken|jose|database|supabase/i.test(name) });
      }
    } catch { /* invalid lock becomes a blocker below */ }
  }
  const blockers = entries.filter((entry) => /^(?:AGPL|GPL)-/i.test(entry.licence ?? '')).map((entry) => `Review incompatible licence: ${entry.name} ${entry.licence}`);
  if (lock && !entries.length) blockers.push('Dependency lock could not be parsed into an inventory');
  return { entries, blockers, digest: createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}
