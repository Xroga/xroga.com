import { z } from 'zod';
import { MAX_PROGRAM_CHARS, NATIVE_UI_FORMAT, validateNativeOpenUi } from './nativeOpenUi.js';

export const NATIVE_SHARE_PREFIX = 'XROGA_OPENUI_SHARE_V1\n';
const shareLimit = 100_000;
const snapshot = z.object({
  format: z.literal(NATIVE_UI_FORMAT),
  text: z.string().min(1).max(60_000),
  program: z.string().max(MAX_PROGRAM_CHARS),
  sources: z.array(z.object({ title: z.string().min(1).max(400), url: z.string().url().max(2048) }).strict()).max(30),
}).strict();

export function readNativeOpenUiShare(value: string) {
  if (!value.startsWith(NATIVE_SHARE_PREFIX) || value.length > shareLimit) return;
  try {
    const parsed = snapshot.safeParse(JSON.parse(value.slice(NATIVE_SHARE_PREFIX.length)));
    if (!parsed.success) return;
    const { sources, program } = parsed.data;
    if (sources.some(({ url }) => {
      const parsedUrl = new URL(url);
      return !['https:', 'http:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password;
    })) return;
    const ids = new Set(sources.map((_, index) => 'source-' + (index + 1)));
    if (program ? validateNativeOpenUi(program, ids).ok : sources.length > 0) return parsed.data;
  } catch {
    // An invalid share is never executable UI.
  }
}

export function buildNativeOpenUiShare(text: string, program: string, sources: Array<{ title: string; url: string }> = []) {
  const value = NATIVE_SHARE_PREFIX + JSON.stringify({
    format: NATIVE_UI_FORMAT, text, program, sources: sources.map(({ title, url }) => ({ title, url })),
  });
  return readNativeOpenUiShare(value) ? value : undefined;
}
