import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  addPendingBuildJob,
  attachPendingBuildRun,
  loadPendingBuildJobs,
  reconcilePendingBuildTranscript,
  updatePendingBuildSequence,
} from './pendingBuildJobs';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

beforeEach(() => storage.clear());

test('pending build recovery never moves its replay cursor backwards', () => {
  addPendingBuildJob({
    assistantMessageId: 'assistant-1',
    userMessageId: 'user-1',
    userPrompt: 'Build a site',
    startedAt: 1,
  });
  attachPendingBuildRun('assistant-1', 'run-1');
  updatePendingBuildSequence('assistant-1', 7);
  updatePendingBuildSequence('assistant-1', 3);

  assert.deepEqual(loadPendingBuildJobs()[0], {
    assistantMessageId: 'assistant-1',
    userMessageId: 'user-1',
    userPrompt: 'Build a site',
    startedAt: 1,
    runId: 'run-1',
    lastSequence: 7,
  });
});

test('pending build recovery restores a factual transcript after an early refresh', () => {
  const recovered = reconcilePendingBuildTranscript([], {
    assistantMessageId: 'assistant-1',
    userMessageId: 'user-1',
    userPrompt: 'Build a DeFi dashboard',
    startedAt: 10,
  });

  assert.deepEqual(recovered, [
    {
      id: 'user-1',
      role: 'user',
      content: 'Build a DeFi dashboard',
      createdAt: 10,
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: 11,
    },
  ]);
  assert.equal(reconcilePendingBuildTranscript(recovered, {
    assistantMessageId: 'assistant-1',
    userMessageId: 'user-1',
    userPrompt: 'Build a DeFi dashboard',
    startedAt: 10,
  }), recovered);
});
