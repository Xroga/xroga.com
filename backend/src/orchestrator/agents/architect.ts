import { architectPlan } from '../../services/aiRouter.js';
import type { AgentContext, AgentModule } from './types.js';

const TEMPLATES: Record<string, string> = {
  code: '1. Analyze requirements\n2. Scaffold project\n3. Implement core logic\n4. Test & review',
  video: '1. Script outline\n2. Storyboard frames\n3. Asset generation\n4. Render & polish',
  image: '1. Prompt refinement\n2. Style selection\n3. Generation\n4. Post-process',
  default: '1. Understand goal\n2. Plan subtasks\n3. Execute with Builder\n4. Review output',
};

function keywordPlan(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes('code') || p.includes('app') || p.includes('api')) return TEMPLATES.code;
  if (p.includes('video') || p.includes('episode')) return TEMPLATES.video;
  if (p.includes('image') || p.includes('logo')) return TEMPLATES.image;
  return TEMPLATES.default;
}

export const architectAgent: AgentModule = {
  name: 'Architect',
  role: 'Planning and task decomposition',
  async execute(ctx: AgentContext) {
    const category = ctx.featureId ?? 'chat';
    const plan = await architectPlan(ctx.prompt, category).catch(() => keywordPlan(ctx.prompt));
    return { artifact: plan, notes: 'Execution plan ready.' };
  },
};
