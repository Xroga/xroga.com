import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const publicResearchCapability: CapabilityDescriptor = {
  id: capabilityId('research.public-web'), version: '1.0.0', title: 'Public web research',
  description: 'Retrieve current public evidence through the configured provider adapter.',
  inputMediaTypes: ['application/vnd.xroga.research-request+json'], outputMediaTypes: ['application/vnd.xroga.evidence+json'],
  effects: ['external'], requiredAuthorities: ['network:public-read' as never], risk: 'medium',
  // Official DeepSeek Search is the only public-web search provider ($0.75 per 1,000 successful requests).
  health: () => process.env.DEEPSEEK_WEBSEARCH_FETCH_API ? 'available' : 'unavailable',
  cost: { meterId: 'provider.public-research', estimateMicroUsd: () => 750 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async () => { throw new Error('research.public-web must be bound to the provider-neutral research adapter'); },
};
