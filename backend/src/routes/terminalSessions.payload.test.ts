/**
 * Payload-size and pagination contract for terminal-session responses.
 *
 * The sidebar renders a title, a number, a preview and a count. It never reads the
 * transcript or the prompt, yet the list endpoint used to send both for every row,
 * unbounded. This file pins the shape so a future `select('*')` cannot quietly
 * reintroduce megabyte list responses.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SUMMARY_COLUMNS,
  parseOffset,
  parsePageSize,
  toSummary,
} from './terminalSessions.js';

/** A realistic row: a long chat and a large prompt, which is the expensive case. */
function heavyRow(n: number) {
  return {
    id: `session-${n}`,
    user_id: 'user-1',
    github_repo_name: 'acme/site',
    github_branch: 'main',
    terminal_number: n,
    title: `#${n} terminal`,
    prompt: 'x'.repeat(20_000),
    preview: 'Build a landing page',
    messages: Array.from({ length: 300 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? 'assistant' : 'user',
      content: 'y'.repeat(1_200),
    })),
    kind: 'chat',
    status: 'active',
    message_count: 300,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

describe('terminal session list payloads', () => {
  it('never selects the transcript or the prompt', () => {
    assert.ok(!SUMMARY_COLUMNS.includes('messages'), 'messages must not be in the list projection');
    assert.ok(!SUMMARY_COLUMNS.includes('prompt'), 'prompt must not be in the list projection');
    // Everything the sidebar actually renders must still be there.
    for (const column of [
      'id',
      'github_repo_name',
      'terminal_number',
      'title',
      'preview',
      'message_count',
      'updated_at',
    ]) {
      assert.ok(SUMMARY_COLUMNS.includes(column), `${column} is required by the sidebar`);
    }
  });

  it('drops the transcript and prompt from a summary even if the row carries them', () => {
    const summary = toSummary(heavyRow(1)) as Record<string, unknown>;
    assert.ok(!('messages' in summary), 'a summary must never carry messages');
    assert.ok(!('prompt' in summary), 'a summary must never carry the prompt');
    assert.equal(summary.messageCount, 300, 'the count the sidebar shows is still present');
    assert.equal(summary.preview, 'Build a landing page');
  });

  it('shrinks a full page of sessions by orders of magnitude', () => {
    const rows = Array.from({ length: DEFAULT_PAGE_SIZE }, (_, i) => heavyRow(i + 1));
    const before = bytes(rows);
    const after = bytes(rows.map(toSummary));

    // Guard the ratio, not a brittle absolute size.
    assert.ok(before > 10_000_000, `fixture should be large, was ${before} bytes`);
    assert.ok(after < 20_000, `summary page should be small, was ${after} bytes`);
    assert.ok(
      before / after > 500,
      `expected a >500x reduction, got ${(before / after).toFixed(0)}x`
    );
  });

  it('bounds how much one request can ask for', () => {
    assert.equal(parsePageSize(undefined), DEFAULT_PAGE_SIZE, 'no limit means a sane default');
    assert.equal(parsePageSize('25'), 25);
    assert.equal(parsePageSize('100000'), MAX_PAGE_SIZE, 'an oversized limit is clamped');
    assert.equal(parsePageSize('-5'), DEFAULT_PAGE_SIZE);
    assert.equal(parsePageSize('abc'), DEFAULT_PAGE_SIZE);
    assert.equal(parsePageSize('7.9'), 7, 'fractional limits floor rather than error');
  });

  it('bounds how far one request can page', () => {
    assert.equal(parseOffset(undefined), 0);
    assert.equal(parseOffset('120'), 120);
    assert.equal(parseOffset('-3'), 0);
    assert.equal(parseOffset('abc'), 0);
    assert.equal(parseOffset('999999999'), 10_000, 'a runaway offset is clamped');
  });

  it('a write response is metadata only, so an autosave does not pay for its payload twice', () => {
    const row = heavyRow(1);
    const written = toSummary(row) as Record<string, unknown>;
    assert.ok(!('messages' in written));
    assert.ok(!('prompt' in written));
    assert.ok(
      bytes(written) < 1_000,
      `a write response should be well under 1 KB, was ${bytes(written)} bytes`
    );
    // The client needs exactly this much back to place the row in the sidebar.
    assert.equal(written.id, 'session-1');
    assert.equal(written.terminalNumber, 1);
    assert.equal(written.githubRepoName, 'acme/site');
  });
});
