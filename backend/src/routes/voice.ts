import express, { Router } from 'express';

const router = Router();

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function languageForTranscription(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value || value === 'auto') return undefined;
  const primary = value.split('-')[0]?.toLowerCase();
  return primary && /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
}

function extensionForMime(mime: string): string {
  if (/mp4|m4a/i.test(mime)) return 'm4a';
  if (/mpeg|mp3/i.test(mime)) return 'mp3';
  if (/wav/i.test(mime)) return 'wav';
  if (/ogg/i.test(mime)) return 'ogg';
  return 'webm';
}

router.post(
  '/transcribe',
  express.raw({
    type: ['audio/*', 'application/octet-stream'],
    limit: MAX_AUDIO_BYTES,
  }),
  async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Server speech transcription is temporarily unavailable.',
        code: 'VOICE_TRANSCRIPTION_UNAVAILABLE',
      });
      return;
    }

    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (audio.length < 512) {
      res.status(400).json({
        error: 'No usable audio was received.',
        code: 'VOICE_AUDIO_EMPTY',
      });
      return;
    }

    const mime = req.header('content-type')?.split(';')[0]?.trim() || 'audio/webm';
    const language = languageForTranscription(req.header('x-xroga-language'));

    try {
      const form = new FormData();
      form.append(
        'file',
        new Blob([audio], { type: mime }),
        `xroga-voice.${extensionForMime(mime)}`,
      );
      form.append(
        'model',
        process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe',
      );
      form.append(
        'prompt',
        'The product name is Xroga, spelled X-r-o-g-a and pronounced "X Roga". ' +
          'If the speaker says X Roga, ex roga, Acroga, or a close speech-recognition variant, ' +
          'transcribe the brand name as Xroga. Preserve the rest of the utterance faithfully.',
      );
      if (language) form.append('language', language);

      const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });

      const body = (await upstream.json().catch(() => null)) as
        | { text?: unknown; error?: { message?: unknown } }
        | null;

      if (!upstream.ok) {
        const message =
          typeof body?.error?.message === 'string'
            ? body.error.message
            : `Speech provider returned ${upstream.status}`;
        console.warn('[voice] transcription failed:', message);
        res.status(502).json({
          error: 'Could not transcribe that audio. Please try again.',
          code: 'VOICE_TRANSCRIPTION_FAILED',
        });
        return;
      }

      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) {
        res.status(422).json({
          error: 'No speech was detected.',
          code: 'VOICE_NO_SPEECH',
        });
        return;
      }

      res.json({
        text,
        provider: 'openai',
        model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe',
      });
    } catch (error) {
      console.error('[voice] transcription exception:', error);
      res.status(502).json({
        error: 'Could not transcribe that audio. Please try again.',
        code: 'VOICE_TRANSCRIPTION_FAILED',
      });
    }
  },
);

export default router;
