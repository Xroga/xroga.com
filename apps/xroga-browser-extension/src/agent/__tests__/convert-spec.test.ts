import { describe, expect, it } from 'vitest';
import { CONVERT_TOOL, convertFilename, convertMime, describeConvert, normalizeConvert } from '../convert-spec';

const ok = (args: Record<string, unknown>) => {
  const n = normalizeConvert(args);
  if (!n.ok) throw new Error(n.errors.join(' | '));
  return n.request;
};

describe('convert_media requests', () => {
  it('keeps what is asked for and fills in the rest', () => {
    const r = ok({ url: 'https://x.test/a.mov', format: 'mp4', trim: { start: 2, end: 8 }, width: 641, fit: 'cover', rotate: 90, fps: 24, videoCodec: 'avc', quality: 'high', audioCodec: 'aac', channels: 1, sampleRate: 44100, tags: { title: ' Demo ', artist: 'Ada', bogus: 'x' } });
    expect(r).toMatchObject({ format: 'mp4', trim: { start: 2, end: 8 }, filename: 'xroga-converted.mp4' });
    expect(r.video).toMatchObject({ width: 642, fit: 'cover', rotate: 90, frameRate: 24, codec: 'avc', quality: 'high', discard: false });
    expect(r.audio).toMatchObject({ codec: 'aac', numberOfChannels: 1, sampleRate: 44100, discard: false });
    expect(r.tags).toEqual({ title: 'Demo', artist: 'Ada' });
  });

  it('drops the picture for sound-only formats, and for noVideo', () => {
    expect(ok({ url: 'https://x.test/a.mp4', format: 'wav' }).video.discard).toBe(true);
    expect(ok({ url: 'https://x.test/a.mp4', format: 'm4a' }).video.discard).toBe(true);
    expect(ok({ url: 'https://x.test/a.mp4', format: 'webm', noVideo: true }).video.discard).toBe(true);
    expect(ok({ url: 'https://x.test/a.mp4', format: 'webm', mute: true }).audio.discard).toBe(true);
  });

  it('refuses what cannot work, and says which part', () => {
    const bad = normalizeConvert({ url: 'file:///c:/a.mp4', format: 'avi', trim: { start: 5, end: 2 }, rotate: 45, videoCodec: 'divx', quality: 'ultra', audioCodec: 'mp3', crop: { left: 1 } });
    expect(bad.ok).toBe(false);
    const text = bad.ok ? '' : bad.errors.join('\n');
    expect(text).toContain('url must be the address');
    expect(text).toContain('format must be one of');
    expect(text).toContain('trim.end must be after trim.start');
    expect(text).toContain('rotate must be 0, 90, 180 or 270');
    expect(text).toContain('videoCodec must be one of');
    expect(text).toContain('quality must be one of');
    expect(text).toContain('audioCodec must be one of');
    expect(text).toContain('crop needs width and height');
    const silent = normalizeConvert({ url: 'https://x.test/a.mp4', format: 'wav', mute: true });
    expect(silent.ok ? '' : silent.errors.join()).toContain('leaves nothing to save');
  });

  it('names the file with the ending of the format', () => {
    expect(convertFilename('clip.mp4', 'webm')).toBe('clip.webm');
    expect(convertFilename('my audio', 'wav')).toBe('my audio.wav');
    expect(convertFilename('../x.mp4', 'mp4')).toBe('xroga-converted.mp4');
    expect(convertFilename(undefined, 'ogg')).toBe('xroga-converted.ogg');
    expect(convertMime('m4a')).toBe('audio/mp4');
    expect(convertMime('mkv')).toBe('video/x-matroska');
  });

  it('describes a request for the person who is asked', () => {
    const text = describeConvert(ok({ url: 'https://media.example.com/v/a.mov', format: 'mp4', trim: { start: 1 }, width: 1280, rotate: 90, quality: 'low', mute: true }));
    expect(text).toBe('from media.example.com: MP4, 1 to the end s, 1280×auto, turned 90°, low quality, no sound');
    expect(describeConvert(ok({ url: 'https://x.test/a.mp4', format: 'wav', channels: 1, sampleRate: 16000 }))).toBe('from x.test: WAV, mono, 16000 Hz');
    expect(CONVERT_TOOL.name).toBe('convert_media');
  });
});
