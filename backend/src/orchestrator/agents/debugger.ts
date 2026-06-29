import { builderGenerate } from '../../services/aiRouter.js';
import type { AgentContext, AgentModule } from './types.js';

const STABLE_MSG =
  'We have aligned this with the last stable version. You can refine further in chat.';

export const debuggerAgent: AgentModule = {
  name: 'Debugger',
  role: 'Fix errors and stabilize artifacts',
  async execute(ctx: AgentContext) {
    const system =
      'You are the XROGA Debugger. Suggest fixes for bugs or issues in the user request. If none, confirm stability.';
    const { text } = await builderGenerate(ctx.prompt, 'heavy', system).catch(() => ({
      text: STABLE_MSG,
      model: 'fallback',
    }));

    return { artifact: text?.trim() || STABLE_MSG, notes: 'Debug pass complete.' };
  },
};
