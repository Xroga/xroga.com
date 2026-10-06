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
      const configuredModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim();
      const models = Array.from(
        new Set(
          [
            configuredModel || 'gpt-transcribe',
            'gpt-4o-transcribe',
            'gpt-4o-mini-transcribe',
          ].filter(Boolean),
        ),
      );

      let lastProviderError = '';
      for (const model of models) {
        const form = new FormData();
        form.append(
          'file',
          new Blob([audio], { type: mime }),
          `xroga-voice.${extensionForMime(mime)}`,
        );
        form.append('model', model);
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append('chunking_strategy', 'auto');

        const transcriptionPrompt =
          'Product name: Xroga, pronounced "X Roga". Preserve the speaker\'s original language, ' +
          'code-switching, punctuation, names, numbers, commands, and technical terms faithfully. ' +
          'Do not translate. If speech sounds like Acroga, X Roga, ex roga, or zroga and it refers ' +
          'to the product wake word, transcribe it as Xroga.';

        if (model === 'gpt-transcribe') {
          form.append('keywords[]', 'Xroga');
          form.append('keywords[]', 'X Roga');
          form.append('prompt', transcriptionPrompt);
          if (language) form.append('languages[]', language);
        } else {
          form.append('prompt', transcriptionPrompt);
          if (language) form.append('language', language);
        }

        const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        });

        const body = (await upstream.json().catch(() => null)) as
          | {
              text?: unknown;
              languages?: Array<{ code?: unknown }>;
              error?: { message?: unknown };
            }
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
          languages: Array.isArray(body?.languages)
            ? body.languages
                .map((entry) => (typeof entry?.code === 'string' ? entry.code : ''))
                .filter(Boolean)
            : [],
        });
        return;
      }

      console.warn('[voice] all transcription models failed:', lastProviderError);
      res.status(502).json({
        error: 'Could not transcribe that audio. Please try again.',
        code: 'VOICE_TRANSCRIPTION_FAILED',
      });
      return;
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
