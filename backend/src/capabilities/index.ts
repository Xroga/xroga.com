import { CapabilityRegistry } from '../ai/universal/capabilityRegistry.js';
import { generatedCapabilities } from './generated.js';

export function createCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  for (const descriptor of generatedCapabilities) registry.register(descriptor);
  return registry;
}

export const universalCapabilityRegistry = createCapabilityRegistry();
