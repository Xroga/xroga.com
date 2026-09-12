import { universalCapabilityRegistry } from '../../capabilities/index.js';

/** A customer-safe runtime snapshot generated from the same registry the planner trusts. */
export function currentProductTruth(authorities: ReadonlySet<string> = new Set(['model:execute', 'sandbox:execute'])): string {
  const readiness = new Map(
    universalCapabilityRegistry.snapshot(authorities).map((item) => [item.id, item]),
  );
  const lines = universalCapabilityRegistry.list().map((capability) => {
    const state = readiness.get(capability.id)?.state ?? 'UNSUPPORTED';
    const requirement = state === 'AUTH_REQUIRED'
      ? 'requires the user-authorized account or project context'
      : state === 'PROVIDER_UNAVAILABLE'
        ? 'provider unavailable'
        : state === 'TEMPORARILY_UNAVAILABLE'
          ? 'temporarily unavailable'
          : state.toLowerCase();
    return `- ${capability.title} (${capability.id}): ${requirement}. ${capability.description}`;
  });

  return [
    'CURRENT XROGA RUNTIME TRUTH (generated from the execution registry):',
    ...lines,
    '- Preview is verification evidence produced by a successful software build; it is separate from deployment.',
    '- Deployment and repository writes require the user\'s authorized target and never happen from project context alone.',
    '- Public current-web evidence uses Parallel. X/Twitter retrieval uses the private X-only Grok adapter.',
    '- Xroga must describe unavailable or authorization-dependent work truthfully and must never invent execution evidence.',
  ].join('\n');
}
