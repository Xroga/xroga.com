import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

/** Dedicated current-X evidence. It is never eligible for generic model/build routing. */
export const xResearchCapability: CapabilityDescriptor = {
  id: capabilityId('research.x'),
  version: '1.0.0',
  title: 'X research',
  description: 'Retrieve current public X posts through the private x_search-only adapter.',
  inputMediaTypes: ['application/vnd.xroga.research-request+json'],
  outputMediaTypes: ['application/vnd.xroga.evidence+json'],
  effects: ['external'],
  requiredAuthorities: ['network:x-read' as never],
  risk: 'medium',
  health: () => 'unavailable',
  cost: { meterId: 'provider.x-research', estimateMicroUsd: () => 1_000 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async () => { throw Object.assign(new Error('Dedicated X search is unavailable under the current provider policy. Public web retrieval remains separate.'),{code:'MODEL_DESTINATION_DENIED'}); },
};
