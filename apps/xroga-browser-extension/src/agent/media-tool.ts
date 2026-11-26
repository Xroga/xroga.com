// `media`: ears and eyes for an audio or video file at a web address, on the device (mediabunny decodes it in the offscreen document). info says what the file is (container,
// tracks, codecs, size, length, tags); audio gives loudness, peak, a level line and the silences; beats the tempo and beat times; scenes the picture cuts; frames one contact sheet of
// pictures at chosen times. The kinds of perception come from reading cutline (MIT: silence, loudness, beats, scenes and frames as tools for an editing agent); written fresh.
import type { AgentTool } from './tools';
import { clock } from './media-analysis';

export const MEDIA_TOOL: AgentTool = {
  name: 'media',
  source: 'agent',
  group: 'reading',
  description:
    'Look at and listen to an audio or video file at a web address, on this device. action info: container, length, tracks, codecs, tags. audio: loudness, peak, level over time and the silences (thresholdDb, minSeconds). beats: tempo, beat times and the beats that start bars. cover: the picture embedded in the file (album or poster). beatcuts: cut times that fall on the beat, clips of them (default 8), each everyNBeats beats long (default 4). scenes: the cuts of the picture. frames: one sheet of pictures at times (list) or count of them spread over the file, width px each. seconds limits how much is read (default 300, at most 600) and from says where to start, so a long file is read in parts (from 600, from 1200, …). For the words spoken, use transcribe.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      action: { type: 'string', enum: ['info', 'audio', 'beats', 'beatcuts', 'scenes', 'frames', 'cover'] },
      seconds: { type: 'number' },
      from: { type: 'number' },
      thresholdDb: { type: 'number' },
      minSeconds: { type: 'number' },
      count: { type: 'number' },
      clips: { type: 'number' },
      everyNBeats: { type: 'number' },
      times: { type: 'array', items: { type: 'number' }, maxItems: 24 },
      width: { type: 'number' },
    },
    required: ['url', 'action'],
    additionalProperties: false,
  },
};

export interface MediaTrackInfo {
  type: string;
  codec: string | null;
  language?: string;
  width?: number;
  height?: number;
  rotation?: number;
  channels?: number;
  sampleRate?: number;
  fps?: number;
  bitrate?: number;
}
export interface MediaInfo {
  format: string;
  mime: string;
  duration: number;
  tags: Record<string, string>;
  tracks: MediaTrackInfo[];
  bytes?: number;
  /** A stream with no end (a live HLS playlist). */
  live?: boolean;
  /** The file carries a cover picture (ask for it with action cover). */
  cover?: boolean;
}

export function describeInfo(i: MediaInfo): string {
  const out = [`${i.format} ${/hls/i.test(i.format) ? 'stream' : 'file'} (${i.mime}), ${i.live ? 'live (no end)' : `${clock(i.duration)} long`}${i.bytes ? `, ${(i.bytes / 1048576).toFixed(1)} MB` : ''}, ${i.tracks.length} track${i.tracks.length === 1 ? '' : 's'}.`];
  for (const [n, t] of i.tracks.entries()) {
    if (t.type === 'video') out.push(`- track ${n + 1} picture: ${t.codec ?? 'unknown codec'}, ${t.width}×${t.height}${t.rotation ? `, turned ${t.rotation}°` : ''}${t.fps ? `, about ${t.fps} frames per second` : ''}${t.bitrate ? `, about ${Math.round(t.bitrate / 1000)} kbit/s` : ''}`);
    else if (t.type === 'audio') out.push(`- track ${n + 1} sound: ${t.codec ?? 'unknown codec'}, ${t.channels === 1 ? 'mono' : t.channels === 2 ? 'stereo' : `${t.channels} channels`}, ${t.sampleRate} Hz${t.bitrate ? `, about ${Math.round(t.bitrate / 1000)} kbit/s` : ''}${t.language && t.language !== 'und' ? `, language ${t.language}` : ''}`);
    else out.push(`- track ${n + 1} ${t.type}: ${t.codec ?? 'unknown codec'}`);
  }
  if (i.cover) out.push('Has a cover picture: media action cover shows it.');
  const tags = Object.entries(i.tags);
  if (tags.length) out.push(`Tags: ${tags.map(([k, v]) => `${k} "${v}"`).join(', ')}`);
  return out.join('\n');
}
