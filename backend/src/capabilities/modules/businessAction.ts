import {
  capabilityId,
  type CapabilityDescriptor,
} from '../../ai/universal/capabilityRegistry.js';

import {
  isComposioConfigured,
} from '../../services/integrations/composioClient.js';

/**
 * Xroga Connect external-action capability.
 *
 * This capability represents explicit user-requested changes
 * in connected business applications. Raw Composio tools are
 * never registered directly with the semantic planner.
 *
 * Execution is bound later to the authenticated Xroga user and
 * Xroga's controlled business-action runtime.
 */
export const businessActionCapability:
  CapabilityDescriptor = {
    id: capabilityId(
      'business.action',
    ),

    version: '1.0.0',

    title:
      'Connected business app action',

    description:
      'Perform an explicit user-requested action in a connected business application through Xroga Connect, such as sending or replying to a message, creating or updating a record, uploading or publishing content, scheduling an event, or another provider-supported state change. High-risk or destructive actions require an additional confirmation gate.',

    inputMediaTypes: [
      'application/vnd.xroga.business-action-request+json',
    ],

    outputMediaTypes: [
      'application/vnd.xroga.business-action-result+json',
    ],

    effects: [
      'write',
      'external',
    ],

    /*
     * The authenticated user identity, Composio session,
     * provider account and OAuth credentials stay server-side.
     *
     * model:execute means the semantic planner may select this
     * capability. It does not itself authorize an arbitrary
     * external action: the live business-action runtime still
     * requires the user's explicit request and applies its own
     * tool/risk/confirmation gates.
     */
    requiredAuthorities: [
      'model:execute' as never,
    ],

    risk: 'high',

    health: () =>
      isComposioConfigured()
        ? 'available'
        : 'unavailable',

    cost: {
      meterId:
        'provider.business-action',

      estimateMicroUsd: () =>
        1_000,
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

    execute: async () => {
      throw new Error(
        'business.action must be bound to the authenticated Xroga Connect action runtime',
      );
    },
  };
