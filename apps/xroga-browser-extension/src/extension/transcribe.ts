// Reading speech from a sound file on the device: the offscreen document fetches the file, decodes it to 16 kHz mono and runs Whisper. See entrypoints/offscreen/main.ts.
import { ensureOffscreen, offscreenBusy } from './downloads';
import { cleanChunks, type TranscriptResult } from '@src/agent/transcript-format';

export async function transcribeFile(url: string, options: { seconds: number; from?: number; words?: boolean; multilingual?: boolean }): Promise<TranscriptResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'transcribe', url, seconds: options.seconds, from: options.from ?? 0, words: options.words === true, multilingual: options.multilingual === true })) as ({ ok: true } & TranscriptResult & { words?: Array<{ text: string; start: number; end: number }>; wordsSpread?: boolean }) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the speech reader did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { chunks: cleanChunks(answer.chunks as unknown as Parameters<typeof cleanChunks>[0]), readSeconds: answer.readSeconds, totalSeconds: answer.totalSeconds, from: options.from ?? 0, model: answer.model, bytes: answer.bytes, ...(answer.words ? { words: answer.words, wordsSpread: answer.wordsSpread === true } : {}) };
  } finally {
    offscreenBusy(-1);
  }
}
