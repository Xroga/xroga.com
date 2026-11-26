// Reading speech from a sound file on the device: the offscreen document fetches the file, decodes it to 16 kHz mono and runs Whisper. See entrypoints/offscreen/main.ts.
import { ensureOffscreen, offscreenBusy } from './downloads';
import { cleanChunks, type TranscriptResult } from '@src/agent/transcript-format';

export async function transcribeFile(url: string, options: { seconds: number; multilingual?: boolean }): Promise<TranscriptResult> {
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'transcribe', url, seconds: options.seconds, multilingual: options.multilingual === true })) as ({ ok: true } & TranscriptResult) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the speech reader did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { chunks: cleanChunks(answer.chunks as unknown as Parameters<typeof cleanChunks>[0]), readSeconds: answer.readSeconds, totalSeconds: answer.totalSeconds, model: answer.model, bytes: answer.bytes };
  } finally {
    offscreenBusy(-1);
  }
}
