import type { SwarmRunSummary } from './api';

const normalizePrompt = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export async function recoverLegacyLandingRun(
  history: SwarmRunSummary[],
  promptCandidates: string[],
  getRun: (runId: string) => Promise<SwarmRunSummary>
): Promise<SwarmRunSummary | null> {
  const wanted = new Set(promptCandidates.map(normalizePrompt).filter(Boolean));
  const matching = history
    .filter((run) => wanted.has(normalizePrompt(run.prompt)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // A prompt may have failed once and later succeeded. Inspect matching runs newest
  // first and accept only an authoritative landing artifact with real HTML.
  for (const summary of matching) {
    try {
      const run = await getRun(summary.id);
      const output = run.output;
      if (
        output &&
        typeof output === 'object' &&
        (output as { type?: string }).type === 'landing_page' &&
        typeof (output as { html?: unknown }).html === 'string' &&
        (output as { html: string }).html.trim()
      ) {
        return run;
      }
    } catch {
      // Continue to an older matching run. One unavailable row must not block a
      // recoverable artifact produced by a later retry of the same prompt.
    }
  }
  return null;
}
