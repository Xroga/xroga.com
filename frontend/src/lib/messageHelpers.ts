import { isTrivialConversation, isTrivialPrompt } from './promptClassifier';

/** Detect build/deploy-related content for deploy CTA — user must have build intent */
const BUILD_PATTERN =
  /\b(website|web\s*app|mobile\s*app|saas|landing\s*page|deploy|vercel|react|next\.?js|flutter|unity)\b/i;

const USER_BUILD_PATTERN =
  /\b(build|create|make|generate|deploy|code|debug|fix|scrape|automate)\b/i;

export function isBuildRelated(text: string, userText?: string): boolean {
  if (userText && isTrivialPrompt(userText)) return false;
  if (userText && !USER_BUILD_PATTERN.test(userText)) return false;
  return BUILD_PATTERN.test(text) || (userText ? USER_BUILD_PATTERN.test(userText) : false);
}

export interface MessageSuggestions {
  yesNo: string[];
  ideas: string[];
}

export function generateMessageSuggestions(userText: string, aiText: string): MessageSuggestions {
  if (isTrivialConversation(userText, aiText)) {
    return {
      yesNo: ['Build a landing page', 'Help me write code', 'Research a topic'],
      ideas: [],
    };
  }

  const combined = `${userText} ${aiText}`.toLowerCase();
  const build = isBuildRelated(aiText, userText);

  const yesNo: string[] = [];
  const ideas: string[] = [];

  if (build) {
    yesNo.push('Deploy to Vercel');
    yesNo.push('Add authentication');
    yesNo.push('Optimize for mobile');
    ideas.push('Connect GitHub', 'Add custom domain');
  } else if (USER_BUILD_PATTERN.test(userText)) {
    yesNo.push('Go deeper on this');
    yesNo.push('Show me an example');
    yesNo.push('Break it into steps');
  } else {
    yesNo.push('Tell me more');
    yesNo.push('Give me an example');
    ideas.push('Estimate action cost');
  }

  if (combined.includes('game')) {
    ideas.push('Add sound effects', 'Design game UI');
  }
  if (combined.includes('automat')) {
    ideas.push('Schedule daily runs', 'Connect Slack');
  }

  return { yesNo: yesNo.slice(0, 3), ideas: ideas.slice(0, 2) };
}

export const SWARM_AGENTS = [
  { key: 'routing', label: 'Router', desc: 'Understanding your intent…' },
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
