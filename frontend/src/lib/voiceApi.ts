import { API_URL, ApiError, getAccessToken } from '@/lib/api';

export async function transcribeVoiceAudio(audio: Blob): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new ApiError('Please sign in to use voice input.', 401);

  const response = await fetch(`${API_URL}/api/voice/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': audio.type || 'audio/webm',
    },
    body: audio,
  });

  const payload = (await response.json().catch(() => null)) as
    | { text?: unknown; error?: unknown; code?: unknown }
    | null;

  if (!response.ok) {
    throw new ApiError(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Could not transcribe that audio.',
      response.status,
      {
        code: typeof payload?.code === 'string' ? payload.code : 'VOICE_TRANSCRIPTION_FAILED',
      },
    );
  }

  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new ApiError('No speech was detected.', 422);
  return text;
}
