import express, { Router } from 'express';

const router = Router();

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

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

    try {
      const configuredModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim();
      const models = Array.from(
        new Set(
          [
            configuredModel || 'gpt-4o-mini-transcribe',
            'gpt-4o-transcribe',
            'whisper-1',
          ].filter(Boolean),
        ),
      );

      let lastProviderError = '';
      for (const model of models) {
        const form = new FormData();
        form.append(
          'file',
          new Blob([new Uint8Array(audio)], { type: mime }),
          `xroga-voice.${extensionForMime(mime)}`,
        );
        form.append('model', model);
        form.append(
          'prompt',
          'Transcribe the speaker faithfully in the language they actually use. ' +
            'Do not translate, summarize, answer, or rewrite. Preserve punctuation, numbers, ' +
            'names, commands, product names, and technical terms. The product name is Xroga, ' +
            'spelled X-r-o-g-a and commonly pronounced "X Roga". If the speaker says X Roga, ' +
            'ex roga, Acroga, or a close recognition variant, write the brand as Xroga.',
        );

        const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        });

        const body = (await upstream.json().catch(() => null)) as
          | { text?: unknown; error?: { message?: unknown }; language?: unknown }
          | null;

        if (!upstream.ok) {
          lastProviderError =
            typeof body?.error?.message === 'string'
              ? body.error.message
              : `Speech provider returned ${upstream.status}`;
          console.warn(`[voice] transcription failed on ${model}:`, lastProviderError);
          continue;
        }

        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        if (!text) {
          lastProviderError = 'No speech was detected.';
          continue;
        }

        res.json({
          text,
          provider: 'openai',
          model,
          language:
            typeof body?.language === 'string' && body.language.trim()
              ? body.language.trim()
              : 'auto',
        });
        return;
      }

      console.warn('[voice] all transcription models failed:', lastProviderError);
      res.status(502).json({
        error: 'Could not transcribe that audio. Please try again.',
        code: 'VOICE_TRANSCRIPTION_FAILED',
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
