import type {
  AgentModel,
} from '@cline/sdk';

export interface SoftwareAgentModelRoute {
  /**
   * Optional pre-built model transport.
   *
   * Production Xroga uses this path so Cline's agent loop can run
   * through Xroga-owned quota, provider policy, health and accounting
   * instead of receiving raw provider credentials.
   */
  model?: AgentModel;

  /**
   * Cline SDK provider id.
   *
   * Kept for isolated tests and controlled non-production callers.
   */
  providerId?: string;

  /**
   * Provider-specific model id.
   *
   * Kept for isolated tests and controlled non-production callers.
   */
  modelId?: string;

  /**
   * Server-side only.
   *
   * Production Xroga should prefer `model` above and must never expose
   * this value to the frontend or logs.
   */
  apiKey?: string;

  /**
   * Required for direct OpenAI-compatible provider routes.
   */
  baseUrl?: string;

  headers?: Record<string, string>;

  /**
   * Internal Xroga identifier for telemetry only.
   *
   * Do not expose vendor/provider internals to normal users.
   */
  routeId: string;
}

export function assertSoftwareAgentModelRoute(
  route: SoftwareAgentModelRoute,
): void {
  if (!route.routeId.trim()) {
    throw new Error(
      'Software agent routeId is required.',
    );
  }

  /*
   * A pre-built AgentModel is the production-safe path.
   * Provider credentials are intentionally unnecessary here because
   * the model adapter owns the provider boundary.
   */
  if (route.model) {
    return;
  }

  const providerId =
    route.providerId?.trim();

  const modelId =
    route.modelId?.trim();

  if (!providerId) {
    throw new Error(
      'Software agent providerId is required when no pre-built model is supplied.',
    );
  }

  if (!modelId) {
    throw new Error(
      'Software agent modelId is required when no pre-built model is supplied.',
    );
  }

  if (
    providerId ===
      'openai-compatible' &&
    !route.baseUrl?.trim()
  ) {
    throw new Error(
      'OpenAI-compatible software agent routes require baseUrl.',
    );
  }
}
