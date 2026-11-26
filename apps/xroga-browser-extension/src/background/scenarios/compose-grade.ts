// compose_video colour, masks, speed ranges and sound treatment on real material (the Sintel trailer, a real .cube LUT from a public repository, a public speech test file): the numbers
// of the pictures are measured, not only looked at. A 3D LUT changes the colour of a frame; a black-and-white adjustment layer leaves no colour; a circular mask leaves the corners of its
// box to the background; a zoom on a named cell changes the frame; a speed range changes the length as worked out; and noise reduction, equaliser, compressor and reverb change the sound.
import { composeOnDevice, previewOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const SPEECH = 'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav';
// a real 17-point 3D LUT ("honey", MIT licence, repository cartesiancs/cartcut)
const LUT = 'https://raw.githubusercontent.com/cartesiancs/cartcut/HEAD/assets/presets/luts/honey/lut.cube';

interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** The pixels of a preview sheet of one picture, below its 18 pixel label. */
async function pixelsOf(base64: string): Promise<Pixels> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height - 18);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, -18);
  const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: out.width, height: out.height, data: out.data };
}
const at = (p: Pixels, fx: number, fy: number): [number, number, number] => {
  const i = (Math.min(p.height - 1, Math.floor(fy * p.height)) * p.width + Math.min(p.width - 1, Math.floor(fx * p.width))) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!];
};
const mean = (p: Pixels): [number, number, number] => {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = p.data.length / 4;
  for (let i = 0; i < p.data.length; i += 4) {
    r += p.data[i]!;
    g += p.data[i + 1]!;
    b += p.data[i + 2]!;
  }
  return [r / n, g / n, b / n];
};
const spread = (p: Pixels): number => {
  let s = 0;
  const n = p.data.length / 4;
  for (let i = 0; i < p.data.length; i += 4) s += Math.abs(p.data[i]! - p.data[i + 1]!) + Math.abs(p.data[i + 1]! - p.data[i + 2]!);
  return s / n;
};
const difference = (a: Pixels, b: Pixels): number => {
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) s += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
  return s / (a.data.length / 4);
};

const video = (extra: Record<string, unknown> = {}) => ({ type: 'video', url: TRAILER, cutFrom: 20, cutTo: 26, ...extra });
const one = (layers: unknown[]) => ({ width: 640, height: 360, fps: 15, clips: [{ duration: 4, layers }] });

defineScenario({
  id: 'S5-compose-grade',
  set: 'C',
  title: 'colour grading with a real LUT, an adjustment layer, a circular mask, zooms on cells, speed ranges and sound treatment, measured',
  covers: 'compose_video: grade (LUT from a .cube file, presets), adjustment layer, mask circle with shadow, zooms by cell name, speedRanges, fx (noise reduction, equaliser, compressor, reverb) on a sound; preview grid',
  async run() {
    const frame = async (spec: unknown, t = 1.5, grid = false) => pixelsOf((await previewOnDevice(spec, [t], grid)).base64);
    const plain = await frame(one([video()]));
    const withLut = await frame(one([video({ grade: { lut: { url: LUT, intensity: 1 } } })]));
    const lutNotes = (await previewOnDevice(one([video({ grade: { lut: { url: LUT } } })]), [1])).notes;
    const bw = await frame(one([video(), { type: 'adjustment', grade: { preset: 'bw' } }]));
    const cinematic = await frame(one([video({ grade: { preset: 'cinematic' } })]));
    const gridSheet = await previewOnDevice(one([video()]), [1.5], true);
    const gridPlain = await previewOnDevice(one([video()]), [1.5], false);

    // a small round video over a red background: the corners of its box stay red, its middle does not
    const bubble = await frame({ width: 640, height: 360, fps: 15, clips: [{ duration: 4, layers: [{ type: 'fill-color', color: '#ff0000' }, video({ x: 0.5, y: 0.5, width: 0.5, height: 0.5, originX: 'center', originY: 'center', mask: 'circle', shadow: true })] }] });
    // a zoom on the top-right cell against none
    const zoomed = await frame(one([video({ zooms: [{ from: 0.5, to: 3.5, cell: 'C1', scale: 2.2 }] })]), 2);
    const unzoomed = await frame(one([video()]), 2);

    // a stretch played at half speed: 6 s of film, 2 s of them at half speed -> 4 + 4 s
    const ramped = await composeOnDevice({ width: 320, height: 180, fps: 10, keepSourceAudio: false, clips: [{ layers: [video({ cutFrom: 20, cutTo: 26, speedRanges: [{ from: 22, to: 24, speed: 0.5 }] })] }] });

    // the same speech with and without treatment
    const withSpeech = (fx?: unknown) => ({ width: 320, height: 180, fps: 8, audioTracks: [{ url: SPEECH, cutTo: 10, volume: 1, ...(fx ? { fx } : {}) }], clips: [{ duration: 10, layers: [{ type: 'fill-color', color: '#202020' }] }] });
    const raw = await composeOnDevice(withSpeech());
    const treated = await composeOnDevice(withSpeech({ denoise: { focus: 'speech', amount: 0.7 }, eq: 'voice', compressor: { threshold: -30, ratio: 6, makeup: 6 }, reverb: { roomSize: 0.3, wet: 0.2 } }));
    const rawAudio = await readMedia({ url: raw.url, action: 'audio', seconds: 10 });
    const treatedAudio = await readMedia({ url: treated.url, action: 'audio', seconds: 10 });

    const m0 = mean(plain);
    const m1 = mean(withLut);
    const corner = at(bubble, 0.27, 0.27);
    const centre = at(bubble, 0.5, 0.5);
    const checks: Record<string, boolean> = {
      lutLoaded: lutNotes.length === 0,
      lutChangesColour: Math.abs(m1[0] - m0[0]) + Math.abs(m1[1] - m0[1]) + Math.abs(m1[2] - m0[2]) > 12 && difference(plain, withLut) > 8,
      adjustmentIsBlackAndWhite: spread(bw) < 4 && spread(plain) > 8,
      presetChangesPicture: difference(plain, cinematic) > 8,
      roundMaskKeepsCorners: corner[0] > 200 && corner[1] < 60 && corner[2] < 60 && !(centre[0] > 200 && centre[1] < 60 && centre[2] < 60),
      zoomOnCellChangesFrame: difference(zoomed, unzoomed) > 12,
      gridDrawn: gridSheet.base64 !== gridPlain.base64,
      speedRangeLength: Math.abs(ramped.seconds - 8) < 0.15,
      soundTreated:
        rawAudio.kind === 'audio' && treatedAudio.kind === 'audio' && rawAudio.report.loudnessLufs !== null && treatedAudio.report.loudnessLufs !== null && Math.abs(treatedAudio.report.loudnessLufs - rawAudio.report.loudnessLufs) > 0.4,
    };
    return outcome(
      'a real LUT, an adjustment layer, a circular mask, a zoom on a cell, a speed range and sound treatment all change the result as they should',
      JSON.stringify({
        failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
        lutNotes,
        meanPlain: m0.map(Math.round),
        meanLut: m1.map(Math.round),
        lutDiff: Math.round(difference(plain, withLut)),
        spreadBw: Math.round(spread(bw) * 10) / 10,
        corner,
        centre,
        zoomDiff: Math.round(difference(zoomed, unzoomed)),
        rampedSeconds: ramped.seconds,
        lufs: [rawAudio.kind === 'audio' ? rawAudio.report.loudnessLufs : null, treatedAudio.kind === 'audio' ? treatedAudio.report.loudnessLufs : null],
        sheet: gridSheet.base64,
      }),
      Object.values(checks).every(Boolean),
    );
  },
});
