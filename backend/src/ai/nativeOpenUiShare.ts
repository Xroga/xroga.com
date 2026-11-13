import { z } from 'zod';
import { MAX_PROGRAM_CHARS, NATIVE_UI_FORMAT, splitNativeOpenUiAnswer, validateNativeOpenUi } from './nativeOpenUi.js';

export const NATIVE_SHARE_PREFIX = 'XROGA_OPENUI_SHARE_V1\n';
const shareLimit = 100_000;
const shareSource = z.object({
  title: z.string().min(1).max(400),
  url: z.string().url().max(2048),
  siteName: z.string().trim().min(1).max(160).optional(),
  publishedAt: z.string().min(1).max(64).optional(),
}).strict();
const snapshot = z.object({
  format: z.literal(NATIVE_UI_FORMAT),
  text: z.string().min(1).max(60_000),
  program: z.string().max(MAX_PROGRAM_CHARS),
  sources: z.array(shareSource).max(30),
}).strict();

function decodeNativeOpenUiShare(value: string) {
  if (!value.startsWith(NATIVE_SHARE_PREFIX) || value.length > shareLimit) return;
  try {
    return JSON.parse(value.slice(NATIVE_SHARE_PREFIX.length)) as unknown;
  } catch { /* The share envelope is not readable prose. */ }
}

export function readNativeOpenUiShareText(value: string) {
  const decoded = decodeNativeOpenUiShare(value);
  if (!decoded || typeof decoded !== 'object' || !('format' in decoded) || decoded.format !== NATIVE_UI_FORMAT ||
      !('text' in decoded) || typeof decoded.text !== 'string' || decoded.text.length > 60_000) return;
  return splitNativeOpenUiAnswer(decoded.text).text || undefined;
}

export function readNativeOpenUiShare(value: string) {
  try {
    const parsed = snapshot.safeParse(decodeNativeOpenUiShare(value));
    if (!parsed.success) return;
    const { sources, program } = parsed.data;
    const { text } = splitNativeOpenUiAnswer(parsed.data.text);
    if (!text) return;
    if (sources.some(({ url }) => {
      const parsedUrl = new URL(url);
      return !['https:', 'http:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password;
    })) return;
    const ids = new Set(sources.map((_, index) => 'source-' + (index + 1)));
    if (program ? validateNativeOpenUi(program, ids, text).ok : sources.length > 0) return { ...parsed.data, text };
  } catch {
    // An invalid share is never executable UI.
  }
}

export function buildNativeOpenUiShare(text: string, program: string, sources: Array<z.input<typeof shareSource>> = []) {
  const value = NATIVE_SHARE_PREFIX + JSON.stringify({
    format: NATIVE_UI_FORMAT, text: splitNativeOpenUiAnswer(text).text, program, sources: sources.map(({ title, url, siteName, publishedAt }) => ({
      title, url,
      siteName: siteName?.trim().slice(0, 160) || undefined,
      publishedAt: publishedAt && Number.isFinite(Date.parse(publishedAt))
        ? new Date(publishedAt).toISOString().slice(0, 10) : undefined,
    })),
  });
  return readNativeOpenUiShare(value) ? value : undefined;
}
