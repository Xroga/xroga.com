import { describe, expect, it } from 'vitest';
import { DEFAULT_SECONDS, MAX_SECONDS, TRANSCRIBE_TOOL, cleanChunks, clampSeconds, clock, describeTranscript } from '../transcript-format';

describe('transcribe formatting', () => {
  it('writes times as minutes and seconds, with hours when needed', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75.9)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
  });

  it('keeps the amount to read inside the limits', () => {
    expect(clampSeconds(undefined)).toBe(DEFAULT_SECONDS);
    expect(clampSeconds(1)).toBe(5);
    expect(clampSeconds(99999)).toBe(MAX_SECONDS);
    expect(clampSeconds(60.7)).toBe(60);
    expect(clampSeconds('x')).toBe(DEFAULT_SECONDS);
  });

  it('tidies spaces, drops sound notes and merges a repeated line', () => {
    const chunks = cleanChunks([
      { timestamp: [0, 2], text: ' Hello   there.' },
      { timestamp: [2, 3], text: ' [BLANK_AUDIO]' },
      { timestamp: [3, 4], text: ' (music)' },
      { timestamp: [4, 6], text: ' Thank you.' },
      { timestamp: [6, null], text: ' Thank you.' },
    ]);
    expect(chunks).toEqual([
      { start: 0, end: 2, text: 'Hello there.' },
      { start: 4, end: 6, text: 'Thank you.' },
    ]);
  });

  it('lists lines with times, says when only part was read, and narrows with find', () => {
    const result = { chunks: [{ start: 0, end: 4, text: 'The birch canoe.' }, { start: 65, end: 70, text: 'Glue the sheet.' }], readSeconds: 120, totalSeconds: 600, model: 'whisper-tiny.en' };
    const all = describeTranscript(result);
    expect(all).toContain('[0:00] The birch canoe.');
    expect(all).toContain('[1:05] Glue the sheet.');
    expect(all).toContain('Only the first 2:00 was read');
    expect(all).toContain('machine transcript');
    const found = describeTranscript(result, { find: 'glue' });
    expect(found).toContain('Lines with "glue": 1');
    expect(found).not.toContain('birch');
    expect(describeTranscript(result, { find: 'zebra' })).toContain('No line has "zebra"');
  });

  it('says plainly when no speech was found', () => {
    expect(describeTranscript({ chunks: [], readSeconds: 30, model: 'whisper-tiny.en' })).toContain('No speech was found');
  });

  it('is a reading tool with only a web address required', () => {
    expect(TRANSCRIBE_TOOL.group).toBe('reading');
    expect((TRANSCRIBE_TOOL.parameters as { required: string[] }).required).toEqual(['url']);
  });
});
