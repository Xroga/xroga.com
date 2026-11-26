import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JOURNAL_COLUMNS, appendJournal, compare, errorClass, loadRun, mean, reproInfo, scoreRows, stderr, summarize } from '../../../fixtures/acceptance/study.mjs';

const tasks = [
  { name: 'T1', expect: { type: 'contains_all', values: ['alpha', 'beta'] } },
  { name: 'T2', expect: { type: 'number', value: 10, tolerance: 0 } },
  { name: 'T3', expect: { type: 'contains_all', values: ['gamma'] } },
];
const row = (name: string, answer: string, extra: Record<string, unknown> = {}) => ({ name, status: 'done', seconds: 10, turns: 4, used: ['read_file'], answer, ...extra });

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'study-'));
  dirs.push(d);
  return d;
};

describe('acceptance study', () => {
  it('averages with a standard error from the sample spread', () => {
    expect(mean([1, 0, 1, 0])).toBe(0.5);
    expect(stderr([1, 0, 1, 0])).toBeCloseTo(Math.sqrt((4 * 0.25) / 3) / 2, 6);
    expect(stderr([1])).toBe(0);
    expect(stderr([])).toBe(0);
  });

  it('names why a task did not end well, and none for a good answer', () => {
    expect(errorClass({ status: 'done', answer: 'x' })).toBeNull();
    expect(errorClass({ status: 'done', answer: '  ' })).toBe('empty-answer');
    expect(errorClass({ status: 'failed', reason: 'Stopped: step limit reached' })).toBe('step-limit');
    expect(errorClass({ status: 'failed', reason: 'the run stalled with no progress' })).toBe('stalled');
    expect(errorClass({ status: 'failed', reason: 'Timed out waiting for the page' })).toBe('timeout');
    expect(errorClass({ status: 'failed', reason: 'The site asked for a sign in' })).toBe('blocked-by-site');
    expect(errorClass({ status: 'failed', reason: 'rate limit from the provider' })).toBe('model-or-provider');
    expect(errorClass({ status: 'failed', reason: 'who knows' })).toBe('other');
  });

  it('scores a run, summarises it, and counts tools and error classes', () => {
    const scored = scoreRows(tasks, [row('T1', 'alpha and beta'), row('T2', 'about 9', { used: ['read_pdf', 'read_file'] }), row('T3', '', { status: 'failed', reason: 'timed out' }), row('Unknown', 'x')]);
    expect(scored.map((r: { score: number | null }) => r.score)).toEqual([1, expect.any(Number), 0, null]);
    const s = summarize(scored);
    expect(s).toMatchObject({ tasks: 4, scored: 3, passed: 1, meanTurns: 4, meanSeconds: 10 });
    expect(s.meanScore).toBeGreaterThan(0.3);
    expect(s.meanScore).toBeLessThan(0.7);
    expect(s.errors).toEqual({ timeout: 1 });
    expect(Object.keys(s.toolsUsed)[0]).toBe('read_file');
    expect(s.toolsUsed.read_file).toBe(4);
  });

  it('compares two runs on the tasks both have and only calls a clear difference real', () => {
    const a = scoreRows(tasks, [row('T1', 'alpha'), row('T2', '3'), row('T3', 'gamma', { turns: 6 })]);
    const b = scoreRows(tasks, [row('T1', 'alpha and beta'), row('T2', '10'), row('T3', 'nothing', { turns: 3 })]);
    const c = compare(a, b);
    expect(c.common).toBe(3);
    expect(c.improvements.map((x: { name: string }) => x.name)).toEqual(['T1', 'T2']);
    expect(c.regressions.map((x: { name: string }) => x.name)).toEqual(['T3']);
    expect(c.meanTurnsDifference).toBeCloseTo(-1, 5);
    expect(c.verdict).toBe('no clear difference');
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `X${i}`, expect: { type: 'contains_all', values: ['ok'] } }));
    const worse = compare(scoreRows(many, many.map(t => row(t.name, 'ok'))), scoreRows(many, many.map((t, i) => row(t.name, i < 7 ? 'bad' : 'ok'))));
    expect(worse.verdict).toBe('B is worse');
    expect(compare(a.slice(0, 1), b.slice(0, 1)).verdict).toBe('too few common tasks to tell');
    expect(compare(a, b.slice(0, 2)).onlyInA).toEqual(['T3']);
  });

  it('reads the run files that the live harness writes', () => {
    const d = tmp();
    writeFileSync(join(d, 'T1.json'), JSON.stringify({ reports: [{ result: { tasks: [{ status: 'done', seconds: 5, turns: 2, used: ['site_map'], answer: 'alpha beta' }] } }] }));
    writeFileSync(join(d, 'T2.json'), JSON.stringify({ reports: [{ tasks: [{ status: 'done', seconds: 7, turns: 3, answer: '10' }] }] }));
    writeFileSync(join(d, 'broken.json'), '{nope');
    writeFileSync(join(d, 'notes.txt'), 'ignored');
    const rows = loadRun(d);
    expect(rows.map(r => r.name)).toEqual(['T1', 'T2']);
    expect(rows[0]).toMatchObject({ seconds: 5, turns: 2, used: ['site_map'] });
    expect(scoreRows(tasks, rows).map((r: { score: number | null }) => r.score)).toEqual([1, 1]);
  });

  it('keeps a journal with one header, and refuses a file with other columns', () => {
    const d = tmp();
    const file = join(d, 'sub', 'journal.csv');
    const info = reproInfo({ model: 'm, "x"', label: 'first', noSkills: true, date: new Date('2026-11-26T10:00:00Z') });
    expect(info).toMatchObject({ date: '2026-11-26', skills: 'off', model: 'm, "x"', platform: process.platform, node: process.version });
    const s = summarize(scoreRows(tasks, [row('T1', 'alpha beta')]));
    appendJournal(file, info, s);
    appendJournal(file, { ...info, label: 'second' }, s);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines[0]).toBe(JOURNAL_COLUMNS.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"m, ""x"""');
    expect(lines[2]).toContain('second');
    writeFileSync(file, 'other,columns\n');
    expect(() => appendJournal(file, info, s)).toThrow(/other columns/);
  });
});
