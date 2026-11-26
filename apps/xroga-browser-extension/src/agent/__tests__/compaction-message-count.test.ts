import { describe, expect, it } from 'vitest';
import { planCompaction, RECENT_MESSAGE_LIMIT } from '../compaction';

// Many short steps: the recent part must stay under the message cap even though its characters are tiny, because the
// Xroga server refuses a request of more than 140 messages whatever their size.
const entry = (id: string, role: 'user' | 'assistant' | 'tool', text: string) =>
  ({
    id,
    type: 'message',
    message:
      role === 'tool'
        ? { role: 'tool', parts: [{ type: 'tool-result', toolName: 'read', toolCallId: id, text }] }
        : { role, parts: [{ type: 'text', text }] },
  }) as never;

describe('compaction by message count', () => {
  it('keeps at most RECENT_MESSAGE_LIMIT recent messages when every step is tiny', () => {
    const entries = [entry('u', 'user', 'task')];
    for (let i = 0; i < 100; i++) {
      entries.push(entry(`a${i}`, 'assistant', 'x'), entry(`t${i}`, 'tool', 'y'));
    }
    const plan = planCompaction(entries, 1_000_000);
    expect(plan).not.toBeNull();
    const keptFrom = entries.findIndex((e: { id: string }) => e.id === plan!.firstKeptId);
    expect(entries.length - keptFrom).toBeLessThanOrEqual(RECENT_MESSAGE_LIMIT + 2);
    expect(entries.length - keptFrom).toBeGreaterThan(10);
  });

  it('keeps a short conversation whole', () => {
    const entries = [entry('u', 'user', 'task')];
    for (let i = 0; i < 10; i++) entries.push(entry(`a${i}`, 'assistant', 'x'), entry(`t${i}`, 'tool', 'y'));
    expect(planCompaction(entries, 1_000_000)).toBeNull();
  });
});
