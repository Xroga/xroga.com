import type { ChatMessage } from '@/context/TerminalChatContext';

/** Normalize persisted chat rows so render never crashes on null/invalid fields */
export function sanitizeChatMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    .map((m) => {
      const role = m.role;
      const safeRole: ChatMessage['role'] =
        role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant';

      const rawContent = m.content;
      const content =
        typeof rawContent === 'string'
          ? rawContent
          : rawContent == null
            ? ''
            : String(rawContent);

      const id =
        typeof m.id === 'string' && m.id.trim()
          ? m.id
          : crypto.randomUUID();

      const createdAt =
        typeof m.createdAt === 'number' && Number.isFinite(m.createdAt)
          ? m.createdAt
          : Date.now();

      const thinkingSteps = Array.isArray(m.thinkingSteps)
        ? m.thinkingSteps.filter((s): s is string => typeof s === 'string')
        : undefined;

      let featureOutput = m.featureOutput;
      if (featureOutput && typeof featureOutput === 'object') {
        const fo = featureOutput as Record<string, unknown>;
        if (fo.type === 'landing_page') {
          const deployUrl = typeof fo.deployUrl === 'string' ? fo.deployUrl.trim() : '';
          const hasHtml = typeof fo.html === 'string' && fo.html.length > 0;
          const hasSummary = typeof fo.summary === 'string' && fo.summary.length > 0;
          const hasGithub = typeof fo.githubRepoUrl === 'string' && fo.githubRepoUrl.length > 0;
          const hasContent = typeof m.content === 'string' && m.content.trim().length > 0;
          if (!deployUrl && !hasHtml && !hasSummary && !hasGithub && !hasContent) {
            featureOutput = undefined;
          }
        }
      } else {
        featureOutput = undefined;
      }

      return {
        id,
        role: safeRole,
        content,
        agent: typeof m.agent === 'string' ? m.agent : undefined,
        createdAt,
        featureOutput,
        thinkingSteps,
        thoughtMs: typeof m.thoughtMs === 'number' ? m.thoughtMs : undefined,
      };
    });
}
