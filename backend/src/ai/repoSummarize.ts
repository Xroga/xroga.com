/**
 * Optional AI repo understanding — only when needed, then cached in project memory.
 * Cheap default: DeepSeek V4 Pro. Long/large: GLM-5.2.
 */

import { chatCompletion } from './openaiCompat.js';
import type { ModelId } from './models.js';
import type { ProjectFile } from './patches.js';
import { userWantsRepoIntelligence } from './projectMemory.js';

export async function summarizeRepoForUpdates(opts: {
  prompt: string;
  projectName?: string;
  paths: string[];
  sampleFiles: ProjectFile[];
  preferLongContext?: boolean;
}): Promise<{ summary: string; modelId: ModelId; inputTokens: number; outputTokens: number } | null> {
  const modelId: ModelId =
    opts.preferLongContext ||
    userWantsRepoIntelligence(opts.prompt) ||
    opts.paths.length >= 20
      ? 'glm_5_2'
      : 'deepseek_v4_pro';

  const listing = opts.paths.slice(0, 80).join('\n');
  const samples = opts.sampleFiles
    .slice(0, 6)
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2500)}\n\`\`\``)
    .join('\n\n');

  try {
    const result = await chatCompletion(
      modelId,
      [
        {
          role: 'system',
          content:
            'You summarize codebases for cheap future edits. Output a short structured memo (max 400 words): stack, entry files, key components, update hotspots. No code dumps.',
        },
        {
          role: 'user',
          content: `Project: ${opts.projectName || 'Xroga project'}
User intent: ${opts.prompt.slice(0, 500)}

File paths:
${listing}

Samples:
${samples}

Write the reusable memo for future surgical updates.`,
        },
      ],
      { maxTokens: 700, temperature: 0.2 },
    );

    const summary = result.text.trim();
    if (!summary) return null;
    return {
      summary,
      modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch (err) {
    console.warn('[repoSummarize] skipped:', (err as Error).message);
    return null;
  }
}
