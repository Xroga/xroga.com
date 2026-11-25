// Text recognition on the device: a picture goes to the offscreen document, where the vendored Tesseract engine reads it (public/ocr, Apache-2.0). Nothing leaves the browser.
import { ensureOffscreen, offscreenBusy } from './downloads';
import type { OcrResult } from '@src/agent/ocr-format';

export async function recognizeImage(base64: string, mimeType: string): Promise<OcrResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ocr', base64, mimeType })) as ({ ok: true } & OcrResult) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the text recognition engine did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { text: answer.text, lines: answer.lines };
  } finally {
    offscreenBusy(-1);
  }
}
