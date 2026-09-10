import { capabilityId, type CapabilityDescriptor } from '../../ai/universal/capabilityRegistry.js';

export const attachmentAnalyzeCapability: CapabilityDescriptor = {
  id: capabilityId('attachment.analyze'),
  version: '1.0.0',
  title: 'Attachment analysis',
  description: 'Inspect user-supplied image or document content without modifying a project.',
  inputMediaTypes: ['image/*', 'application/pdf', 'text/*'],
  outputMediaTypes: ['text/markdown', 'application/vnd.xroga.evidence+json'],
  effects: ['read', 'compute'],
  requiredAuthorities: ['attachment:read' as never, 'model:execute' as never],
  risk: 'low',
  health: () => 'available',
  cost: { meterId: 'provider.model-inference', estimateMicroUsd: () => 750 },
  validateInput: (value) => Boolean(value && typeof value === 'object'),
  validateOutput: (value) => Boolean(value),
  execute: async () => {
    throw new Error('attachment.analyze is bound to the selected multimodal adapter at run time');
  },
};
