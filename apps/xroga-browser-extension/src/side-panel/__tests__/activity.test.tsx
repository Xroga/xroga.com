// Activity follows worker events and actual response text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { elapsed, phaseOf } from '../Activity';
import { Transcript } from '../Transcript';
import type { DisplayEntry, ToolRow } from '@src/ui/protocol';

const row = (status: ToolRow['status']): ToolRow => ({ toolCallId: status, tool: 'click', args: {}, status });
const user = (id: string, at: string): DisplayEntry => ({ kind: 'user', id, text: 'Hi', at });
const reply = (id: string, at: string, extra: Partial<Extract<DisplayEntry, { kind: 'assistant' }>> = {}) =>
  ({ kind: 'assistant', id, text: '', at, tools: [], ...extra }) as DisplayEntry;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => vi.useRealTimers());

describe('activity status line', () => {
  it('formats the elapsed time', () => {
    expect(elapsed(4_900)).toBe('4s');
    expect(elapsed(125_000)).toBe('2m 5s');
    expect(elapsed(3_780_000)).toBe('1h 3m');
    expect(elapsed(-50)).toBe('0s');
  });

  it('prioritizes approval and running tools over incoming answer text', () => {
    expect(phaseOf([row('done'), row('running')], false, true)).toBe('working');
    expect(phaseOf([row('running'), row('waiting')], false)).toBe('waiting');
    expect(phaseOf([row('done')], true)).toBe('waiting');
    expect(phaseOf([row('done')], false)).toBe('between');
  });

  it('a finished run reads "Worked for", from when the run began to its last reply', () => {
    const html = renderToStaticMarkup(
      <Transcript
        entries={[
          user('u', '2026-10-08T10:00:00.000Z'),
          reply('a1', '2026-10-08T10:00:05.000Z', { runStartedAt: '2026-10-08T10:00:01.000Z', tools: [row('done')] }),
          reply('a2', '2026-10-08T10:01:13.000Z', { runStartedAt: '2026-10-08T10:00:01.000Z', text: 'Done.' }),
        ]}
        streaming={null}
      />,
    );
    expect(text(html)).toContain('Worked for 1m 12s');
    expect(html).toContain('aria-expanded="false"');
  });

  it('a reply stored without the run start counts from its model call', () => {
    const html = renderToStaticMarkup(
      <Transcript
        entries={[user('u', '2026-10-08T10:00:00.000Z'), reply('a', '2026-10-08T10:00:09.000Z', { durationMs: 3000 })]}
        streaming={null}
      />,
    );
    expect(text(html)).toContain('Worked for 3s');
    expect(html).not.toContain('aria-expanded');
  });

  it('a working run shows its phase and the time since it began', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:00:20.000Z'));
    const entries = [
      user('u', '2026-10-08T10:00:00.000Z'),
      reply('a', '2026-10-08T10:00:05.000Z', { runStartedAt: '2026-10-08T10:00:01.000Z', tools: [row('running')] }),
    ];
    const html = renderToStaticMarkup(<Transcript entries={entries} streaming={null} live={{ waiting: false }} />);
    expect(text(html)).toContain('Clicking a page control 19s');
    expect(text(html)).not.toContain('Worked for');
  });

  it('before the first reply the line stands alone, and a message sent during the run starts its own time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:00:30.000Z'));
    const entries = [
      user('u1', '2026-10-08T10:00:00.000Z'),
      reply('a', '2026-10-08T10:00:05.000Z', { runStartedAt: '2026-10-08T10:00:01.000Z', tools: [row('done')] }),
      user('u2', '2026-10-08T10:00:26.000Z'),
    ];
    const html = renderToStaticMarkup(
      <Transcript
        entries={entries}
        streaming={{ id: 'next', text: '' }}
        live={{ startedAt: '2026-10-08T10:00:01.000Z', waiting: false }}
      />,
    );
    expect(text(html)).toContain('Worked for 4s');
    expect(text(html)).toContain('Waiting for the next update… 4s');
  });

  it('only shows writing after a real text update', () => {
    const entries = [user('u', '2026-10-08T10:00:00.000Z')];
    const live = { startedAt: entries[0].at, waiting: false };
    const render = (streaming: { id: string; text: string } | null) =>
      text(renderToStaticMarkup(<Transcript entries={entries} streaming={streaming} live={live} />));
    expect(render(null)).toContain('Starting request');
    expect(render({ id: 'a', text: '' })).not.toContain('Writing response');
    expect(render({ id: 'a', text: 'Here are the results' })).toContain('Writing response');
  });

  it('uses the destination host for a live navigation and leaves private URL parts out of its headline', () => {
    const entries = [
      user('u', '2026-10-08T10:00:00.000Z'),
      reply('a', '2026-10-08T10:00:05.000Z', {
        tools: [{ ...row('running'), tool: 'navigate', args: { url: 'https://example.org/path?private=value' } }],
      }),
    ];
    const html = renderToStaticMarkup(<Transcript entries={entries} streaming={null} live={{ waiting: false }} />);
    expect(text(html)).toContain('Opening example.org');
    expect(html).not.toContain('private=value');
  });

  it('no block of a working run shows its answer line, also one a saved file split off', () => {
    const entries: DisplayEntry[] = [
      user('u', '2026-10-08T10:00:00.000Z'),
      reply('a1', '2026-10-08T10:00:05.000Z', { text: 'Saving the report.' }),
      { kind: 'download', id: 'd', name: 'report.md', downloadId: 1, bytes: 10, at: '2026-10-08T10:00:06.000Z' },
      reply('a2', '2026-10-08T10:00:08.000Z', { text: 'Still working.' }),
    ];
    const lines = (live?: { waiting: boolean }) =>
      renderToStaticMarkup(<Transcript entries={entries} streaming={null} live={live} />).match(
        /data-role="assistant"[\s\S]*?aria-label="Copy"/g,
      )?.length ?? 0;
    expect(lines({ waiting: false })).toBe(0);
    expect(lines()).toBe(2);
  });
});
