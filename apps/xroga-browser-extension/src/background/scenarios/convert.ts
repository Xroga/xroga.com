// convert_media and HLS reading on real files: the Sintel trailer cut and shrunk to WebM, its sound alone as 16 kHz mono WAV, a song as Ogg, and an Apple HLS test stream (a playlist of
// segments) read and cut to MP4. Each result is read back with the media tool.
import { convertOnDevice } from '../../extension/compose';
import { normalizeConvert } from '../../agent/convert-spec';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const HLS = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8';

const request = (args: Record<string, unknown>) => {
  const n = normalizeConvert(args);
  if (!n.ok) throw new Error(n.errors.join(' | '));
  return n.request;
};

defineScenario({
  id: 'S5-convert',
  set: 'C',
  title: 'real files converted: cut and resized WebM, sound-only WAV, Ogg from a song, MP4 from an HLS stream',
  covers: 'convert_media: trim, resize, drop the picture, resample and downmix, change container and codec; HLS playlists read as one file',
  async run() {
    const web = await convertOnDevice(request({ url: TRAILER, format: 'webm', trim: { start: 5, end: 10 }, width: 320 }));
    const webInfo = await readMedia({ url: web.url, action: 'info' });
    const wav = await convertOnDevice(request({ url: TRAILER, format: 'wav', trim: { start: 0, end: 8 }, channels: 1, sampleRate: 16000 }));
    const wavInfo = await readMedia({ url: wav.url, action: 'info' });
    const ogg = await convertOnDevice(request({ url: SONG, format: 'ogg', trim: { start: 0, end: 6 } }));
    const oggInfo = await readMedia({ url: ogg.url, action: 'info' });
    const hlsInfo = await readMedia({ url: HLS, action: 'info' });
    const hlsMp4 = await convertOnDevice(request({ url: HLS, format: 'mp4', trim: { start: 0, end: 4 }, width: 320 }));
    const hlsOut = await readMedia({ url: hlsMp4.url, action: 'info' });
    const checks: Record<string, boolean> = {
      webm: web.bytes > 10_000 && webInfo.kind === 'info' && /webm|matroska/i.test(webInfo.format) && webInfo.tracks.some(t => t.type === 'video' && t.width === 320) && Math.abs(webInfo.duration - 5) < 0.8,
      wavMono16k: wavInfo.kind === 'info' && /wav/i.test(wavInfo.format) && wavInfo.tracks.length === 1 && wavInfo.tracks[0]!.channels === 1 && wavInfo.tracks[0]!.sampleRate === 16000 && Math.abs(wavInfo.duration - 8) < 0.5,
      ogg: oggInfo.kind === 'info' && /ogg/i.test(oggInfo.format) && oggInfo.tracks.every(t => t.type === 'audio') && Math.abs(oggInfo.duration - 6) < 0.8,
      hlsRead: hlsInfo.kind === 'info' && /hls/i.test(hlsInfo.format) && hlsInfo.tracks.some(t => t.type === 'video') && hlsInfo.tracks.some(t => t.type === 'audio'),
      hlsToMp4: hlsOut.kind === 'info' && /mp4|mov/i.test(hlsOut.format) && hlsOut.tracks.some(t => t.type === 'video' && t.width === 320) && hlsOut.duration > 2 && hlsOut.duration < 6,
    };
    return outcome(
      'real files convert to the asked formats and read back with the right shape',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), web: [web.bytes, web.ms], wav: [wav.bytes], ogg: [ogg.bytes], hls: hlsInfo.kind === 'info' ? { format: hlsInfo.format, live: hlsInfo.live, tracks: hlsInfo.tracks.map(t => [t.type, t.codec, t.width, t.height, t.bitrate]) } : null, hlsMp4: [hlsMp4.bytes, hlsMp4.notes], webInfo: webInfo.kind === 'info' ? { format: webInfo.format, duration: webInfo.duration, tracks: webInfo.tracks } : null }),
      Object.values(checks).every(Boolean),
    );
  },
});
