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
export async function previewOnDevice(spec: unknown, times: number[], grid = false): Promise<PreviewResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'compose-preview', spec, times, grid })) as (({ ok: true } & PreviewResult) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the video maker did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest;
  } finally {
    offscreenBusy(-1);
  }
}

/** Converts a media file on the device; the result is held as a blob URL for the worker to save. */
export async function convertOnDevice(request: unknown): Promise<import('./convert-render').ConvertResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'convert', request })) as (({ ok: true } & import('./convert-render').ConvertResult) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the converter did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest;
  } finally {
    offscreenBusy(-1);
  }
}

/** Changes a picture on the device; the result is held as a blob URL for the worker to save. */
export async function convertImageOnDevice(request: unknown): Promise<import('./image-render').ImageResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'convert-image', request })) as (({ ok: true } & import('./image-render').ImageResult) | { ok: false; error: string }) | undefined;
    if (!answer) throw new Error('the picture maker did not answer');
    if (!answer.ok) throw new Error(answer.error);
    const { ok: _ok, ...rest } = answer;
    return rest;
  } finally {
    offscreenBusy(-1);
  }
}
