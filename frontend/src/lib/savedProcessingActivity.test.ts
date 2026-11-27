import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationActivityV2 } from '@/components/response-experience-v2/conversation';
import { sanitizeChatMessages } from './sanitizeChatMessages';
import type { XrogaActivityPresentation } from './terminal/activityPresentation';
import { buildProcessingStream } from './terminal/processingStream';

const row = (id: string, label: string, extra: Partial<XrogaActivityPresentation> = {}): XrogaActivityPresentation =>
  ({ id, kind: 'understand', label, status: 'complete', startedAt: 1, updatedAt: 1, ...extra });

const reload = (rows: unknown[]) => {
  const saved = JSON.parse(JSON.stringify([{ id: 'a', role: 'assistant', content: 'Answer', executionActivity: rows }]));
  return sanitizeChatMessages(saved)[0]!.executionActivity ?? [];
};

test('written notes, plan steps and source lists survive save and reload', () => {
  const note = `${'Weigh the long-term support line. '.repeat(18)}`.trim();
  const rows = reload([
    row('p', 'Look up the current release.', { note: true, planStep: true }),
    row('n', note, { note: true }),
    row('s', 'Searched the web', { kind: 'search', sources: [{ title: 'Node.js', url: 'https://nodejs.org/en' }] }),
  ]);
  const shown = buildProcessingStream(conversationActivityV2(rows), false);
  assert.deepEqual(shown.map(entry => entry.type), ['note', 'note', 'step']);
  assert.equal(shown[0]!.type === 'note' && shown[0]!.plan, true);
  assert.equal(shown[1]!.text, note);
  assert.deepEqual(shown[2]!.type === 'step' && shown[2]!.evidence?.sources, [{ title: 'Node.js', url: 'https://nodejs.org/en' }]);
});

test('reloaded note flags and sources are validated, never trusted as stored', () => {
  const [kept] = reload([row('s', 'Searched the web', {
    note: 'yes' as unknown as boolean,
    planStep: 1 as unknown as boolean,
    sources: [
      { title: 'x'.repeat(400), url: 'https://example.org/a' },
      { title: 'Script', url: 'javascript:alert(1)' },
      null as unknown as { title: string; url: string },
      ...Array.from({ length: 20 }, (_, index) => ({ title: 'More', url: `https://example.org/${index}` })),
    ],
  })]);
  assert.equal(kept!.note, undefined);
  assert.equal(kept!.planStep, undefined);
  assert.equal(kept!.sources!.length, 8);
  assert.equal(kept!.sources![0]!.title.length, 160);
  assert.ok(kept!.sources!.every(source => source.url.startsWith('https://')));
});
