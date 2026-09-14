import {
  capabilityId,
  type CapabilityDescriptor,
} from '../../ai/universal/capabilityRegistry.js';

import {
  isComposioConfigured,
} from '../../services/integrations/composioClient.js';

/**
 * Xroga Connect V1 business-data capability.
 *
 * This capability is intentionally READ ONLY.
 *
 * It represents access to user-authorized business
 * applications such as:
 *
 * - Gmail
 * - Google Calendar
 * - Google Drive
 * - Slack
 * - Stripe
 * - Shopify
 * - HubSpot
 * - Notion
 * - Airtable
 * - QuickBooks
 * - Linear
 * - Sentry
 *
 * Actual execution is performed by Xroga's controlled
 * Composio adapter. Raw Composio tools are never placed
 * directly into the semantic capability registry.
 */
export const businessReadCapability:
  CapabilityDescriptor = {
    id: capabilityId(
      'business.read',
    ),

    version: '1.0.0',

    title:
      'Connected business app read',

    description:
      'Read user-authorized data from connected business applications through Xroga Connect. This capability is read-only and cannot send, modify, delete, publish, refund, transfer, or otherwise mutate external data.',

    inputMediaTypes: [
      'application/vnd.xroga.business-read-request+json',
    ],

    outputMediaTypes: [
      'application/vnd.xroga.business-evidence+json',
    ],

    effects: [
      'read',
      'external',
    ],

    /*
     * The actual user identity and provider authorization
     * remain server-side.
     *
     * Xroga's Composio session itself enforces the stronger
     * readOnlyHint / !destructiveHint policy.
     */
    requiredAuthorities: [
      'model:execute' as never,
    ],

    risk: 'medium',

    health: () =>
      isComposioConfigured()
        ? 'available'
        : 'unavailable',

    cost: {
      meterId:
        'provider.business-read',

      estimateMicroUsd: () =>
        500,
    },

    validateInput: (
      value,
    ) =>
      Boolean(
        value &&
          typeof value ===
            'object',
      ),

    validateOutput: (
      value,
    ) =>
      Boolean(
        value &&
          typeof value ===
            'object',
      ),

    /*
     * The generic registry must never call Composio directly.
     *
     * The live chat pipeline binds this capability to the
     * authenticated Xroga user and the controlled
     * business-read runtime.
     */
    execute: async () => {
      throw new Error(
        'business.read must be bound to the authenticated Xroga Connect runtime',
      );
    },
  };
