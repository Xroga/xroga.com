import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../lib/landingPreview.js';
import { vercelStaticSiteJson } from '../lib/vercelStaticConfig.js';
import type { ProjectFile } from './integrations/githubDeploy.js';

/**
 * Minimal static project scaffold for GitHub/Vercel push.
 * Legacy AI site generators were removed with the old backend.
 */
export function buildFullProjectFiles(opts: {
  html: string;
  css?: string;
  js?: string;
  projectName?: string;
  userPrompt?: string;
}): ProjectFile[] {
  const normalized = normalizeBuildFiles(opts.html, opts.css ?? '', opts.js ?? '');
  const merged = buildInlinePreviewDocument(normalized.html, normalized.css, normalized.js);
  const name = (opts.projectName || 'XROGA Build').trim() || 'XROGA Build';

  return [
    { path: 'index.html', content: merged },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'vercel.json', content: vercelStaticSiteJson() },
    {
      path: 'README.md',
      content: `# ${name}\n\nBuilt with Xroga AI Swarm (Converter → Builder).\n\n${opts.userPrompt ? `## Prompt\n\n${opts.userPrompt.slice(0, 500)}\n` : ''}`,
    },
  ];
}

export function scaffoldFilePaths(_prompt?: string): string[] {
  void _prompt;
  return ['index.html', 'styles.css', 'script.js', 'vercel.json', 'README.md'];
}
