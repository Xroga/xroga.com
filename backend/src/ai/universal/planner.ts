import type { GoalContract } from './goalContract.js';
import { capabilitySelectionSchema, type CapabilityDescriptor, type CapabilityRegistry } from './capabilityRegistry.js';

export interface CapabilityPlan {
  readonly goal: GoalContract;
  readonly capabilities: readonly CapabilityDescriptor[];
  readonly rejected: readonly { id: string; reason: string }[];
  readonly rationale: string;
}

/** The semantic planner proposes IDs; the trusted registry and authorities make the decision. */
export async function planCapabilities(input: {
  goal: GoalContract;
  registry: CapabilityRegistry;
  authorities: ReadonlySet<string>;
  select: (input: { goal: GoalContract; available: readonly Omit<CapabilityDescriptor, 'execute' | 'validateInput' | 'validateOutput' | 'health' | 'cost'>[] }) => Promise<unknown>;
}): Promise<CapabilityPlan> {
  const available = input.registry.list().map(({ execute: _execute, validateInput: _input, validateOutput: _output, health: _health, cost: _cost, ...safe }) => safe);
  const selection = capabilitySelectionSchema.safeParse(await input.select({ goal: input.goal, available }));
  if (!selection.success) throw new Error('Capability planner returned an invalid selection.');
  const resolved = input.registry.resolve(selection.data.capabilityIds, input.authorities);
  return { goal: input.goal, capabilities: resolved.eligible, rejected: resolved.rejected, rationale: selection.data.rationale };
}
