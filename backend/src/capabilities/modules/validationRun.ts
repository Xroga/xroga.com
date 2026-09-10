import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const validationRunCapability: CapabilityDescriptor = {
  id: capabilityId('validation.run'), version: '1.0.0', title: 'Validation',
  description: 'Run repository-derived checks in an isolated execution environment.',
  inputMediaTypes: ['application/vnd.xroga.validation-plan+json'], outputMediaTypes: ['application/vnd.xroga.validation-evidence+json'],
  effects: ['compute'], requiredAuthorities: ['sandbox:execute' as never], risk: 'medium', health: () => 'available',
  cost: { meterId: 'runtime.sandbox', estimateMicroUsd: () => 0 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value && typeof value === 'object'),
  execute: async () => { throw new Error('validation.run is bound to the selected sandbox at run time'); },
};
