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
  const base64 = buffer.toString('base64');

  return {
    type: 'voiceover',
    url: `data:audio/mpeg;base64,${base64}`,
    provider: 'elevenlabs',
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

export async function generateAudioTracks(
  script: string,
  mood: string,
  durationSeconds: number
): Promise<AudioTrack[]> {
  const results = await Promise.allSettled([
    generateElevenLabsVoiceover(script),
    generateSunoScore(mood, durationSeconds),
  ]);

  const tracks: AudioTrack[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      tracks.push(result.value);
    } else {
      console.error('[Audio] Generation failed:', result.reason);
    }
  }

  if (tracks.length === 0) {
    tracks.push({
      type: 'score',
      url: 'data:audio/mpeg;base64,',
      provider: 'fallback-silent',
      durationSeconds,
    });
  }

  return tracks;
}
