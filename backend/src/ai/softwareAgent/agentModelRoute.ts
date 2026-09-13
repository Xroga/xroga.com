export interface SoftwareAgentModelRoute {
  /**
   * Cline SDK provider id.
   *
   * For Xroga's OpenAI-compatible providers this will normally be:
   * "openai-compatible"
   */
  providerId: string;

  /**
   * Provider-specific model id.
   *
   * Examples are intentionally NOT hard-coded here.
   * Xroga's provider registry will supply the real model id.
   */
  modelId: string;

  /**
   * Resolved server-side only.
   *
   * Never return this object to the frontend.
   * Never log the key.
   */
  apiKey?: string;

  /**
   * Required for OpenAI-compatible custom/provider endpoints.
   */
  baseUrl?: string;

  /**
   * Optional provider-specific headers.
   *
   * Do not place secrets here unless they are handled with the
   * same server-side protections as apiKey.
   */
  headers?: Record<string, string>;

  /**
   * Internal Xroga identifier for telemetry only.
   *
   * Example:
   * software_primary
   *
   * Do not expose vendor/provider internals to normal users.
   */
  routeId: string;
}

export function assertSoftwareAgentModelRoute(
  route: SoftwareAgentModelRoute,
): void {
  if (!route.providerId.trim()) {
    throw new Error(
      'Software agent providerId is required.',
    );
  }

  if (!route.modelId.trim()) {
    throw new Error(
      'Software agent modelId is required.',
    );
  }

  if (!route.routeId.trim()) {
    throw new Error(
      'Software agent routeId is required.',
    );
  }

  if (
    route.providerId === 'openai-compatible' &&
    !route.baseUrl?.trim()
  ) {
    throw new Error(
      'OpenAI-compatible software agent routes require baseUrl.',
    );
  }
}
