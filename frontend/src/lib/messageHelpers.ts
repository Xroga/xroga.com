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
  { key: 'routing', label: 'Router', desc: 'Understanding…' },
  { key: 'architect', label: 'Architect', desc: 'Planning…' },
  { key: 'builder', label: 'Builder', desc: 'Generating…' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Verifying…' },
  { key: 'qa', label: 'QA', desc: 'Testing…' },
  { key: 'truth_council', label: 'Review', desc: 'Final check…' },
] as const;

export function agentIndex(agent?: string): number {
  if (!agent) return 0;
  const key = agent.toLowerCase().replace(/\s/g, '_');
  const idx = SWARM_AGENTS.findIndex((a) => a.key === key);
  return idx >= 0 ? idx : 0;
}
