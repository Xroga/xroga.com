import { expect, it } from 'vitest';
import type { Entry } from '@src/store/types';
import { browserActivity } from '../activity';

const entry: Entry = {
  type: 'message',
  id: 'step',
  parentId: null,
  at: '',
  conversationId: 'conversation',
  meta: { runId: 'run' },
  message: {
    role: 'tool',
    parts: [
      { type: 'tool-result', toolCallId: 'provider-id', toolName: 'click', text: 'private text', isError: false },
    ],
  },
  result: {
    page: { tabId: 3, rev: 10, url: 'https://example.test/private?session=secret' },
    receipt: { dispatched: true, target: 'private target', postcondition: { status: 'met', detail: 'private detail' } },
  },
};

it('projects the persisted receipt for the exact run without sending page data or provider IDs', () => {
  expect(browserActivity(entry, 'different-run')).toBeUndefined();
  expect(browserActivity(entry, 'run')).toEqual({
    stepId: 'step',
    tool: 'click',
    status: 'verified',
    tabId: 3,
    revision: 10,
  });
});

it.each([
  [{ dispatched: 'unknown', postcondition: { status: 'met' } }, 'uncertain'],
  [{ dispatched: true, reachedTarget: false }, 'failed'],
  [{ dispatched: true, postcondition: { status: 'unmet' } }, 'unmet'],
  [{ dispatched: true, effect: { verdict: 'changed' } }, 'page-changed'],
  [{ dispatched: true }, 'dispatched'],
])('distinguishes receipt states without inferring verification', (receipt, status) => {
  expect(browserActivity({ ...entry, result: { receipt } }, 'run')?.status).toBe(status);
});
