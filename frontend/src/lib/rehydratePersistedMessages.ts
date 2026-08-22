import type { ChatMessage } from '@/context/TerminalChatContext';
import { api } from '@/lib/api';
import { loadLandingBuild, saveLandingBuild } from '@/lib/landingBuildStorage';
import { rehydrateMessagesWithMedia } from '@/lib/messageRehydration';
import { isLegacyFabricatedLiveText } from '@/lib/landingOutcome';

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

        // IndexedDB is only a fast device-local cache. A terminal restored on a new
        // browser (or before the cache write settled) must recover the exact persisted
        // run output instead of displaying an empty preview or stale ship evidence.
        if (
          !(typeof fo.html === 'string' && fo.html.trim()) &&
          typeof fo.artifactRunId === 'string' &&
          fo.artifactRunId.trim()
        ) {
          try {
            const run = await api.swarm.getRun(fo.artifactRunId.trim());
            if (isLandingOutput(run.output)) {
              const recovered = run.output;
              const recoveredHtml =
                typeof recovered.html === 'string' ? recovered.html.trim() : '';
              if (recoveredHtml) {
                Object.assign(fo, recovered, { artifactRunId: fo.artifactRunId });
                await saveLandingBuild({
                  messageId: msg.id,
                  html: String(fo.html ?? ''),
                  css: String(fo.css ?? ''),
                  js: String(fo.js ?? ''),
                });
              }
            }
          } catch {
            // Keep the compact persisted outcome. The UI remains truthful even when
            // the network is offline; a later restore can retry authoritative recovery.
          }
        }

        const content =
          (msg.content?.trim() && !isLegacyFabricatedLiveText(msg.content) ? msg.content : '') ||
          (typeof fo.summary === 'string' ? fo.summary : '') ||
          'Build result restored. Review the shipping evidence below.';

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
