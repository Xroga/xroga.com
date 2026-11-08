import type { Entry } from '@src/store/types';

const browserTools = new Set([
  'snapshot',
  'find',
  'read',
  'screenshot',
  'wait',
  'click',
  'set',
  'type',
  'press',
  'navigate',
  'handle_dialog',
  'fill_form',
  'hover',
  'scroll',
  'tabs',
  'upload',
  'read_attachment',
  'save_file',
]);

export const ACTIVITY_LIMIT = 40;

type Receipt = {
  dispatched?: unknown;
  reachedTarget?: unknown;
  effect?: { verdict?: unknown };
  postcondition?: { status?: unknown };
};

function outcome(receipt: Receipt | undefined, isError: boolean, delivered: unknown) {
  if (delivered === 'unknown' || receipt?.dispatched === 'unknown') return 'uncertain';
  if (isError || receipt?.reachedTarget === false || receipt?.dispatched === false) return 'failed';
  if (receipt?.postcondition?.status === 'met') return 'verified';
  if (receipt?.postcondition?.status === 'unmet') return 'unmet';
  if (receipt?.effect?.verdict === 'changed') return 'page-changed';
  return receipt?.dispatched === true ? 'dispatched' : 'done';
}

/** Workspace receives a bounded receipt summary. The full observation and user inputs stay in Chrome. */
export function browserActivity(entry: Entry, runId: string) {
  if (entry.type !== 'message' || entry.meta?.runId !== runId || entry.message.role !== 'tool') return;
  const part = entry.message.parts.find(part => part.type === 'tool-result');
  if (!part || !browserTools.has(part.toolName)) return;

  const result = entry.result as
    | {
        receipt?: Receipt;
        error?: { delivered?: unknown };
        page?: { tabId?: unknown; rev?: unknown };
      }
    | undefined;
  const tabId = result?.page?.tabId;
  const revision = result?.page?.rev;
  return {
    stepId: entry.id,
    tool: part.toolName,
    status: outcome(result?.receipt, part.isError, result?.error?.delivered),
    ...(typeof tabId === 'number' && Number.isSafeInteger(tabId) && tabId >= 0 ? { tabId } : {}),
    ...(typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? { revision } : {}),
  };
}
