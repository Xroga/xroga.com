import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const softwareImplementCapability: CapabilityDescriptor = {
  id: capabilityId('software.implement'), version: '1.0.0', title: 'Software implementation',
  description: 'Produce repository changes from a validated semantic goal and project evidence.',
  inputMediaTypes: ['application/vnd.xroga.goal-contract+json'], outputMediaTypes: ['application/vnd.xroga.change-set+json'],
  effects: ['compute'], requiredAuthorities: ['model:execute' as never], risk: 'medium', health: () => 'available',
  cost: { meterId: 'provider.model-inference', estimateMicroUsd: () => 1_000 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async () => { throw new Error('software.implement is bound to the selected model at run time'); },
};
