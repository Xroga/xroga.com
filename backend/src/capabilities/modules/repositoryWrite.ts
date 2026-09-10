import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const repositoryWriteCapability: CapabilityDescriptor = {
  id: capabilityId('repository.write'), version: '1.0.0', title: 'Repository write',
  description: 'Apply validated changes through the existing atomic repository writer.',
  inputMediaTypes: ['application/vnd.xroga.change-set+json'],
  outputMediaTypes: ['application/vnd.xroga.commit-result+json'], effects: ['write'],
  requiredAuthorities: ['repository:write' as never], risk: 'high', health: () => 'available',
  cost: { meterId: 'runtime.repository-write', estimateMicroUsd: () => 0 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async () => { throw new Error('repository.write must be bound to the atomic writer at the execution boundary'); },
};
