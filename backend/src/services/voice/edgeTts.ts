import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'stream';
import { prepareSpeechText } from './voicePrompt.js';

export type VoiceGender = 'female' | 'male';

const VOICES: Record<VoiceGender, string> = {
  female: 'en-US-JennyNeural',
  male: 'en-US-GuyNeural',
};

export function resolveEdgeVoice(gender?: VoiceGender): string {
  return VOICES[gender === 'male' ? 'male' : 'female'];
}

export async function synthesizeWithEdgeTts(
  text: string,
  gender: VoiceGender = 'female'
): Promise<Buffer> {
  const speech = prepareSpeechText(text);
  const voice = resolveEdgeVoice(gender);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const pitch = gender === 'male' ? '+0Hz' : '+2Hz';
  const { audioStream } = tts.toStream(speech, { rate: 0.95, pitch, volume: 100 });
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    (audioStream as Readable)
      .on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      .on('end', () => resolve())
      .on('close', () => resolve())
      .on('error', reject);
  });

  tts.close();
  return Buffer.concat(chunks);
}
