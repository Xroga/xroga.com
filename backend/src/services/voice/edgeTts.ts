import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'stream';
import { prepareSpeechText } from './voicePrompt.js';

const VOICE = 'en-US-JennyNeural';

export async function synthesizeWithEdgeTts(text: string): Promise<Buffer> {
  const speech = prepareSpeechText(text);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(speech, { rate: 0.95, pitch: '+2Hz', volume: 100 });
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
