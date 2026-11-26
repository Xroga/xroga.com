import { describe, expect, it } from 'vitest';
import { CHAPTERS_TOOL, DEFAULT_SECONDS, MAX_SECONDS, TRANSCRIBE_TOOL, cleanChunks, clampSeconds, clock, describeChapters, describeTranscript, describeView } from '../transcript-format';

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

describe('transcript views', () => {
  const words = [
    { text: 'So', start: 0.2, end: 0.5 }, { text: 'um', start: 0.6, end: 0.9 }, { text: 'welcome', start: 1.0, end: 1.5 }, { text: 'everyone.', start: 1.6, end: 2.1 },
    { text: 'Today', start: 4.5, end: 5.0 }, { text: 'uh', start: 5.1, end: 5.3 }, { text: 'we', start: 5.4, end: 5.6 }, { text: 'we', start: 5.7, end: 5.9 }, { text: 'cook.', start: 6.0, end: 6.5 },
  ];
  const result = { chunks: [], words, readSeconds: 10, totalSeconds: 60, model: 'whisper-tiny.en', from: 0 };

  it('lists every word with its time, or only the ones with a word', () => {
    const all = describeView(result, 'words');
    expect(all).toContain('0:01 welcome');
    expect(all).toContain('9 words');
    const found = describeView(result, 'words', { find: 'we' });
    expect(found).toContain('Words with "we": 3');
    expect(found).not.toContain('0:04');
  });

  it('lists the hesitations with the ranges to remove and what stays, repeats only when asked', () => {
    const plain = describeView(result, 'fillers');
    expect(plain).toContain('2 to cut');
    expect(plain).toContain('0:00 "um"'.replace('0:00', '0:00'));
    expect(plain).toContain('"start":0.55');
    expect(plain).toContain('What stays');
    const repeats = describeView(result, 'fillers', { repeats: true });
    expect(repeats).toContain('3 to cut');
    expect(repeats).toContain('(repeat)');
    expect(describeView({ ...result, words: [{ text: 'hello', start: 0, end: 1 }] }, 'fillers')).toContain('No hesitation words');
  });

  it('groups speech into blocks to choose chapters from, with the rules for them', () => {
    const outline = describeView(result, 'outline');
    expect(outline).toContain('blocks of speech');
    expect(outline).toContain('at least three');
    expect(outline).toContain('[0:00–0:06] So um welcome everyone.');
  });

  it('says so when the word times were spread over lines, and when there are no words', () => {
    expect(describeView({ ...result, wordsSpread: true }, 'words')).toContain('spreading it over its line');
    expect(describeView({ ...result, words: [] }, 'words')).toContain('No speech was found');
    expect(describeView({ ...result, words: undefined }, 'words')).toContain('Speech read from the sound');
  });

  it('writes chapters for a description with the warnings', () => {
    const ok = describeChapters({ chapters: [{ time: 60, title: 'Main' }, { time: 0, title: 'Intro' }, { time: 120, title: 'End' }], duration: 300 });
    expect(ok).toContain('00:00 Intro\n01:00 Main\n02:00 End');
    expect(ok).toContain('meets what YouTube needs');
    const bad = describeChapters({ chapters: [{ time: 5, title: 'A' }], duration: 100, ffmpeg: true });
    expect(bad).toContain('would not accept');
    expect(bad).toContain(';FFMETADATA1');
    expect(CHAPTERS_TOOL.name).toBe('chapters');
  });
});
