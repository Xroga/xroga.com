import { builderGenerate, classifyComplexity } from '../../services/aiRouter.js';
import { classifyFeature } from '../../services/architect/featureRouter.js';
import { buildFullSystemPrompt } from '../aiTraining.js';
import type { AgentContext, AgentModule } from './types.js';

const CODE_STUB =
  '```\n# XROGA Builder placeholder — refine in a follow-up prompt\ndef solve():\n    pass\n```';

export const builderAgent: AgentModule = {
  name: 'Builder',
  role: 'Content and artifact generation',
  async execute(ctx: AgentContext) {
    const route = await classifyFeature(ctx.prompt).catch(() => ({ category: 'chat' as const }));
    const complexity = classifyComplexity(ctx.prompt, route.category);
    const tier = ctx.tier === 'premium' ? 'heavy' : complexity;
    const system = buildFullSystemPrompt(route.category, ctx.prompt);

    const { text } = await builderGenerate(ctx.prompt, tier, system).catch(() => ({
      text: CODE_STUB,
      model: 'fallback',
    }));

    return { artifact: text?.trim() || CODE_STUB, notes: 'Primary artifact generated.' };
  },
};
