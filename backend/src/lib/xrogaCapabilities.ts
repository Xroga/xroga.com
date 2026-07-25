import {
  capabilityIsUsable,
  getCapabilityRegistry,
} from './capabilityRegistry.js';

/** "What can you do?" fast-path backed by the server capability registry. */
export function isCapabilitiesQuery(input: string): boolean {
  const lower = input.toLowerCase().trim().replace(/[?!.]+$/g, '');
  return (
    /\bwhat (can|do) you (build|create|make|do)( for me)?\b/.test(lower) ||
    /\bwhat you can build\b/.test(lower) ||
    /\bwhat (can|do) xroga\b/.test(lower) ||
    /\bwhat are you capable\b/.test(lower) ||
    /\bwhat do you offer\b/.test(lower) ||
    /\bshow me what you can\b/.test(lower) ||
    /\bwhat can i (build|create|make) (with|on) xroga\b/.test(lower) ||
    /\btell me what you can build\b/.test(lower)
  );
}

export function getXrogaCapabilitiesResponse(): string {
  const registry = getCapabilityRegistry();
  const usable = registry.filter(capabilityIsUsable);
  const configured = usable
    .map((capability) => `- **${capability.label}** — ${capability.description}`)
    .join('\n');

  const needsSetup = registry
    .filter((capability) => !capabilityIsUsable(capability))
    .map((capability) => `- ${capability.label}`)
    .join('\n');

  return `✨ What Xroga can execute

Xroga is capability-driven, not limited to a fixed list of project categories. Your message defines the task; Xroga selects only the capabilities needed and reports real blockers when authorization, credentials, or infrastructure are missing.

Available or user-authorizable now:
${configured || '- No executable providers are currently configured.'}

${needsSetup ? `Requires provider configuration:\n${needsSetup}\n\n` : ''}A task is only marked completed when its operation has real verification evidence. Mock or simulated output is labeled, and failed external actions are never replaced with fake success.

What outcome do you want?`;
}
