// `record_screen`: a video of the tab the agent works in, with the places it clicked, so a polished demo can be made from it (compose_video with zoomOnClicks). The frames come from Chrome's own
// screencast of the tab, are turned into an MP4 on the device, and are saved only when the person agrees. The idea (a browser-native demo studio that centres zooms on the recorded
// clicks) comes from reading Panoptik (AGPL: concepts only, no code taken); written fresh.
import type { AgentTool } from './tools';

export const RECORD_SCREEN_TOOL: AgentTool = {
  name: 'record_screen',
  source: 'agent',
  group: 'files',
  description:
    'Record the tab you work in as a video. action start begins (up to maxSeconds, default 90, at most 180); do the steps; action stop ends it, makes the MP4 and asks to save it in Downloads (in Ask mode), then lists your clicks as fractions of the picture, ready for compose_video: { type: video, url: "recording:last", zoomOnClicks: { clicks } } zooms in on each click. The recording stays available to compose_video and media as recording:last until the next recording. status says whether one is running. Only when the person asked for a recording or a demo video.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'stop', 'status'] },
      maxSeconds: { type: 'number' },
      filename: { type: 'string', maxLength: 110 },
      tabId: { type: 'number' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

export interface RecordedClick {
  t: number;
  x: number;
  y: number;
}

/** Clicks in viewport pixels as fractions of the picture, rounded, and only those inside it. */
export function clicksToFractions(clicks: readonly RecordedClick[], size: { width: number; height: number }): RecordedClick[] {
  if (!size.width || !size.height) return [];
  return clicks
    .filter(c => c.x >= 0 && c.y >= 0 && c.x <= size.width && c.y <= size.height)
    .map(c => ({ t: Math.round(c.t * 100) / 100, x: Math.round((c.x / size.width) * 1000) / 1000, y: Math.round((c.y / size.height) * 1000) / 1000 }));
}

export function recordFilename(asked: unknown, now = new Date()): string {
  const s = typeof asked === 'string' ? asked.trim() : '';
  if (s && /^[^/\\:*?"<>|]{1,100}\.(mp4|webm)$/i.test(s) && !s.startsWith('.')) return s;
  const two = (n: number) => String(n).padStart(2, '0');
  return `xroga-recording-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.mp4`;
}

export function describeRecording(r: { seconds: number; frames: number; bytes: number; width: number; height: number; container: string; clicks: RecordedClick[]; notes: string[] }): string {
  const clicks = r.clicks.length ? `Your clicks, as fractions of the ${r.width}×${r.height} picture (t in seconds): ${JSON.stringify(r.clicks.slice(0, 60))}. For a demo: compose_video with a video layer { url: "recording:last", zoomOnClicks: { clicks: <these> } }.` : 'No clicks were made while recording.';
  return `Recorded ${r.seconds.toFixed(1)} s (${r.frames} frames, ${(r.bytes / 1048576).toFixed(1)} MB ${r.container.toUpperCase()}). ${clicks}${r.notes.length ? ` Note: ${r.notes.join('; ')}.` : ''}`;
}

/** The address a recording has for compose_video, media and convert_media while it is kept. */
export const LAST_RECORDING = 'recording:last';
