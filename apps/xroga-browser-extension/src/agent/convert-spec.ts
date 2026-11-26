// `convert_media`: a media file at a web address turned into another format or shape on the device (mediabunny's conversion API over WebCodecs) and saved in Downloads: cut to a time
// range, resized or cropped or turned, a different frame rate, a different codec or quality, sound only, no sound, new tags. This file is the part that needs no browser: checking the
// request, naming the file and describing it for the person who is asked. The conversion API (transmuxing, transcoding, trimming, resizing, rotating, cropping, resampling) is what
// mediabunny (MPL-2.0) offers; the request format and its checks are written here.
import type { AgentTool } from './tools';

export const CONVERT_FORMATS = ['mp4', 'mov', 'webm', 'mkv', 'ogg', 'wav', 'm4a', 'aac'] as const;
export type ConvertFormat = (typeof CONVERT_FORMATS)[number];
export const VIDEO_CODECS = ['avc', 'hevc', 'vp9', 'av1', 'vp8'] as const;
export const AUDIO_CODECS = ['aac', 'opus', 'vorbis', 'pcm-s16', 'pcm-f32'] as const;
export const QUALITIES = ['very-low', 'low', 'medium', 'high', 'very-high'] as const;

export const CONVERT_TOOL: AgentTool = {
  name: 'convert_media',
  source: 'agent',
  group: 'files',
  description:
    'Convert an audio or video file at a web address into another format, on this device, and save it in Downloads (asks first in Ask mode, never overwrites). format: mp4, mov, webm, mkv (picture and sound), ogg, wav, m4a, aac (sound only: the picture is dropped). trim: { start, end } seconds to keep. Picture: width and/or height (one gives the other by the aspect), fit: contain|cover|fill, rotate: 90|180|270, flip, crop: { left, top, width, height }, fps, videoCodec: avc|hevc|vp9|av1|vp8, quality: very-low|low|medium|high|very-high. Sound: audioCodec: aac|opus|vorbis|pcm-s16|pcm-f32, channels, sampleRate, mute (no sound), noVideo. tags: { title, artist, album, genre, comment, date } written into the file. What the browser cannot encode is dropped or refused and said so. Only when the person asked for a converted file.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      format: { type: 'string', enum: [...CONVERT_FORMATS] },
      trim: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } }, additionalProperties: false },
      width: { type: 'number' },
      height: { type: 'number' },
      fit: { type: 'string', enum: ['contain', 'cover', 'fill'] },
      rotate: { type: 'number', enum: [0, 90, 180, 270] },
      flip: { type: 'boolean' },
      crop: { type: 'object', properties: { left: { type: 'number' }, top: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, additionalProperties: false },
      fps: { type: 'number' },
      videoCodec: { type: 'string', enum: [...VIDEO_CODECS] },
      quality: { type: 'string', enum: [...QUALITIES] },
      audioCodec: { type: 'string', enum: [...AUDIO_CODECS] },
      channels: { type: 'number' },
      sampleRate: { type: 'number' },
      mute: { type: 'boolean' },
      noVideo: { type: 'boolean' },
      tags: { type: 'object' },
      filename: { type: 'string', maxLength: 110 },
    },
    required: ['url', 'format'],
    additionalProperties: false,
  },
};

export interface ConvertRequest {
  url: string;
  format: ConvertFormat;
  trim?: { start?: number; end?: number };
  video: { width?: number; height?: number; fit?: 'contain' | 'cover' | 'fill'; rotate?: 0 | 90 | 180 | 270; flip?: boolean; crop?: { left: number; top: number; width: number; height: number }; frameRate?: number; codec?: string; quality?: string; discard: boolean };
  audio: { codec?: string; numberOfChannels?: number; sampleRate?: number; discard: boolean };
  tags: Record<string, string>;
  filename: string;
}

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const SOUND_ONLY: readonly string[] = ['ogg', 'wav', 'm4a', 'aac'];
export const TAG_KEYS = ['title', 'artist', 'album', 'albumArtist', 'genre', 'comment', 'description'] as const;

export type Checked = { ok: true; request: ConvertRequest } | { ok: false; errors: string[] };

/** Checks a request and fills in what it leaves out. Every refusal says which part and why. */
export function normalizeConvert(args: Record<string, unknown>): Checked {
  const errors: string[] = [];
  let url = '';
  try {
    const u = new URL(String(args.url ?? ''));
    if (u.protocol === 'https:' || u.protocol === 'http:') url = u.href;
  } catch {
    /* handled below */
  }
  if (!url) errors.push('url must be the address of a media file (https or http).');
  const format = String(args.format ?? '') as ConvertFormat;
  if (!(CONVERT_FORMATS as readonly string[]).includes(format)) errors.push(`format must be one of ${CONVERT_FORMATS.join(', ')}.`);
  const trimIn = (args.trim ?? undefined) as { start?: unknown; end?: unknown } | undefined;
  const trim = trimIn ? { start: num(trimIn.start, 0, 86400), end: num(trimIn.end, 0, 86400) } : undefined;
  if (trim?.start !== undefined && trim.end !== undefined && trim.end <= trim.start) errors.push('trim.end must be after trim.start.');
  const even = (v: number | undefined) => (v === undefined ? undefined : Math.max(16, Math.round(v / 2) * 2));
  const crop = args.crop && typeof args.crop === 'object' ? (args.crop as Record<string, unknown>) : undefined;
  const cropOk = crop && num(crop.width, 1, 16384) !== undefined && num(crop.height, 1, 16384) !== undefined;
  if (crop && !cropOk) errors.push('crop needs width and height.');
  const rotate = args.rotate === undefined ? undefined : ([0, 90, 180, 270] as const).find(r => r === args.rotate);
  if (args.rotate !== undefined && rotate === undefined) errors.push('rotate must be 0, 90, 180 or 270.');
  const videoCodec = args.videoCodec === undefined ? undefined : (VIDEO_CODECS as readonly string[]).includes(String(args.videoCodec)) ? String(args.videoCodec) : null;
  if (videoCodec === null) errors.push(`videoCodec must be one of ${VIDEO_CODECS.join(', ')}.`);
  const audioCodec = args.audioCodec === undefined ? undefined : (AUDIO_CODECS as readonly string[]).includes(String(args.audioCodec)) ? String(args.audioCodec) : null;
  if (audioCodec === null) errors.push(`audioCodec must be one of ${AUDIO_CODECS.join(', ')}.`);
  const quality = args.quality === undefined ? undefined : (QUALITIES as readonly string[]).includes(String(args.quality)) ? String(args.quality) : null;
  if (quality === null) errors.push(`quality must be one of ${QUALITIES.join(', ')}.`);
  if (args.mute === true && (args.noVideo === true || SOUND_ONLY.includes(format))) errors.push('mute together with sound only leaves nothing to save.');
  const tags: Record<string, string> = {};
  const tagsIn = (args.tags && typeof args.tags === 'object' ? args.tags : {}) as Record<string, unknown>;
  for (const k of TAG_KEYS) if (typeof tagsIn[k] === 'string' && (tagsIn[k] as string).trim()) tags[k] = (tagsIn[k] as string).trim().slice(0, 300);
  if (errors.length) return { ok: false, errors };
  const request: ConvertRequest = {
    url,
    format,
    ...(trim && (trim.start !== undefined || trim.end !== undefined) ? { trim } : {}),
    video: {
      ...(even(num(args.width, 16, 8192)) !== undefined ? { width: even(num(args.width, 16, 8192)) } : {}),
      ...(even(num(args.height, 16, 8192)) !== undefined ? { height: even(num(args.height, 16, 8192)) } : {}),
      ...(['contain', 'cover', 'fill'].includes(String(args.fit)) ? { fit: String(args.fit) as 'contain' } : {}),
      ...(rotate !== undefined ? { rotate } : {}),
      ...(args.flip === true ? { flip: true } : {}),
      ...(cropOk ? { crop: { left: Math.max(0, Math.round(num(crop!.left, 0, 16384) ?? 0)), top: Math.max(0, Math.round(num(crop!.top, 0, 16384) ?? 0)), width: Math.round(num(crop!.width, 1, 16384)!), height: Math.round(num(crop!.height, 1, 16384)!) } } : {}),
      ...(num(args.fps, 1, 120) !== undefined ? { frameRate: num(args.fps, 1, 120) } : {}),
      ...(videoCodec ? { codec: videoCodec } : {}),
      ...(quality ? { quality } : {}),
      discard: args.noVideo === true || SOUND_ONLY.includes(format),
    },
    audio: {
      ...(audioCodec ? { codec: audioCodec } : {}),
      ...(num(args.channels, 1, 8) !== undefined ? { numberOfChannels: Math.round(num(args.channels, 1, 8)!) } : {}),
      ...(num(args.sampleRate, 8000, 192000) !== undefined ? { sampleRate: Math.round(num(args.sampleRate, 8000, 192000)!) } : {}),
      discard: args.mute === true,
    },
    tags,
    filename: convertFilename(args.filename, format),
  };
  return { ok: true, request };
}

const EXT: Record<ConvertFormat, string> = { mp4: 'mp4', mov: 'mov', webm: 'webm', mkv: 'mkv', ogg: 'ogg', wav: 'wav', m4a: 'm4a', aac: 'aac' };
export const convertMime = (format: ConvertFormat): string => ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac' })[format];

/** A plain file name with the ending of the format; a name that asks for another ending is given the right one. */
export function convertFilename(asked: unknown, format: ConvertFormat): string {
  const raw = typeof asked === 'string' ? asked.trim() : '';
  const stem = raw.replace(/\.[a-z0-9]{2,4}$/i, '');
  const plain = stem && /^[^/\\:*?"<>|]{1,100}$/.test(stem) && !stem.startsWith('.') ? stem : 'xroga-converted';
  return `${plain}.${EXT[format]}`;
}

export function describeConvert(r: ConvertRequest): string {
  const parts = [r.format.toUpperCase()];
  if (r.trim) parts.push(`${r.trim.start ?? 0} to ${r.trim.end ?? 'the end'} s`);
  if (r.video.discard && !SOUND_ONLY.includes(r.format)) parts.push('no picture');
  const v = r.video;
  if (!v.discard && (v.width || v.height)) parts.push(`${v.width ?? 'auto'}×${v.height ?? 'auto'}`);
  if (v.rotate) parts.push(`turned ${v.rotate}°`);
  if (v.crop) parts.push(`cropped to ${v.crop.width}×${v.crop.height}`);
  if (v.frameRate) parts.push(`${v.frameRate} fps`);
  if (v.codec) parts.push(v.codec);
  if (v.quality) parts.push(`${v.quality} quality`);
  if (r.audio.discard) parts.push('no sound');
  if (r.audio.codec) parts.push(r.audio.codec);
  if (r.audio.numberOfChannels) parts.push(r.audio.numberOfChannels === 1 ? 'mono' : `${r.audio.numberOfChannels} channels`);
  if (r.audio.sampleRate) parts.push(`${r.audio.sampleRate} Hz`);
  if (Object.keys(r.tags).length) parts.push(`tags: ${Object.keys(r.tags).join(', ')}`);
  let host = r.url;
  try {
    host = new URL(r.url).hostname;
  } catch {
    /* keep */
  }
  return `from ${host}: ${parts.join(', ')}`;
}
