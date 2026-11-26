// Reading a PDF on the device: the offscreen document fetches it, pdf.js gives the text, text recognition reads pages that are only pictures. See entrypoints/offscreen/main.ts.
import { ensureOffscreen, offscreenBusy } from './downloads';
import type { PdfResult } from '@src/agent/pdf-format';

export async function readPdfFile(url: string, options: { pages?: string; picture?: boolean; lang?: string } = {}): Promise<PdfResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'pdf', url, pages: options.pages, picture: options.picture === true, lang: options.lang ?? 'eng' })) as ({ ok: true } & PdfResult) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the PDF reader did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { pageCount: answer.pageCount, title: answer.title, pages: answer.pages };
  } finally {
    offscreenBusy(-1);
  }
}
