import type { ChatMessage } from '@/context/TerminalChatContext';
import { loadLandingBuild } from '@/lib/landingBuildStorage';
import { rehydrateMessagesWithMedia } from '@/lib/messageRehydration';

function isLandingOutput(output: unknown): output is Record<string, unknown> {
  return Boolean(output && typeof output === 'object' && (output as { type?: string }).type === 'landing_page');
}

/** Restore media URLs + landing page html/css/js after reload. */
export async function rehydratePersistedMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const withMedia = rehydrateMessagesWithMedia(messages);
  if (!withMedia.length || typeof window === 'undefined') return withMedia;

  const merged = await Promise.all(
    withMedia.map(async (msg) => {
      let next = msg;

      if (msg.role === 'assistant' && isLandingOutput(msg.featureOutput)) {
        const fo = { ...msg.featureOutput };
        const hasHtml = typeof fo.html === 'string' && fo.html.trim().length > 0;

        if (!hasHtml) {
          const stored = await loadLandingBuild(msg.id);
          if (stored) {
            fo.html = stored.html;
            fo.css = typeof fo.css === 'string' && fo.css.trim() ? fo.css : stored.css;
            fo.js = typeof fo.js === 'string' && fo.js.trim() ? fo.js : stored.js;
          }
        }

        const content =
          msg.content?.trim() ||
          (typeof fo.summary === 'string' ? fo.summary : '') ||
          '🎉 YOUR PROJECT IS LIVE!';

        next = {
          ...msg,
          content,
          featureOutput: fo,
        };
      }

      return next;
    })
  );

  return merged;
}
