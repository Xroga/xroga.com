export type StorageProviderId =
  | 'existing'
  | 'supabase'
  | 'upstash-redis'
  | 'upstash-vector'
  | 'neon'
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'firebase'
  | 'cloudflare'
  | 'vercel-blob'
  | 'sqlite'
  | 'local-files'
  | 'object-storage'
  | 'self-hosted';

export type StorageWorkload =
  | 'relational'
  | 'cache'
  | 'vector'
  | 'document'
  | 'blob'
  | 'local'
  | 'unknown';

export interface StorageProviderState {
  id: StorageProviderId;
  configured: boolean;
  healthy?: boolean;
}

export interface StorageSelectionInput {
  request: string;
  workload?: StorageWorkload;
  existingProviders?: StorageProviderState[];
  availableProviders?: StorageProviderState[];
  preferFree?: boolean;
}

export interface StorageSelection {
  provider: StorageProviderId | null;
  status: 'selected' | 'blocked';
  reason: string;
  reusedExisting: boolean;
  alternatives: StorageProviderId[];
  blocker?: string;
}

const PROVIDER_PATTERNS: Array<[StorageProviderId, RegExp]> = [
  ['upstash-vector', /\bupstash\s+vector\b/i],
  ['upstash-redis', /\bupstash\b|\bredis\b/i],
  ['vercel-blob', /\bvercel\s+blob\b/i],
  ['supabase', /\bsupabase\b/i],
  ['neon', /\bneon\b/i],
  ['postgres', /\bpostgres(?:ql)?\b/i],
  ['mysql', /\bmysql\b/i],
  ['mongodb', /\bmongo(?:db)?\b/i],
  ['firebase', /\bfirebase\b/i],
  ['cloudflare', /\bcloudflare\s+(?:d1|r2|kv)\b/i],
  ['sqlite', /\bsqlite\b/i],
  ['local-files', /\blocal\s+(?:file|storage)\b/i],
  ['object-storage', /\b(?:s3|object\s+storage)\b/i],
  ['self-hosted', /\bself[- ]hosted\b/i],
];

function inferredWorkload(request: string, provided?: StorageWorkload): StorageWorkload {
  if (provided && provided !== 'unknown') return provided;
  if (/\b(vector|embedding|semantic|similarity)\b/i.test(request)) return 'vector';
  if (/\b(cache|session|queue|rate\s*limit|ephemeral)\b/i.test(request)) return 'cache';
  if (/\b(image|video|audio|asset|upload|blob|binary)\b/i.test(request)) return 'blob';
  if (/\b(document|json|flexible\s+schema)\b/i.test(request)) return 'document';
  if (/\b(local|offline|single[- ]user|desktop)\b/i.test(request)) return 'local';
  if (/\b(table|relation|sql|transaction|user|account|order)\b/i.test(request)) return 'relational';
  return 'unknown';
}

function preference(request: string): StorageProviderId | undefined {
  return PROVIDER_PATTERNS.find(([, pattern]) => pattern.test(request))?.[0];
}

function isUsable(state: StorageProviderState): boolean {
  return state.configured && state.healthy === true;
}

const DEFAULTS: Record<StorageWorkload, StorageProviderId[]> = {
  relational: ['postgres', 'neon', 'supabase', 'sqlite'],
  cache: ['upstash-redis', 'cloudflare', 'self-hosted'],
  vector: ['upstash-vector', 'supabase', 'postgres'],
  document: ['mongodb', 'firebase', 'postgres'],
  blob: ['object-storage', 'vercel-blob', 'cloudflare', 'local-files'],
  local: ['sqlite', 'local-files'],
  unknown: ['postgres', 'sqlite', 'local-files'],
};

export function selectStorageProvider(input: StorageSelectionInput): StorageSelection {
  const existing = input.existingProviders ?? [];
  const available = input.availableProviders ?? [];
  const requested = preference(input.request);
  const workload = inferredWorkload(input.request, input.workload);

  if (requested) {
    const existingRequested = existing.find((provider) => provider.id === requested);
    if (existingRequested && isUsable(existingRequested)) {
      return {
        provider: requested,
        status: 'selected',
        reason: `Reusing the existing ${requested} integration requested by the user.`,
        reusedExisting: true,
        alternatives: [],
      };
    }
    const availableRequested = available.find((provider) => provider.id === requested);
    if (availableRequested && isUsable(availableRequested)) {
      return {
        provider: requested,
        status: 'selected',
        reason: `Using the user-selected ${requested} provider.`,
        reusedExisting: false,
        alternatives: DEFAULTS[workload].filter((id) => id !== requested),
      };
    }
    return {
      provider: null,
      status: 'blocked',
      reason: `The requested ${requested} provider is not currently usable.`,
      reusedExisting: false,
      alternatives: DEFAULTS[workload].filter((id) => id !== requested),
      blocker: `Configure or authorize ${requested}, then verify it with an authenticated provider probe.`,
    };
  }

  const reusable = existing.find(isUsable);
  if (reusable) {
    return {
      provider: reusable.id,
      status: 'selected',
      reason: `Reusing the project's existing ${reusable.id} storage to avoid duplicate infrastructure.`,
      reusedExisting: true,
      alternatives: DEFAULTS[workload].filter((id) => id !== reusable.id),
    };
  }

  const preferFree = input.preferFree || /\b(free|no[- ]cost|local[- ]first)\b/i.test(input.request);
  const ranked = preferFree
    ? [...new Set<StorageProviderId>(['sqlite', 'local-files', ...DEFAULTS[workload]])]
    : DEFAULTS[workload];
  const selected = ranked.find((id) => available.some((provider) => provider.id === id && isUsable(provider)));
  if (selected) {
    return {
      provider: selected,
      status: 'selected',
      reason: `Selected ${selected} for the ${workload} workload from configured, healthy providers.`,
      reusedExisting: false,
      alternatives: ranked.filter((id) => id !== selected),
    };
  }

  return {
    provider: null,
    status: 'blocked',
    reason: `No configured, healthy provider is available for the ${workload} workload.`,
    reusedExisting: false,
    alternatives: ranked,
    blocker: `Choose and configure one of: ${ranked.join(', ')}.`,
  };
}
