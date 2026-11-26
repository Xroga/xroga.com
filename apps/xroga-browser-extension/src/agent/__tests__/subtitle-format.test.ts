import { describe, expect, it } from 'vitest';
import { CAPTION_STYLES, cuesToFile, cuesToWords, formatTimestamp, parseSubtitles, parseTimestamp, plainCueText, toSrt, toVtt } from '../subtitle-format';
import { wordsToCues } from '../transcript-tools';
import { normalizeSpec } from '../compose-spec';

describe('timestamps', () => {
  it('reads SRT, VTT and plain seconds, and refuses nonsense', () => {
    expect(parseTimestamp('00:01:02,500')).toBe(62.5);
    expect(parseTimestamp('01:02.250')).toBe(62.25);
    expect(parseTimestamp('1:00:00.000')).toBe(3600);
    expect(parseTimestamp('12.5')).toBe(12.5);
    expect(parseTimestamp('soon')).toBeNull();
    expect(formatTimestamp(3725.042)).toBe('01:02:05,042');
    expect(formatTimestamp(3725.042, true)).toBe('01:02:05.042');
    expect(formatTimestamp(-4)).toBe('00:00:00,000');
  });
});

describe('reading subtitles', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,000\r\nHello <i>there</i>\r\nfriend\r\n\r\n2\r\n00:00:04,000 --> 00:00:03,000\r\nbackwards\r\n\r\n3\r\n00:00:05,000 --> 00:00:07,500\r\n{\\an8}Top line &amp; more\r\n';
  const vtt = 'WEBVTT\n\nNOTE a note\n\nSTYLE\n::cue { color: red }\n\nintro\n00:01.000 --> 00:02.500 align:start position:10%\n<v Ann>Good morning</v>\n\n01:00.000 --> 01:02.000\nOne minute in\n';
  it('reads an SRT file and skips a cue that ends before it starts', () => {
    const cues = parseSubtitles(srt);
    expect(cues).toEqual([{ start: 1, end: 3, text: 'Hello there friend' }, { start: 5, end: 7.5, text: 'Top line & more' }]);
  });
  it('reads a WebVTT file with settings, names, notes and styles', () => {
    expect(parseSubtitles(vtt)).toEqual([{ start: 1, end: 2.5, text: 'Good morning' }, { start: 60, end: 62, text: 'One minute in' }]);
  });
  it('strips markup and gives nothing for nothing', () => {
    expect(plainCueText('<b>a</b>\n b')).toBe('a b');
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('just some text')).toEqual([]);
  });
});

describe('writing subtitles', () => {
  const cues = [{ start: 1, end: 2.5, text: 'One' }, { start: 3, end: 4, text: 'Two' }];
  it('writes SRT and VTT that read back the same', () => {
    expect(toSrt(cues)).toBe('1\n00:00:01,000 --> 00:00:02,500\nOne\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n');
    expect(toVtt(cues).startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nOne')).toBe(true);
    expect(parseSubtitles(toSrt(cues))).toEqual(cues);
    expect(parseSubtitles(toVtt(cues))).toEqual(cues);
  });
  it('writes heard words as a subtitle file', () => {
    const words = [{ text: 'hello', start: 0, end: 0.4 }, { text: 'world.', start: 0.5, end: 1 }, { text: 'again', start: 4, end: 4.5 }];
    const srt = cuesToFile(wordsToCues(words), 'srt');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,000\nhello world.');
    expect(srt).toContain('again');
  });
});

describe('cues as timed words', () => {
  it('shares a cue between its words by their length, inside the cue', () => {
    const w = cuesToWords([{ start: 10, end: 14, text: 'a longer word' }]);
    expect(w.map(x => x.text)).toEqual(['a', 'longer', 'word']);
    expect(w[0]!.start).toBe(10);
    expect(w[2]!.end).toBeCloseTo(14, 2);
    expect(w[1]!.end - w[1]!.start).toBeGreaterThan(w[0]!.end - w[0]!.start);
    for (let i = 1; i < w.length; i++) expect(w[i]!.start).toBeCloseTo(w[i - 1]!.end, 2);
  });
});

describe('captions in a spec', () => {
  it('takes a look by name, lets what is named beside it win, and keeps a subtitle address', () => {
    const r = normalizeSpec({ clips: [{ duration: 5, layers: [{ type: 'captions', style: 'bold', fontSize: 0.1, subtitles: 'https://example.com/a.srt' }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.spec.clips[0]!.layers[0] as { color: string; fontSize: number; subtitles?: string; highlightColor?: string };
    expect(c.color).toBe(CAPTION_STYLES.bold!.color);
    expect(c.fontSize).toBe(0.1);
    expect(c.subtitles).toBe('https://example.com/a.srt');
    expect(c.highlightColor).toBe('#ffffff');
    const none = normalizeSpec({ clips: [{ duration: 5, layers: [{ type: 'captions', subtitles: 'http://insecure.example/a.srt', words: [{ text: 'x', start: 0, end: 1 }] }] }] });
    expect(none.ok).toBe(true);
    if (none.ok) expect((none.spec.clips[0]!.layers[0] as { subtitles?: string }).subtitles).toBeUndefined();
  });
});
