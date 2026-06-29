import { logSystemError } from '../services/systemErrorLog.js';

export interface AudioTrack {
  type: 'voiceover' | 'score';
  url: string;
  provider: string;
  durationSeconds: number;
}

export async function generateElevenLabsVoiceover(script: string): Promise<AudioTrack> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: script.slice(0, 5000),
      model_id: 'eleven_multilingual_v2',
    }),
  });

  if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    type: 'voiceover',
    url: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
    provider: 'elevenlabs',
    durationSeconds: Math.ceil(script.length / 15),
  };
}

async function generateCartesiaVoiceover(script: string): Promise<AudioTrack> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY not configured');

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
    },
    body: JSON.stringify({
      model_id: 'sonic-english',
      transcript: script.slice(0, 5000),
      voice: { mode: 'id', id: process.env.CARTESIA_VOICE_ID ?? 'a0e99841-438c-4a64-b679-ae501e7d6091' },
      output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
    }),
  });

  if (!response.ok) throw new Error(`Cartesia error: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    type: 'voiceover',
    url: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
    provider: 'cartesia',
    durationSeconds: Math.ceil(script.length / 15),
  };
}

async function generateFishAudioTts(script: string): Promise<AudioTrack> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error('FISH_AUDIO_API_KEY not configured');

  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ text: script.slice(0, 5000), format: 'mp3' }),
  });

  if (!response.ok) throw new Error(`Fish Audio error: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    type: 'voiceover',
    url: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
    provider: 'fish-audio',
    durationSeconds: Math.ceil(script.length / 15),
  };
}

export async function generateSunoScore(mood: string, durationSeconds: number): Promise<AudioTrack> {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) throw new Error('SUNO_API_KEY not configured');

  const response = await fetch('https://api.suno.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: `Cinematic background score, ${mood}, instrumental`,
      duration: durationSeconds,
    }),
  });

  if (!response.ok) throw new Error(`Suno AI error: ${response.status}`);

  const data = (await response.json()) as { audio_url: string };
  return {
    type: 'score',
    url: data.audio_url,
    provider: 'suno',
    durationSeconds,
  };
}

async function generateSilentFallback(durationSeconds: number): Promise<AudioTrack> {
  return {
    type: 'score',
    url: 'data:audio/mpeg;base64,',
    provider: 'fallback-silent',
    durationSeconds,
  };
}

/** Voice fallback: ElevenLabs → Cartesia → Fish → silent */
export async function generateVoiceoverWithFallback(
  script: string,
  options?: { userId?: string; runId?: string }
): Promise<AudioTrack> {
  const providers = [
    { name: 'elevenlabs', call: () => generateElevenLabsVoiceover(script) },
    { name: 'cartesia', call: () => generateCartesiaVoiceover(script) },
    { name: 'fish-audio', call: () => generateFishAudioTts(script) },
  ];

  for (const p of providers) {
    try {
      return await p.call();
    } catch (err) {
      await logSystemError({
        api: p.name,
        errorMessage: (err as Error).message,
        fallbackUsed: 'trying next voice provider',
        severity: 'warning',
        userId: options?.userId,
        runId: options?.runId,
        metadata: { apiType: 'voice' },
      });
    }
  }

  return generateSilentFallback(Math.ceil(script.length / 15));
}

export async function generateSceneAudio(
  script: string,
  mood: string,
  durationSeconds: number,
  options?: { userId?: string; runId?: string }
): Promise<AudioTrack[]> {
  const tracks: AudioTrack[] = [];

  if (script.trim()) {
    tracks.push(await generateVoiceoverWithFallback(script, options));
  }

  try {
    tracks.push(await generateSunoScore(mood, durationSeconds));
  } catch {
    try {
      if (process.env.FISH_AUDIO_API_KEY) {
        const score = await generateFishAudioTts(`Cinematic instrumental score, ${mood}`);
        tracks.push({ ...score, type: 'score' });
      }
    } catch {
      /* non-fatal */
    }
  }

  if (tracks.length === 0) {
    tracks.push(await generateSilentFallback(durationSeconds));
  }

  return tracks;
}

/** @deprecated Use generateSceneAudio */
export async function generateAudioTracks(
  script: string,
  mood: string,
  durationSeconds: number
): Promise<AudioTrack[]> {
  return generateSceneAudio(script, mood, durationSeconds);
}
