/** Detect build/deploy-related content for deploy CTA */
const BUILD_PATTERN =
  /\b(website|web\s*app|mobile\s*app|app|game|software|saas|landing\s*page|build|deploy|vercel|react|next\.?js|flutter|unity)\b/i;

export function isBuildRelated(text: string): boolean {
  return BUILD_PATTERN.test(text);
}

export interface MessageSuggestions {
  yesNo: string[];
  ideas: string[];
}

export function generateMessageSuggestions(userText: string, aiText: string): MessageSuggestions {
  const combined = `${userText} ${aiText}`.toLowerCase();
  const build = isBuildRelated(combined);

  const yesNo: string[] = [];
  const ideas: string[] = [];

  if (build) {
    yesNo.push('Deploy to Vercel now?');
    yesNo.push('Add authentication?');
    yesNo.push('Optimize for mobile?');
    ideas.push('Connect GitHub repo', 'Add custom domain', 'Generate app store assets');
  } else {
    yesNo.push('Want more detail on this?');
    yesNo.push('Should I create a step-by-step plan?');
    yesNo.push('Ready to start building?');
    ideas.push('Research competitors', 'Draft a project brief', 'Estimate action cost');
  }

  if (combined.includes('game')) {
    ideas.push('Add sound effects', 'Design game UI', 'Publish to itch.io');
  }
  if (combined.includes('automat')) {
    ideas.push('Schedule daily runs', 'Add email alerts', 'Connect Slack');
  }

  return { yesNo: yesNo.slice(0, 3), ideas: ideas.slice(0, 3) };
}

export const SWARM_AGENTS = [
  { key: 'routing', label: 'Router', desc: 'Understanding your intent…' },
  { key: 'architect', label: 'Architect', desc: 'Planning architecture & swarm route…' },
  { key: 'builder', label: 'Builder', desc: 'Writing code & building assets…' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Reviewing quality & security…' },
  { key: 'qa', label: 'QA Tester', desc: 'Testing edge cases…' },
  { key: 'truth_council', label: 'Truth Council', desc: 'Verifying accuracy…' },
] as const;

export function agentIndex(agent?: string): number {
  if (!agent) return 0;
  const key = agent.toLowerCase().replace(/\s/g, '_');
  const idx = SWARM_AGENTS.findIndex((a) => a.key === key);
  return idx >= 0 ? idx : 0;
}
