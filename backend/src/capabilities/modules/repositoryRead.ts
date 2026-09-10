import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const repositoryReadCapability: CapabilityDescriptor = {
  id: capabilityId('repository.read'), version: '1.0.0', title: 'Repository read',
  description: 'Read authorized repository state without modifying it.',
  inputMediaTypes: ['application/vnd.xroga.project-context+json'],
  outputMediaTypes: ['application/vnd.xroga.repository-snapshot+json'],
  effects: ['read'], requiredAuthorities: ['repository:read' as never], risk: 'low',
  health: () => 'available', cost: { meterId: 'runtime.repository-read', estimateMicroUsd: () => 0 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async (input) => input,
};
