// transcribe on a real recording: the Open Speech Repository's Harvard sentences (a public-domain test recording of an American voice). The first run downloads
// the Whisper model (about 41 MB) from Hugging Face; the speech is decoded and recognised inside the offscreen document.
import { describeTranscript } from '../../agent/transcript-format';
import { transcribeFile } from '../../extension/transcribe';
import { defineScenario, outcome } from './registry';

const FILE = 'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav';

defineScenario({
  id: 'S4-transcribe',
  set: 'C',
  title: 'speech in a real recording turned into text with times',
  covers: 'transcribe: fetch a wav file, decode to 16 kHz mono, Whisper tiny.en through transformers.js in the offscreen document, lines with times; find narrows the lines',
  async run() {
    const started = Date.now();
    const result = await transcribeFile(FILE, { seconds: 40 });
    const took = Math.round((Date.now() - started) / 1000);
    const text = describeTranscript(result);
    const found = describeTranscript(result, { find: 'birch' });
    const words = result.chunks.map(c => c.text).join(' ').toLowerCase();
    const checks: Record<string, boolean> = {
      lines: result.chunks.length >= 3,
      timed: result.chunks.every(c => Number.isFinite(c.start)) && (result.chunks.at(-1)?.start ?? 0) > 5,
      // the recording says: "The birch canoe slid on the smooth planks", "Glue the sheet to the dark blue background", "It's easy to tell the depth of a well"
      content: /birch|canoe/.test(words) && /glue|sheet|blue/.test(words) && /depth|well/.test(words),
      find: /Lines with "birch": [1-9]/.test(found),
      formatted: /^Speech read from the sound/.test(text) && /\[0:0\d\]/.test(text),
    };
    return outcome(
      'speech in a real recording becomes timed text',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), seconds: took, bytes: result.bytes, text: text.slice(0, 700) }),
      Object.values(checks).every(Boolean),
    );
  },
});
