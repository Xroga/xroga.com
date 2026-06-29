import { builderGenerate, classifyComplexity } from '../../services/aiRouter.js';
import type { AgentContext, AgentModule } from './types.js';

const CODE_STUB =
  '```\n# XROGA Builder placeholder — refine in a follow-up prompt\ndef solve():\n    pass\n```';

export const builderAgent: AgentModule = {
  name: 'Builder',
  role: 'Content and artifact generation',
  async execute(ctx: AgentContext) {
    const complexity = classifyComplexity(ctx.prompt);
    const tier = ctx.tier === 'premium' ? 'heavy' : complexity;
    const system =
      'You are the XROGA Builder. Produce the main deliverable (code, copy, script, or structured output). No preamble.';

    const { text } = await builderGenerate(ctx.prompt, tier, system).catch(() => ({
      text: CODE_STUB,
      model: 'fallback',
    }));

    return { artifact: text?.trim() || CODE_STUB, notes: 'Primary artifact generated.' };
  },
};
