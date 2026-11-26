// The rest of the batch-5 deep pass on real material: a real subtitle file (the Sintel SRT from a public repository) read, written back and shown as captions; text looks with a stroke, a box
// and letters that appear one by one; staggered titles; a named speed curve; springs and the new transitions; and the loud moments of a real song found by `media highlights`.
import { composeOnDevice, previewOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { cuesToFile, parseSubtitles } from '../../agent/subtitle-format';
import { wordsToCues } from '../../agent/transcript-tools';
import { cuesToWords } from '../../agent/subtitle-format';
import { highlightRanges } from '../../agent/media-analysis';
import { buildPlayback, presetRanges } from '../../agent/compose-playback';
import { defineScenario, outcome } from './registry';

const SRT = 'https://raw.githubusercontent.com/EldinZenderink/SubPlayerJS/HEAD/DemoSubtitle/sintel.srt';
const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
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
/** Mean absolute difference between two pictures, over a region given as fractions. */
function difference(a: Pixels, b: Pixels, region: [number, number, number, number] = [0, 0, 1, 1]): number {
  let s = 0;
  let n = 0;
  for (let y = Math.floor(region[1] * a.height); y < Math.floor(region[3] * a.height); y++) {
    for (let x = Math.floor(region[0] * a.width); x < Math.floor(region[2] * a.width); x++) {
      const i = (y * a.width + x) * 4;
      s += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      n++;
    }
  }
  return s / Math.max(1, n);
}

const base = (layers: unknown[], extra: Record<string, unknown> = {}) => ({ width: 640, height: 360, fps: 15, clips: [{ duration: 6, layers: [{ type: 'fill-color', color: '#1d2b64' }, ...layers], ...extra }] });

defineScenario({
  id: 'S5-compose-more',
  set: 'C',
  title: 'a real subtitle file as captions, text looks, staggered titles, a named speed curve, springs, new transitions, and highlights found in a real song',
  covers: 'subtitle-format (SRT read and written), captions subtitles with an offset and a look, title look (stroke, box, typewriter), stagger, speedPreset, spring easing, flash/glitch/pageturn transitions, media highlights',
  async run() {
    const text = new TextDecoder().decode(await (await fetch(SRT)).arrayBuffer());
    const cues = parseSubtitles(text);
    const written = cuesToFile(cues, 'srt');
    const again = parseSubtitles(written);
    const wordCount = cuesToWords(cues).length;

    // the captions of the real file, moved to the start of a six second clip: the first line is at 107 s in the file
    const withCaptions = await pixelsOf((await previewOnDevice(base([{ type: 'captions', subtitles: SRT, subtitleOffset: -cues[0]!.start + 0.2, style: 'bold' }]), [1.5])).base64);
    const withoutCaptions = await pixelsOf((await previewOnDevice(base([]), [1.5])).base64);

    // a title with a stroke and a box, typed in: early in its run some of the box is empty
    const early = await pixelsOf((await previewOnDevice(base([{ type: 'title', text: 'Typed one letter at a time', typewriter: true, stroke: { color: '#000000', width: 0.08 }, box: { color: 'rgba(0,0,0,0.6)', padding: 0.3 }, bold: true, fontSize: 0.09 }]), [0.2])).base64);
    const late = await pixelsOf((await previewOnDevice(base([{ type: 'title', text: 'Typed one letter at a time', typewriter: true, stroke: { color: '#000000', width: 0.08 }, box: { color: 'rgba(0,0,0,0.6)', padding: 0.3 }, bold: true, fontSize: 0.09 }]), [4.5])).base64);

    // staggered titles: at 0.2 s only the first is there, at 2 s all three
    const stag = (t: number) => previewOnDevice(base([{ type: 'title', text: 'one', position: 'top' }, { type: 'title', text: 'two', position: 'center' }, { type: 'title', text: 'three', position: 'bottom' }], { stagger: 0.8 }), [t]).then(r => pixelsOf(r.base64));
    const s1 = await stag(0.2);
    const s2 = await stag(2.2);

    // a hero-moment speed curve on 6 s of the trailer: the length is what the curve works out to, and the sound follows
    const hero = await composeOnDevice({ width: 320, height: 180, fps: 10, clips: [{ layers: [{ type: 'video', url: TRAILER, cutFrom: 20, cutTo: 26, speedPreset: 'hero-moment' }] }] });
    const heroInfo = await readMedia({ url: hero.url, action: 'info' });

    // a spring-eased move and a flash, glitch and page turn between clips
    const moves = await composeOnDevice({
      width: 320,
      height: 180,
      fps: 10,
      clips: [
        { duration: 1.5, transition: { name: 'flash', duration: 0.4 }, layers: [{ type: 'fill-color', color: '#d02a42' }, { type: 'title', text: 'spring', keyframes: [{ at: 0, y: 0.1, easing: 'spring-bouncy' }, { at: 1, y: 0.5 }] }] },
        { duration: 1.5, transition: { name: 'glitch', duration: 0.4 }, layers: [{ type: 'fill-color', color: '#2563eb' }] },
        { duration: 1.5, transition: { name: 'pageturn', duration: 0.4 }, layers: [{ type: 'fill-color', color: '#16a34a' }] },
        { duration: 1.5, layers: [{ type: 'fill-color', color: '#111827' }] },
      ],
    });

    // the loud moments of a real song
    const audio = await readMedia({ url: TRAILER, action: 'audio', seconds: 60 });
    const song = await readMedia({ url: SONG, action: 'audio', seconds: 120 });
    const expectedHero = buildPlayback({ cutFrom: 20, cutTo: 26, speed: 1, speedRanges: presetRanges('hero-moment', 20, 26) }).length;
    const found = audio.kind === 'audio' ? highlightRanges(audio.report.levels ?? [], { count: 4, minSeconds: 6 }) : [];

    const checks: Record<string, boolean> = {
      srtRead: cues.length >= 20 && Math.abs(cues[0]!.start - 107.25) < 0.01,
      srtRoundTrips: again.length === cues.length && again.every((c, i) => Math.abs(c.start - cues[i]!.start) < 0.002 && c.text === cues[i]!.text),
      wordsFromCues: wordCount > cues.length * 2,
      captionsShown: difference(withCaptions, withoutCaptions, [0, 0.55, 1, 1]) > 6,
      typewriterTypesIn: difference(late, early) > 6,
      staggerBringsInOne: difference(s2, s1) > 4,
      speedCurveLength: Math.abs(hero.seconds - expectedHero) < 0.3 && expectedHero > 8 && heroInfo.kind === 'info' && Math.abs(heroInfo.duration - hero.seconds) < 0.8,
      transitionsRender: moves.bytes > 3000 && Math.abs(moves.seconds - (1.5 * 4 - 0.4 * 3)) < 0.1,
      levelsAvailable: audio.kind === 'audio' && (audio.report.levels?.length ?? 0) > 40 && song.kind === 'audio' && (song.report.levels?.length ?? 0) > 60,
      highlightsFound: found.length >= 1 && found.every(h => h.end > h.start && h.end - h.start <= 20),
    };
    return outcome(
      'a real subtitle file shows as captions, text types in and staggers, a speed curve and the new transitions render, and the levels of a real song are available for highlights',
      JSON.stringify({
        failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
        cues: cues.length,
        first: cues[0],
        words: wordCount,
        captionsDiff: Math.round(difference(withCaptions, withoutCaptions, [0, 0.55, 1, 1])),
        typeDiff: Math.round(difference(late, early)),
        staggerDiff: Math.round(difference(s2, s1)),
        heroSeconds: hero.seconds,
        expectedHero,
        songHighlights: song.kind === 'audio' ? highlightRanges(song.report.levels ?? [], { count: 4, minSeconds: 6 }) : [],
        movesSeconds: moves.seconds,
        levels: audio.kind === 'audio' ? audio.report.levels?.length : 0,
        highlights: found,
        cueCheck: wordsToCues(cuesToWords(cues)).length,
      }),
      Object.values(checks).every(Boolean),
    );
  },
});
