import { MODELS, type ModelId } from './models.js';

/** Exact OpenRouter endpoint tags, not broad provider names that match other variants. */
export const APPROVED_OPENROUTER_ENDPOINTS: Record<ModelId, readonly [
  { tag: string; provider: string }, { tag: string; provider: string },
]> = {
  deepseek_v4_flash: [
    { tag: 'baidu/fp8', provider: 'Baidu' },
    { tag: 'sail-research/fp4', provider: 'Sail Research' },
  ],
  glm_5_3_flash: [
    { tag: 'relace', provider: 'Relace' },
    { tag: 'open-inference/fp4', provider: 'OpenInference' },
  ],
  glm_5_3: [
    { tag: 'wafer/us', provider: 'Wafer' },
    { tag: 'sail-research/us', provider: 'Sail Research' },
  ],
  kimi_k3: [
    { tag: 'relace/fp4', provider: 'Relace' },
    { tag: 'sail-research/fp4', provider: 'Sail Research' },
  ],
};

/** Image payloads were tested live; Relace GLM Flash returned 404 for images. */
const VERIFIED_IMAGE_ENDPOINTS: Partial<Record<ModelId, readonly string[]>> = {
  glm_5_3_flash: ['open-inference/fp4'],
};

type EndpointRecord = {
  tag?: unknown;
  provider_name?: unknown;
  model_id?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown; input_cache_read?: unknown };
  supported_parameters?: unknown;
};

export type ValidatedEndpoint = {
  tag: string;
  provider: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cachedInputUsdPer1M: number;
  contextLength: number;
  parameters: ReadonlySet<string>;
};

export class OpenRouterEndpointError extends Error {
  readonly code = 'OPENROUTER_ENDPOINT_UNAVAILABLE' as const;
}

const cache = new Map<ModelId, { expires: number; endpoints: readonly ValidatedEndpoint[] }>();
const CATALOG_TTL_MS = 5 * 60_000;

function finitePrice(value: unknown): number | null {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
}

/** Operator configuration can tighten a cap, never silently raise the audited ceiling. */
export function modelPriceCaps(modelId: ModelId, env: NodeJS.ProcessEnv = process.env): {
  inputUsdPer1M: number; outputUsdPer1M: number;
} {
  const def = MODELS[modelId];
  const prefix = `XROGA_${modelId.toUpperCase()}_MAX`;
  const tightened = (key: string, ceiling: number | null): number => {
    if (ceiling === null) throw new OpenRouterEndpointError('Model price ceiling is absent');
    const raw = env[`${prefix}_${key}_USD_PER_1M`];
    if (!raw) return ceiling;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > ceiling) {
      throw new OpenRouterEndpointError('Invalid or elevated OpenRouter price ceiling');
    }
    return parsed;
  };
  return {
    inputUsdPer1M: tightened('INPUT', def.inputUsdPer1M),
    outputUsdPer1M: tightened('OUTPUT', def.outputUsdPer1M),
  };
}

export async function validatedOpenRouterEndpoints(
  modelId: ModelId,
  options: {
    json?: boolean;
    tools?: boolean;
    images?: boolean;
    requiredContext?: number;
    fetcher?: typeof fetch;
    now?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<ValidatedEndpoint[]> {
  // Price caps are checked on every request, even when catalog validation is cached.
  const caps = modelPriceCaps(modelId, options.env);
  if (options.images && !VERIFIED_IMAGE_ENDPOINTS[modelId]?.length) {
    throw new OpenRouterEndpointError('Image input has not been verified for this approved model');
  }
  const now = options.now ?? Date.now();
  let cached = cache.get(modelId);
  if (!cached || cached.expires <= now || options.fetcher) {
    const model = MODELS[modelId].apiModel;
    if (!model) throw new OpenRouterEndpointError('Model identifier is not approved');
    const response = await (options.fetcher ?? fetch)(
      `https://openrouter.ai/api/v1/models/${model}/endpoints`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) throw new OpenRouterEndpointError('OpenRouter endpoint catalog is unavailable');
    const body = await response.json() as { data?: { endpoints?: EndpointRecord[] } };
    const rows = body.data?.endpoints;
    if (!Array.isArray(rows)) throw new OpenRouterEndpointError('OpenRouter endpoint catalog is malformed');
    const approved: ValidatedEndpoint[] = [];
    for (const desired of APPROVED_OPENROUTER_ENDPOINTS[modelId]) {
      const row = rows.find(item => item.tag === desired.tag && item.provider_name === desired.provider
        && item.model_id === model);
      if (!row) continue;
      const input = finitePrice(row.pricing?.prompt);
      const output = finitePrice(row.pricing?.completion);
      const cacheRead = finitePrice(row.pricing?.input_cache_read);
      const contextLength = Number(row.context_length);
      if (input === null || output === null || cacheRead === null
        || input > caps.inputUsdPer1M + 1e-9 || output > caps.outputUsdPer1M + 1e-9
        || cacheRead > caps.inputUsdPer1M + 1e-9
        || !Number.isSafeInteger(contextLength) || contextLength < 1) continue;
      const parameters = new Set(Array.isArray(row.supported_parameters)
        ? row.supported_parameters.filter((item): item is string => typeof item === 'string') : []);
      approved.push({ tag: desired.tag, provider: desired.provider,
        inputUsdPer1M: input, outputUsdPer1M: output,
        cachedInputUsdPer1M: cacheRead, contextLength, parameters });
    }
    cached = { expires: now + CATALOG_TTL_MS, endpoints: approved };
    if (!options.fetcher) cache.set(modelId, cached);
  }
  const eligible = cached.endpoints.filter(endpoint =>
    endpoint.inputUsdPer1M <= caps.inputUsdPer1M + 1e-9
    && endpoint.outputUsdPer1M <= caps.outputUsdPer1M + 1e-9
    && endpoint.cachedInputUsdPer1M <= caps.inputUsdPer1M + 1e-9
    && endpoint.contextLength >= (options.requiredContext ?? 0)
    && (!options.images || VERIFIED_IMAGE_ENDPOINTS[modelId]?.includes(endpoint.tag))
    && (!options.json || endpoint.parameters.has('response_format'))
    && (!options.tools || endpoint.parameters.has('tools')));
  if (!eligible.length) throw new OpenRouterEndpointError('No approved compatible endpoint fits the price and capability caps');
  return eligible;
}

export function pinnedProviderRequest(endpoint: ValidatedEndpoint, modelId: ModelId, env: NodeJS.ProcessEnv = process.env) {
  const caps = modelPriceCaps(modelId, env);
  return {
    order: [endpoint.tag],
    only: [endpoint.tag],
    allow_fallbacks: false,
    require_parameters: true,
    max_price: { prompt: caps.inputUsdPer1M, completion: caps.outputUsdPer1M },
  };
}

export function retryOtherApprovedEndpoint(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = Number((error as Error & { status?: unknown }).status);
  const code = (error as Error & { code?: unknown }).code;
  // OpenRouter can report a pinned but currently unavailable endpoint as 404.
  // The second request remains pinned to the other approved endpoint only.
  return status === 404 || status === 408 || status === 409 || status === 429 || status >= 500
    || code === 'ETIMEDOUT' || code === 'ECONNRESET';
}
