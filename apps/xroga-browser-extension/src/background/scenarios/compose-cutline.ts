// compose_video with what cutline does for an editing agent, on real material: captions made by listening to a real recording (a public speech test file) with the spoken word lit,
// a lower third and a logo from a brand, music that goes down under the speech, keyframes and entrance presets, and a film segment with a cut-out, a held frame and a reversed section.
// The design is previewed, then made twice (ducking on and off) and the two are compared by loudness.
import { composeOnDevice, previewOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const SPEECH = 'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const LOGO = 'https://www.w3.org/Icons/w3c_home.png';

const make = (duck: boolean) => ({
  width: 640,
  height: 360,
  fps: 20,
  brand: { colors: { primary: '#d02a42', accent: '#2563eb', text: '#ffffff' }, font: 'rounded', logo: { url: LOGO, position: 'top-right', width: 0.1, opacity: 0.85 } },
  audioTracks: [{ url: SONG, volume: 1, loop: true, ...(duck ? { duck: { amountDb: -16 } } : {}) }],
  clips: [
    {
      duration: 11,
      transition: { name: 'fade', duration: 0.5 },
      layers: [
        { type: 'linear-gradient', colors: ['#1d2b64', '#f8cdda'] },
        { type: 'title', text: 'Listening to find the words', fontSize: 0.07, position: 'top', zoomDirection: null, animationIn: { preset: 'pop', duration: 0.5 }, keyframes: [{ at: 0, y: 0 }, { at: 11, y: 0.03 }] },
        { type: 'audio', url: SPEECH, cutFrom: 0, cutTo: 11, volume: 1 },
        { type: 'captions', source: { url: SPEECH, from: 0, to: 11 }, highlightColor: '#ffd400', position: 'bottom', fontSize: 0.06 },
        { type: 'template', template: 'lower-third', text: 'Harvard sentences', subtitle: 'Open Speech Repository', start: 1, duration: 4 },
      ],
    },
    {
      transition: { name: 'directional-left', duration: 0.5 },
      layers: [{ type: 'video', url: TRAILER, cutFrom: 20, cutTo: 26, cuts: [{ from: 22, to: 23 }], freeze: { at: 2, hold: 1.5 }, volume: 0.8 }, { type: 'subtitle', text: 'A second cut out, a held frame', start: 0.3 }],
    },
    {
      transition: { name: 'none' },
      layers: [{ type: 'video', url: TRAILER, cutFrom: 24, cutTo: 27, reverse: true, volume: 0.8 }, { type: 'news-title', text: 'The same shot, backwards', delay: 0.1 }],
    },
  ],
});

defineScenario({
  id: 'S5-compose-cutline',
  set: 'C',
  title: 'captions made by listening, a brand with a lower third and logo, music that ducks, cut-outs, a held frame and reverse',
  covers: 'compose_video: captions from a source (word-timed Whisper), template and brand, keyframes and presets, a video layer with cuts, freeze and reverse, music ducking under speech measured by loudness',
  async run() {
    const sheet = await previewOnDevice(make(true), [1.5, 3.2, 5.5, 8.5, 12.0, 14.5, 17.0, 19.5]);
    const ducked = await composeOnDevice(make(true));
    const plain = await composeOnDevice(make(false));
    const quietPart = await readMedia({ url: ducked.url, action: 'audio', from: 1, seconds: 9 });
    const loudPart = await readMedia({ url: plain.url, action: 'audio', from: 1, seconds: 9 });
    const info = await readMedia({ url: ducked.url, action: 'info' });
    // 11 + (6 s of film less 1 s cut, plus 1.5 s held) + 3 s reversed, less the two transitions of 0.5 s (fade, then directional-left)
    const expected = 11 + 6.5 + 3 - 0.5 - 0.5;
    const checks: Record<string, boolean> = {
      previewSheet: sheet.times.length === 8 && sheet.base64.length > 20000,
      length: Math.abs(ducked.seconds - expected) < 0.06 && info.kind === 'info' && Math.abs(info.duration - expected) < 0.8,
      duckedIsQuieter: quietPart.kind === 'audio' && loudPart.kind === 'audio' && quietPart.report.loudnessLufs !== null && loudPart.report.loudnessLufs !== null && quietPart.report.loudnessLufs < loudPart.report.loudnessLufs - 2,
      noNotes: ducked.notes.length === 0,
    };
    return outcome(
      'captions, brand, ducking, cuts, freeze and reverse render, and the ducked music is quieter under the speech',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), seconds: ducked.seconds, renderMs: ducked.renderMs, notes: ducked.notes, ducked: quietPart.kind === 'audio' ? quietPart.report.loudnessLufs : null, plain: loudPart.kind === 'audio' ? loudPart.report.loudnessLufs : null, sheet: sheet.base64 }),
      Object.values(checks).every(Boolean),
    );
  },
});
