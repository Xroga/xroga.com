import { architectAgent } from './architect.js';
import { builderAgent } from './builder.js';
import { reviewerAgent } from './reviewer.js';
import { qaAgent } from './qa.js';
import { debuggerAgent } from './debugger.js';
import { automationAgent } from './automation.js';
import type { AgentModule } from './types.js';

export const SWARM_AGENTS: Record<string, AgentModule> = {
  architect: architectAgent,
  builder: builderAgent,
  reviewer: reviewerAgent,
  qa: qaAgent,
  debugger: debuggerAgent,
  automation: automationAgent,
};

export function getAgentsForFeature(featureId?: string): AgentModule[] {
  const all = Object.values(SWARM_AGENTS);
  if (!featureId) return all;

  const f = featureId.toLowerCase();
  if (f.includes('deploy') || f.includes('github') || f.includes('vercel')) {
    return [architectAgent, builderAgent, automationAgent, reviewerAgent];
  }
  if (f.includes('debug') || f.includes('fix')) {
    return [architectAgent, debuggerAgent, qaAgent, reviewerAgent];
  }
  if (f.includes('code') || f.includes('build')) {
    return [architectAgent, builderAgent, qaAgent, reviewerAgent];
  }
  return [architectAgent, builderAgent, reviewerAgent, qaAgent];
}

export * from './types.js';
