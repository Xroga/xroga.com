import { isIP } from 'node:net';
import type { ProviderAdapter, ProviderResult } from './types.js';

function safeHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') return null;
    if (isIP(host)) {
      if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
      if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalizeProviderError(error: unknown): ProviderResult {
  const message = error instanceof Error ? error.message : 'provider request failed';
  if (/abort|timeout/i.test(message)) return { status: 'provider_unavailable', safeSummary: 'Provider request timed out', errorCategory: 'timeout' };
  if (/rate.?limit|429/i.test(message)) return { status: 'provider_unavailable', safeSummary: 'Provider rate limit reached', errorCategory: 'rate_limited' };
  return { status: 'provider_unavailable', safeSummary: 'Provider request was unavailable', errorCategory: 'provider_unavailable' };
}

export const httpVerificationAdapter: ProviderAdapter = {
  id: 'http_verification',
  supportedCapabilities: ['refresh_health', 'verify_domain', 'run_synthetic_check'],
  authenticationRequirements: [],
  environmentSupport: ['preview', 'staging', 'production', 'sandbox', 'testnet'],
  readOperations: ['GET'],
  mutationOperations: [],
  verificationMethod: 'bounded HTTPS response plus optional expected application marker',
  retryPolicy: { maxAttempts: 2, retryableCategories: ['timeout', 'provider_unavailable', 'rate_limited'] },
  rateLimitHandling: 'respect retry-after and stop after bounded attempts',
  idempotencySupport: true,
  redactionPolicy: 'never persist response headers, credentials, cookies, or response bodies beyond a safe status digest',
  async execute(capability, input) {
    if (!this.supportedCapabilities.includes(capability)) {
      return { status: 'unsupported', safeSummary: `${capability} is unsupported by ${this.id}` };
    }
    const url = safeHttpsUrl(input.url);
    if (!url) return { status: 'blocked', safeSummary: 'Verification URL is invalid or unsafe', errorCategory: 'unsafe_target' };
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json,text/plain,text/html;q=0.5' } });
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < this.retryPolicy.maxAttempts) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const delay = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 1_000) : 100 + Math.floor(Math.random() * 100);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        const body = (await response.text()).slice(0, 32_000);
        const expectedMarker = typeof input.expectedMarker === 'string' ? input.expectedMarker.slice(0, 200) : null;
        const markerMatches = expectedMarker ? body.includes(expectedMarker) : true;
        const verified = response.ok && markerMatches;
        return {
          status: verified ? 'verified' : response.status === 429 || response.status >= 500 ? 'provider_unavailable' : 'failed',
          safeSummary: verified ? `HTTPS verification returned ${response.status} and matched the expected application` : `HTTPS verification returned ${response.status}${markerMatches ? '' : ' but served a different application'}`,
          providerReference: `${url.origin}${url.pathname}`,
          observedState: { httpStatus: response.status, applicationMatched: markerMatches, attempts: attempt },
          errorCategory: response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_unavailable' : response.ok && !markerMatches ? 'serving_wrong_application' : response.ok ? undefined : 'http_failure',
        };
      } catch (error) {
        const normalized = normalizeProviderError(error);
        if (attempt === this.retryPolicy.maxAttempts) return normalized;
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.floor(Math.random() * 100)));
      } finally {
        clearTimeout(timer);
      }
    }
    return { status: 'provider_unavailable', safeSummary: 'Provider request was unavailable', errorCategory: 'provider_unavailable' };
  },
};

export function createInternalAdapter(
  executor: (capability: string, input: Record<string, unknown>) => Promise<ProviderResult>,
): ProviderAdapter {
  return {
    id: 'internal_database',
    supportedCapabilities: [
      'acknowledge_incident', 'resolve_incident', 'retry_job', 'retry_webhook',
      'emergency_stop', 'resume_automation', 'prepare_repair', 'refresh_state',
      'schedule_maintenance', 'cancel_maintenance',
      'enable_automation', 'disable_automation',
    ],
    authenticationRequirements: ['server-side service role'],
    environmentSupport: ['local','test','preview','development','staging','production','sandbox','testnet','mainnet'],
    readOperations: ['select'],
    mutationOperations: ['insert', 'conditional_update'],
    verificationMethod: 'read-after-write from canonical tenant-scoped state',
    retryPolicy: { maxAttempts: 3, retryableCategories: ['database_timeout', 'lock_contention'] },
    rateLimitHandling: 'bounded action lease and durable attempt counter',
    idempotencySupport: true,
    redactionPolicy: 'persist identifiers, digests, categories and safe summaries only',
    async execute(capability, input) {
      if (!this.supportedCapabilities.includes(capability)) {
        return { status: 'unsupported', safeSummary: `${capability} is unsupported by ${this.id}` };
      }
      return executor(capability, input);
    },
  };
}

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  register(adapter: ProviderAdapter): void { this.adapters.set(adapter.id, adapter); }
  get(id: string): ProviderAdapter | undefined { return this.adapters.get(id); }
  describe(): Array<Omit<ProviderAdapter, 'execute'>> {
    return [...this.adapters.values()].map(({ execute: _execute, ...contract }) => contract);
  }
}
