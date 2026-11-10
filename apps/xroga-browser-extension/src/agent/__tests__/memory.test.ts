import { describe, expect, it } from 'vitest';
import type { Entry } from '@src/store/types';
import { toModelMessages } from '../context';
import { agentSystemPrompt, MEMORY } from '../prompt';
import { progressLedger } from '../progress';

let n = 0;
const message = (role: 'user' | 'assistant' | 'tool', parts: unknown[]): Entry =>
  ({ id: `m${n++}`, type: 'message', parentId: null, appOwned: false, message: { role, parts } }) as unknown as Entry;
const user = (text: string) => message('user', [{ type: 'text', text }]);
const assistant = (text: string) => message('assistant', [{ type: 'text', text }]);

const flatten = (branch: Entry[]) =>
  JSON.stringify(toModelMessages(branch, { vision: false }));

describe('memory of a conversation', () => {
  it('tells the agent to use the conversation and never ask the user to repeat', () => {
    const system = agentSystemPrompt({ tools: ['snapshot', 'read', 'done'] });
    expect(system).toContain(MEMORY);
    expect(system).toContain('Never ask the user to repeat');
    expect(system).toContain('done, skipped or failed, and why');
  });

  it('sends a later request everything said earlier: the strategy, the attached file note and the earlier result', () => {
    const branch = [
      user('My business sells car recovery in Dubai. Use a call-first Meta strategy with a 300 AED daily budget.'),
      assistant('Plan: lead objective, 25 km radius, WhatsApp click-to-chat. Ready to draft.'),
      user('Here are my 10 clients.\n[attached file leads.csv (id f1) has 10 rows]'),
      assistant('Outreach done for 8 clients. Skipped Ali (no phone) and Sara (opted out).'),
      user('Why did you skip two of them?'),
    ];
    const sent = flatten(branch);
    expect(sent).toContain('call-first Meta strategy');
    expect(sent).toContain('300 AED');
    expect(sent).toContain('leads.csv (id f1)');
    expect(sent).toContain('Skipped Ali (no phone) and Sara (opted out)');
    expect(sent).toContain('Why did you skip two of them?');
  });

  it('keeps the earlier steps of a conversation available as a list when a new run starts', () => {
    const branch = [
      user('Sign these clients up'),
      message('assistant', [{ type: 'tool-call', toolCallId: 'a', toolName: 'fill_form', input: { intent: 'Sign up Ali' } }]),
      message('tool', [{ type: 'tool-result', toolCallId: 'a', toolName: 'fill_form', text: 'fill_form · 4 fields', isError: false }]),
    ];
    expect(progressLedger(branch)).toContain('done · fill_form: Sign up Ali');
  });
});
