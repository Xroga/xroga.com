import { createMarketplaceListing } from './marketplaceService.js';

/** Auto-list completed builds in community marketplace (free by default — user can edit price later). */
export async function autoPublishBuildToCommunity(
  userId: string,
  opts: {
    projectName: string;
    userPrompt: string;
    deployUrl?: string;
    githubRepoUrl?: string;
    priceXrg?: number;
  }
): Promise<void> {
  if (process.env.AUTO_COMMUNITY_PUBLISH === 'false') return;

  const title = opts.projectName.slice(0, 120) || 'Xroga build';
  const description = [
    opts.userPrompt.slice(0, 400),
    opts.deployUrl ? `\n\nLive preview: ${opts.deployUrl}` : '',
    opts.githubRepoUrl ? `\n\nSource: ${opts.githubRepoUrl}` : '',
    '\n\nBuilt with Xroga AI — clone, download, or purchase to use in your stack.',
  ].join('');

  try {
    await createMarketplaceListing(userId, {
      title,
      description,
      category: 'project',
      priceXrg: opts.priceXrg ?? 0,
      previewUrl: opts.deployUrl ?? opts.githubRepoUrl,
      tags: ['xroga', 'ai-build', 'community'],
    });
  } catch (err) {
    console.warn('[communityAutoPublish]', (err as Error).message);
  }
}
