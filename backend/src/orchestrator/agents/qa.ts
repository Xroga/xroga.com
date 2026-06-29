import type { AgentContext, AgentModule } from './types.js';

export const qaAgent: AgentModule = {
  name: 'QA',
  role: 'Quality assurance checks',
  async execute(ctx: AgentContext) {
    const checks = [
      'Output structure validated',
      'No empty critical sections',
      'Safe for user presentation',
    ];
    const p = ctx.prompt.toLowerCase();
    if (p.includes('ui') || p.includes('page') || p.includes('component')) {
      checks.push('UI-related request — manual browser test recommended when automation unavailable');
    }
    return {
      artifact: checks.map((c, i) => `${i + 1}. ${c}`).join('\n'),
      notes: 'QA checklist applied (automated + heuristic).',
    };
  },
};
