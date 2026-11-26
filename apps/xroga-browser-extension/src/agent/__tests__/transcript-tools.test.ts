import { describe, expect, it } from 'vitest';
import { beatCutTimes, chapterText, chapterWarnings, downbeats, ffmetadataChapters, findFillers, formatTimestamp, groupIntoBlocks, keepSegments, normalizeWord, wordsToCues, type TimedWord } from '../transcript-tools';

const w = (text: string, start: number, end: number): TimedWord => ({ text, start, end });

describe('fillers and repeats', () => {
  const words = [w('So', 0, 0.3), w('um,', 0.4, 0.7), w('I', 0.8, 0.9), w('I', 1.0, 1.1), w('think', 1.15, 1.5), w('uh', 1.55, 1.8), w('Ähm…', 1.82, 2.0), w('yes', 2.4, 2.7)];

  it('finds hesitations, ignores case and punctuation, and cuts around them without touching kept words', () => {
    const { matches, ranges } = findFillers(words);
    expect(matches.map(m => m.text)).toEqual(['um,', 'uh', 'Ähm…']);
    expect(ranges).toEqual([{ start: 0.35, end: 0.75 }, { start: 1.5, end: 2.05 }]);
    // never into the neighbours: "So" ends at 0.3, "I" starts at 0.8, "think" ends at 1.5, "yes" starts at 2.4
    for (const r of ranges) {
      expect(r.start).toBeGreaterThanOrEqual(0.3);
      expect(r.end).toBeLessThanOrEqual(2.4);
    }
  });

  it('cuts the earlier copy of a repeated word when asked, and joins ranges that are close', () => {
    const r = findFillers(words, { repeats: true, mergeGap: 0.3 });
    expect(r.matches.map(m => [m.text, m.kind])).toEqual([['um,', 'filler'], ['I', 'repeat'], ['uh', 'filler'], ['Ähm…', 'filler']]);
    expect(r.ranges[0]!.start).toBe(0.35);
    expect(r.ranges[0]!.end).toBeGreaterThanOrEqual(0.95); // um and the first I are one cut
    expect(findFillers([w('the', 0, 1), w('the', 3, 4)], { repeats: true }).matches).toEqual([]); // too far apart
  });

  it('takes a list of fillers of its own', () => {
    expect(findFillers([w('basically', 0, 1), w('um', 1, 1.2)], { fillers: ['basically'] }).matches.map(m => m.text)).toEqual(['basically']);
    expect(normalizeWord('  Ähm… ')).toBe('ähm');
  });

  it('turns cuts into the stretches that stay', () => {
    expect(keepSegments(10, [{ start: 2, end: 3 }, { start: 2.5, end: 4 }, { start: 8, end: 10 }])).toEqual([{ start: 0, end: 2 }, { start: 4, end: 8 }]);
    expect(keepSegments(5, [])).toEqual([{ start: 0, end: 5 }]);
    expect(keepSegments(5, [{ start: 0, end: 5 }])).toEqual([]);
  });
});

describe('cues and blocks', () => {
  it('groups words into caption lines by pause, sentence end, length and time', () => {
    const words = [w('Hello', 0, 0.4), w('there', 0.5, 0.9), w('friends.', 1, 1.4), w('Now', 1.5, 1.8), w('listen', 1.9, 2.2), w('carefully', 3.5, 4)];
    const cues = wordsToCues(words, { maxGap: 0.7 });
    expect(cues.map(c => c.text)).toEqual(['Hello there friends.', 'Now listen', 'carefully']);
    expect(cues[0]!.start).toBe(0);
    expect(cues[0]!.end).toBe(1.4);
    expect(wordsToCues([w('a', 0, 1), w('b', 1.1, 9)], { maxDuration: 6 }).length).toBe(2);
    expect(wordsToCues([w('  ', 0, 1)])).toEqual([]);
  });

  it('groups lines into blocks, closing early at a break once the block is long enough', () => {
    const cues = Array.from({ length: 12 }, (_, i) => ({ start: i * 10, end: i * 10 + 9, text: `line ${i}`, words: [] }));
    const plain = groupIntoBlocks(cues, { minDuration: 20, maxDuration: 40 });
    expect(plain.every(b => b.end - b.start <= 40)).toBe(true);
    expect(plain.length).toBeGreaterThan(2);
    const broken = groupIntoBlocks(cues, { minDuration: 20, maxDuration: 100, breaks: [50] });
    expect(broken[0]!.end).toBeLessThanOrEqual(50);
    expect(broken[0]!.end - broken[0]!.start).toBeGreaterThanOrEqual(20);
    expect(groupIntoBlocks([], {})).toEqual([]);
  });
});

describe('chapters', () => {
  it('writes timestamps with hours only when needed, and one line per chapter', () => {
    expect(formatTimestamp(75)).toBe('01:15');
    expect(formatTimestamp(3725)).toBe('01:02:05');
    expect(chapterText([{ time: 0, title: 'Intro' }, { time: 75, title: 'Main' }], 600)).toBe('00:00 Intro\n01:15 Main');
    expect(chapterText([{ time: 0, title: 'Intro' }, { time: 75, title: 'Main' }], 4000)).toBe('00:00:00 Intro\n00:01:15 Main');
  });

  it('warns about what YouTube refuses', () => {
    expect(chapterWarnings([], 100)).toEqual(['There are no chapters.']);
    const w1 = chapterWarnings([{ time: 5, title: 'A' }, { time: 12, title: 'B' }], 100);
    expect(w1.join('\n')).toContain('needs one at 00:00');
    expect(w1.join('\n')).toContain('at least 3 chapters');
    expect(w1.join('\n')).toContain('Chapter "A" (00:05) is 7 s long');
    expect(chapterWarnings([{ time: 0, title: 'A' }, { time: 30, title: 'B' }, { time: 60, title: 'C' }], 100)).toEqual([]);
    expect(chapterWarnings([{ time: 0, title: 'A' }, { time: 30, title: 'B' }, { time: 20, title: 'C' }], 100).join()).toContain('does not come after');
  });

  it('writes ffmpeg chapter metadata, escaping what it must, and dropping chapters past the end', () => {
    const text = ffmetadataChapters([{ time: 0, title: 'A=B; #1' }, { time: 30, title: 'End' }, { time: 200, title: 'Past' }], 100, 'My video');
    expect(text).toContain(';FFMETADATA1\ntitle=My video');
    expect(text).toContain('START=0\nEND=30000\ntitle=A\\=B\\; \\#1');
    expect(text).toContain('START=30000\nEND=100000');
    expect(text).not.toContain('Past');
  });
});

describe('beats', () => {
  const beats = Array.from({ length: 16 }, (_, i) => 1 + i * 0.5);

  it('puts every cut on a beat, a number of beats apart, extending the grid past the last beat', () => {
    expect(beatCutTimes(beats, 3, 2, 0)).toEqual([1, 2, 3, 4]);
    expect(beatCutTimes(beats, 2, 4, 2.4)).toEqual([2.5, 4.5, 6.5]);
    const past = beatCutTimes(beats, 3, 8, 0);
    expect(past).toEqual([1, 5, 9, 13]);
    expect(beatCutTimes(beats.slice(0, 1), 3, 2)).toEqual([]);
  });

  it('finds the beat that starts a bar from the strongest phase', () => {
    const strength = beats.map((_, i) => (i % 4 === 2 ? 1 : 0.2));
    expect(downbeats(beats, strength)).toEqual([beats[2], beats[6], beats[10], beats[14]]);
    expect(downbeats(beats.slice(0, 5), strength.slice(0, 5))).toEqual([]);
    expect(downbeats(beats, strength.slice(0, 3))).toEqual([]);
  });
});

describe('pauses and snapping', () => {
  const words = [
    { text: 'one', start: 0, end: 0.5 },
    { text: 'two', start: 0.6, end: 1.0 },
    { text: 'three', start: 2.2, end: 2.8 },
    { text: 'four', start: 4.0, end: 4.4 },
  ];
  it('finds pauses and pads the cuts', async () => {
    const { findPauses } = await import('../transcript-tools');
    const r = findPauses(words, { minGap: 0.6, pad: 0.15 });
    expect(r.pauses).toEqual([{ start: 1, end: 2.2, gap: 1.2 }, { start: 2.8, end: 4, gap: 1.2 }]);
    expect(r.ranges).toEqual([{ start: 1.15, end: 2.05 }, { start: 2.95, end: 3.85 }]);
    expect(findPauses(words, { minGap: 2 }).pauses).toEqual([]);
  });
  it('snaps edges onto words only when close', async () => {
    const { snapToWords } = await import('../transcript-tools');
    expect(snapToWords([{ start: 1.08, end: 2.1 }], words)).toEqual([{ start: 1, end: 2.2 }]);
    expect(snapToWords([{ start: 1.4, end: 1.9 }], words)).toEqual([{ start: 1.4, end: 1.9 }]);
  });
});
