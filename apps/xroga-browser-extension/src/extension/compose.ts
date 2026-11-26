// Making a video on the device: the offscreen document renders and encodes it (see src/extension/compose-render.ts) and holds it as a blob URL for the worker to save.
import { ensureOffscreen, offscreenBusy } from './downloads';
import type { ComposeResult, PreviewResult } from './compose-render';

export async function composeOnDevice(spec: unknown): Promise<ComposeResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'compose', spec })) as (({ ok: true } & ComposeResult) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the video maker did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest;
  } finally {
    offscreenBusy(-1);
  }
}

/** A sheet of the video at chosen times, with no file made (for checking a design). */
export async function previewOnDevice(spec: unknown, times: number[]): Promise<PreviewResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'compose-preview', spec, times })) as (({ ok: true } & PreviewResult) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the video maker did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest;
  } finally {
    offscreenBusy(-1);
  }
}
