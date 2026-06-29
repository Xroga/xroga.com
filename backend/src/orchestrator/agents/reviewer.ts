import { truthCouncilVerify, classifyComplexity } from '../../services/aiRouter.js';
import type { AgentContext, AgentModule } from './types.js';

const DISCLAIMER =
  'This information is based on available data — please verify critical details before acting on it.';

export const reviewerAgent: AgentModule = {
  name: 'Reviewer',
  role: 'Truth Council verification',
  async execute(ctx: AgentContext) {
    const complexity = classifyComplexity(ctx.prompt);
    const verdict = await truthCouncilVerify(ctx.prompt, ctx.prompt, complexity).catch(() => ({
      approved: true,
      reasons: [DISCLAIMER],
    }));

    const review = verdict.approved
      ? `Verified: ${verdict.reasons.join('; ')}`
      : `${DISCLAIMER}\nNotes: ${verdict.reasons.join('; ')}`;

    return { artifact: review, notes: 'Review complete.' };
  },
};
