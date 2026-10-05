import type { ChatMessage } from '@/context/TerminalChatContext';

import type { HackathonBriefCardData } from '@/lib/hackathonBrief';
import type { XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';

function sanitizeHackathonBrief(raw: unknown): ChatMessage['hackathonBrief'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  if (typeof b.name !== 'string' || typeof b.sponsor !== 'string') return undefined;
  return raw as HackathonBriefCardData;
}

function isPersistedExecutionActivity(item: unknown): item is XrogaActivityPresentation {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const value = item as Record<string, unknown>;
  const kinds = new Set([
    'respond', 'understand', 'search', 'open-source', 'read-source', 'compare', 'summarize',
    'read-file', 'write-file', 'code', 'command', 'test', 'browser', 'database',
    'connected-app-read', 'connected-app-write', 'automation', 'upload', 'download',
    'deploy', 'verify', 'approval', 'connection', 'waiting', 'complete', 'warning', 'error',
  ]);
  const statuses = new Set([
    'active', 'complete', 'waiting', 'warning', 'error', 'cancelled', 'interrupted',
  ]);
  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    kinds.has(value.kind) &&
    typeof value.label === 'string' &&
    typeof value.status === 'string' &&
    statuses.has(value.status) &&
    typeof value.startedAt === 'number' &&
    Number.isFinite(value.startedAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  );
}

function sanitizeExecutionActivity(raw: unknown): ChatMessage['executionActivity'] {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.filter(isPersistedExecutionActivity).slice(-80);
  return items.length ? items : undefined;
}

function sanitizeWebSources(raw: unknown): ChatMessage['webSources'] {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title : 'Source',
      url: typeof s.url === 'string' ? s.url : '',
      snippet: typeof s.snippet === 'string' ? s.snippet : '',
      source: typeof s.source === 'string' ? s.source : 'web',
      thumbnailUrl: typeof s.thumbnailUrl === 'string' ? s.thumbnailUrl : undefined,
      siteDomain: typeof s.siteDomain === 'string' ? s.siteDomain : undefined,
      channelTitle: typeof s.channelTitle === 'string' ? s.channelTitle : undefined,
    }))
    .filter((s) => s.url.startsWith('http'));
  return items.length ? items : undefined;
}

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
          const hasProject = typeof fo.projectName === 'string' && fo.projectName.length > 0;
          const hasContent = typeof m.content === 'string' && m.content.trim().length > 0;
          // Keep landing cards after refresh — html/css/js restore from IndexedDB separately
          if (
            !deployUrl &&
            !hasHtml &&
            !hasSummary &&
            !hasGithub &&
            !hasProject &&
            !hasContent
          ) {
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
        executionActivity: sanitizeExecutionActivity(m.executionActivity),
        webSources: sanitizeWebSources(m.webSources),
        hackathonBrief: sanitizeHackathonBrief(m.hackathonBrief),
      };
    });
}
