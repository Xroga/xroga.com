import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const conversationRespondCapability: CapabilityDescriptor = {
  id: capabilityId('conversation.respond'),
  version: '1.0.0',
  title: 'Conversation response',
  description: 'Answer, explain, plan, or advise without changing project or external state.',
  inputMediaTypes: ['application/vnd.xroga.goal-contract+json'],
  outputMediaTypes: ['text/markdown'],
  effects: ['compute'],
  requiredAuthorities: ['model:execute' as never],
  risk: 'low',
  health: () => 'available',
  cost: { meterId: 'provider.model-inference', estimateMicroUsd: () => 500 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => typeof value === 'string',
  execute: async () => {
    throw new Error('conversation.respond is bound to the selected model at run time');
  },
};
