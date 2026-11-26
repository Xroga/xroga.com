// Text recognition on the device: a picture goes to the offscreen document, where the vendored Tesseract engine reads it (public/ocr, Apache-2.0). Nothing leaves the browser.
import { ensureOffscreen, offscreenBusy } from './downloads';
import type { OcrResult } from '@src/agent/ocr-format';

/** Reads a picture. A read that finds no line at all is tried once more: a worker that has only just started, or one the machine is too busy to serve in time, can come back empty once. */
export async function recognizeImage(base64: string, mimeType: string, lang = 'eng'): Promise<OcrResult> {
  const first = await recognizeOnce(base64, mimeType, lang);
  if (first.lines.length) return first;
  await new Promise(resolve => setTimeout(resolve, 400));
  return recognizeOnce(base64, mimeType, lang);
}

async function recognizeOnce(base64: string, mimeType: string, lang: string): Promise<OcrResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ocr', base64, mimeType, lang })) as ({ ok: true } & OcrResult) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the text recognition engine did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { text: answer.text, lines: answer.lines };
  } finally {
    offscreenBusy(-1);
  }
}
