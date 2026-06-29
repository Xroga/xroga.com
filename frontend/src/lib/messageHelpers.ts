import { isTrivialConversation, isTrivialPrompt } from './promptClassifier';
import {
  analyzeCreation,
  hasDeployableCreation,
  primaryDeploySuggestion,
  type CreationSuggestions,
} from './creationIntelligence';

export type { CreationSuggestions, DeploySuggestion } from './creationIntelligence';
export { analyzeCreation, hasDeployableCreation, primaryDeploySuggestion };

export interface MessageSuggestions {
  followUps: string[];
  refine: string[];
  deploy: CreationSuggestions['deploy'];
  creationType: CreationSuggestions['creationType'];
  creationLabel: string;
}

export function generateMessageSuggestions(userText: string, aiText: string): MessageSuggestions {
  const analysis = analyzeCreation(userText, aiText);

  if (isTrivialConversation(userText, aiText)) {
    return {
      creationType: 'chat',
      creationLabel: 'Chat',
      followUps: ['Build a website', 'Automate a browser task', 'Generate an image'],
      refine: [],
      deploy: [],
    };
  }

  return {
    creationType: analysis.creationType,
    creationLabel: analysis.creationLabel,
    followUps: analysis.followUps,
    refine: analysis.refine,
    deploy: analysis.deploy,
  };
}

export function isBuildRelated(text: string, userText?: string): boolean {
  if (userText && isTrivialPrompt(userText)) return false;
  if (!userText) return false;
  return hasDeployableCreation(userText, text);
}

export const SWARM_AGENTS = [
  { key: 'architect', label: 'Architect', desc: 'Planning your request…' },
  { key: 'builder', label: 'Builder', desc: 'Creating content…' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Fact-checking output…' },
  { key: 'qa', label: 'QA', desc: 'Testing quality…' },
  { key: 'debugger', label: 'Debugger', desc: 'Fixing issues…' },
  { key: 'automation', label: 'Automation', desc: 'Deploy & integrate…' },
] as const;

const AGENT_ALIASES: Record<string, string> = {
  routing: 'architect',
  truth_council: 'automation',
  complete: 'automation',
};

export function agentIndex(agent?: string): number {
  if (!agent) return 0;
  const key = agent.toLowerCase().replace(/\s/g, '_');
  const mapped = AGENT_ALIASES[key] ?? key;
  const idx = SWARM_AGENTS.findIndex((a) => a.key === mapped);
  return idx >= 0 ? idx : 0;
}
