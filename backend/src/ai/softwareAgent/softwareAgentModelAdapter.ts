import type {
  SoftwareAgentModelRoute,
} from './agentModelRoute.js';

export interface XrogaSelectedModelRoute {
  /**
   * Xroga's internal route/provider identifier.
   *
   * Examples could eventually map from DeepSeek, GLM, Kimi,
   * or any provider already supported by providerRuntime.
   */
  providerId: string;

  modelId: string;

  apiKey?: string;

  baseUrl?: string;

  headers?: Record<string, string>;

  /**
   * Stable Xroga route identifier for diagnostics,
   * billing and provider-health tracking.
   */
  routeId?: string;
}

function required(
  value: string | undefined,
  name: string,
): string {
  const cleaned =
    value?.trim();

  if (!cleaned) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return cleaned;
}

/**
 * Convert a model route already selected by Xroga into the
 * narrow configuration required by AgentSoftwareExecutor.
 *
 * This function DOES NOT:
 *
 * - choose a model
 * - perform provider fallback
 * - read environment variables
 * - bypass Xroga provider health
 * - bypass quotas/billing
 *
 * Xroga remains responsible for all of those decisions.
 */
export function createSoftwareAgentModelRoute(
  selected: XrogaSelectedModelRoute,
): SoftwareAgentModelRoute {
  const providerId =
    required(
      selected.providerId,
      'Software-agent provider',
    );

  const modelId =
    required(
      selected.modelId,
      'Software-agent model',
    );

  const routeId =
    selected.routeId?.trim() ||
    `${providerId}:${modelId}`;

  const baseUrl =
    selected.baseUrl?.trim();

  /*
   * Cline's generic OpenAI-compatible provider requires the
   * endpoint explicitly.
   */
  if (
    providerId ===
      'openai-compatible' &&
    !baseUrl
  ) {
    throw new Error(
      'OpenAI-compatible software-agent routes require baseUrl.',
    );
  }

  return {
    providerId,

    modelId,

    routeId,

    ...(selected.apiKey
      ? {
          apiKey:
            selected.apiKey,
        }
      : {}),

    ...(baseUrl
      ? {
          baseUrl,
        }
      : {}),

    ...(selected.headers
      ? {
          headers: {
            ...selected.headers,
          },
        }
      : {}),
  };
}
