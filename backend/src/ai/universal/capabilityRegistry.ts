import { z } from 'zod';

export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
export type CapabilityId = string & { readonly __capabilityId: unique symbol };
export type AuthorityId = string & { readonly __authorityId: unique symbol };
export type CapabilityReadinessState =
  | 'READY'
  | 'AUTH_REQUIRED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNSUPPORTED';

export interface CapabilityReadiness {
  readonly id: string;
  readonly state: CapabilityReadinessState;
  readonly reason?: string;
}

export function capabilityId(value: string): CapabilityId {
  const normalized = value.trim().toLowerCase();
  if (!CAPABILITY_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid namespaced capability id: ${value}`);
  }
  return normalized as CapabilityId;
}

export interface CapabilityCostModel {
  readonly meterId: string;
  readonly estimateMicroUsd: (input: unknown) => number;
}

export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly inputMediaTypes: readonly string[];
  readonly outputMediaTypes: readonly string[];
  readonly effects: readonly ('read' | 'compute' | 'write' | 'external')[];
  readonly requiredAuthorities: readonly AuthorityId[];
  readonly risk: 'low' | 'medium' | 'high';
  readonly health: () => 'available' | 'degraded' | 'unavailable';
  readonly cost: CapabilityCostModel;
  readonly validateInput: (input: unknown) => boolean;
  readonly validateOutput: (output: unknown) => boolean;
  readonly execute: (input: unknown, context: CapabilityExecutionContext) => Promise<unknown>;
}

export interface CapabilityExecutionContext {
  readonly authorities: ReadonlySet<string>;
  readonly signal?: AbortSignal;
}

export class CapabilityRegistry {
  readonly #items = new Map<CapabilityId, CapabilityDescriptor>();

  register(descriptor: CapabilityDescriptor): void {
    if (this.#items.has(descriptor.id)) throw new Error(`Duplicate capability: ${descriptor.id}`);
    if (!descriptor.version.trim() || !descriptor.outputMediaTypes.length) {
      throw new Error(`Capability ${descriptor.id} is missing version or output descriptors.`);
    }
    this.#items.set(descriptor.id, descriptor);
  }

  get(id: string): CapabilityDescriptor | null {
    if (!CAPABILITY_ID_PATTERN.test(id)) return null;
    return this.#items.get(id as CapabilityId) ?? null;
  }

  list(): readonly CapabilityDescriptor[] {
    return [...this.#items.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  readiness(id: string, authorities: ReadonlySet<string>): CapabilityReadiness {
    const descriptor = this.get(id);
    if (!descriptor) return { id, state: 'UNSUPPORTED', reason: 'not_registered' };
    const health = descriptor.health();
    if (health === 'unavailable') {
      return {
        id,
        state: descriptor.effects.includes('external') ? 'PROVIDER_UNAVAILABLE' : 'TEMPORARILY_UNAVAILABLE',
        reason: 'runtime_unavailable',
      };
    }
    if (health === 'degraded') {
      return { id, state: 'TEMPORARILY_UNAVAILABLE', reason: 'runtime_degraded' };
    }
    const missing = descriptor.requiredAuthorities.find((authority) => !authorities.has(authority));
    if (missing) return { id, state: 'AUTH_REQUIRED', reason: `missing_authority:${missing}` };
    return { id, state: 'READY' };
  }

  snapshot(authorities: ReadonlySet<string>): readonly CapabilityReadiness[] {
    return this.list().map((descriptor) => this.readiness(descriptor.id, authorities));
  }

  resolve(requested: readonly string[], authorities: ReadonlySet<string>): {
    eligible: readonly CapabilityDescriptor[];
    rejected: readonly { id: string; reason: string }[];
  } {
    const eligible: CapabilityDescriptor[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];
    for (const id of [...new Set(requested)]) {
      const descriptor = this.get(id);
      if (!descriptor) { rejected.push({ id, reason: 'UNSUPPORTED:not_registered' }); continue; }
      const readiness = this.readiness(id, authorities);
      if (readiness.state !== 'READY') {
        rejected.push({ id, reason: `${readiness.state}:${readiness.reason ?? 'not_ready'}` });
        continue;
      }
      eligible.push(descriptor);
    }
    return { eligible, rejected };
  }
}

export const capabilitySelectionSchema = z.object({
  capabilityIds: z.array(z.string().regex(CAPABILITY_ID_PATTERN)),
  rationale: z.string().min(1),
}).strict();
