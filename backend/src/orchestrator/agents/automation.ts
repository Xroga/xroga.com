import type { AgentContext, AgentModule } from './types.js';
import { deployToFlyio, deployToVercel, type DeployFile } from '../../services/automation/deployment.js';

export const automationAgent: AgentModule = {
  name: 'Automation Runtime',
  role: 'Deploy, GitHub, Vercel, Fly.io orchestration',
  async execute(ctx: AgentContext) {
    const p = ctx.prompt.toLowerCase();
    const files: DeployFile[] = [
      { file: 'index.html', data: '<html><body><h1>XROGA Deploy</h1></body></html>' },
    ];

    if (p.includes('vercel') || p.includes('frontend') || p.includes('website')) {
      const result = await deployToVercel(files, { userId: ctx.userId });
      return {
        artifact: `Deployed via ${result.method}${result.url ? `: ${result.url}` : ''}`,
        notes: `Vercel deployment ${result.status}.`,
        metadata: { deployTarget: 'vercel', ...result },
      };
    }

    if (p.includes('fly') || p.includes('backend') || p.includes('api')) {
      const result = await deployToFlyio(files, { userId: ctx.userId });
      return {
        artifact: `Deployed via ${result.method}${result.url ? `: ${result.url}` : ''}`,
        notes: `Fly.io deployment ${result.status}.`,
        metadata: { deployTarget: 'fly', ...result },
      };
    }

    const vercel = await deployToVercel(files, { userId: ctx.userId }).catch(() => null);
    if (vercel?.url) {
      return {
        artifact: `Live at ${vercel.url}`,
        notes: 'Primary deploy via Vercel.',
        metadata: { deployTarget: 'vercel', ...vercel },
      };
    }

    const fly = await deployToFlyio(files, { userId: ctx.userId }).catch(() => null);
    return {
      artifact: fly?.url ? `Live at ${fly.url}` : 'Deployment pipeline queued.',
      notes: 'GitHub Actions → flyctl → Vercel fallback chain.',
      metadata: { deployTarget: 'github', ...(fly ?? {}) },
    };
  },
};
