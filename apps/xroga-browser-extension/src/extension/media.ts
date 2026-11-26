// Reading sound and picture of a media file on the device: the offscreen document opens it and does the work (see entrypoints/offscreen/main.ts).
import { ensureOffscreen, offscreenBusy } from './downloads';
import type { MediaInfo } from '@src/agent/media-tool';
import type { AudioReport, Beats } from '@src/agent/media-analysis';

export type MediaAnswer =
  | ({ kind: 'info' } & MediaInfo)
  | { kind: 'audio'; from: number; report: AudioReport }
  | { kind: 'beats'; from: number; seconds: number; beats: Beats }
  | { kind: 'scenes'; from: number; seconds: number; sampled: number; cuts: number[] }
  | { kind: 'frames'; base64: string; width: number; height: number; times: number[]; decoded: number };

export interface MediaRequest {
  url: string;
  action: 'info' | 'audio' | 'beats' | 'scenes' | 'frames';
  seconds?: number;
  from?: number;
  count?: number;
  times?: number[];
  width?: number;
  thresholdDb?: number;
  minSeconds?: number;
}

export async function readMedia(request: MediaRequest): Promise<MediaAnswer> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'media', ...request })) as (({ ok: true } & MediaAnswer) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the media reader did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest as MediaAnswer;
  } finally {
    offscreenBusy(-1);
  }
}
