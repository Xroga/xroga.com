// compose_video with the whole of editly's model, on real material: a mosaic of four windows on one film, a picture-in-picture, a photograph with a blurred background and a slow zoom,
// a shader and a shape, four transitions that are pixel rules (crosszoom, circleopen, dreamyzoom, directional-left), a film fitted to a clip of fixed length, detached sound that starts
// part way into a clip, a song under all of it, and loudness normalisation. The design is checked first with the preview, then made and read back.
import { composeOnDevice, previewOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const PHOTO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-images/elephant-660-480.jpg';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const ROAR = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';

const spec = {
  width: 640,
  height: 360,
  fps: 20,
  defaults: { transition: { duration: 0.6 }, layer: { font: 'rounded' }, layerType: { video: { resizeMode: 'cover' } } },
  audioTracks: [{ url: SONG, volume: 0.7, loop: true }],
  audioNorm: { enable: true, targetLufs: -16 },
  clips: [
    {
      duration: 2.5,
      transition: { name: 'crosszoom' },
      layers: [
        { type: 'radial-gradient', colors: ['#1d2b64', '#f8cdda'] },
        { type: 'shape', shape: 'ellipse', color: 'rgba(255,255,255,0.25)', x: 0.5, y: 0.5, width: 0.7, height: 1.2, originX: 'center', originY: 'center' },
        { type: 'title-background', text: 'The whole of the model', background: { type: 'linear-gradient', colors: ['#02aab0', '#00cdac'] }, fontSize: 0.09, zoomDirection: 'in' },
      ],
    },
    {
      duration: 3,
      transition: { name: 'circleopen' },
      layers: [
        { type: 'fill-color', color: '#101820' },
        { type: 'video', url: TRAILER, cutFrom: 24, cutTo: 27, left: 0, top: 0, width: 0.5, height: 0.5, resizeMode: 'cover', volume: 0 },
        { type: 'video', url: TRAILER, cutFrom: 24, cutTo: 27, left: 1, top: 0, width: 0.5, height: 0.5, originX: 'right', resizeMode: 'contain', volume: 0 },
        { type: 'video', url: TRAILER, cutFrom: 24, cutTo: 27, left: 0, top: 1, width: 0.5, height: 0.5, originY: 'bottom', resizeMode: 'stretch', volume: 0 },
        { type: 'video', url: TRAILER, cutFrom: 24, cutTo: 27, left: 1, top: 1, width: 0.5, height: 0.5, originX: 'right', originY: 'bottom', resizeMode: 'contain-blur', volume: 0.6, effects: { saturation: 0.2 } },
        { type: 'subtitle', text: 'Four windows on one film', delay: 0.1 },
      ],
    },
    {
      duration: 2.5,
      transition: { name: 'dreamyzoom' },
      layers: [
        { type: 'image', url: PHOTO, resizeMode: 'contain-blur', zoomDirection: 'right', zoomAmount: 0.15 },
        { type: 'news-title', text: 'Blurred background, slow pan', delay: 0.2 },
        { type: 'detached-audio', url: ROAR, start: 0.8, volume: 0.9 },
      ],
    },
    {
      // a clip of fixed length: the 4 s cut of the film is fitted to it (twice the speed)
      duration: 2,
      transition: { name: 'directional-left' },
      layers: [
        { type: 'video', url: TRAILER, cutFrom: 20, cutTo: 24 },
        { type: 'video', url: TRAILER, cutFrom: 30, cutTo: 34, left: 0.97, top: 0.05, width: 0.35, height: 0.35, originX: 'right', resizeMode: 'cover', volume: 0 },
        { type: 'slide-in-text', text: 'Picture in picture', position: 'bottom-left', fontSize: 0.05 },
      ],
    },
    {
      duration: 2,
      layers: [{ type: 'rainbow-colors' }, { type: 'shader', fragment: 'vec2 uv = fragCoord / iResolution.xy; fragColor = vec4(uv.x, uv.y, 0.5 + 0.5 * sin(iTime * 3.0), 0.55);' }, { type: 'title', text: 'Made on this device', font: 'serif', position: 'center', fadeOut: 0.6 }],
    },
  ],
};

defineScenario({
  id: 'S5-compose-editly',
  set: 'C',
  title: 'the whole of editly\'s model on real material: mosaic, picture-in-picture, shader, transitions, detached sound, normalisation',
  covers: 'compose_video: preview sheet; placement rectangles and every resize mode; blurred-background fit; four pixel transitions; a clip with a given length fitting its film; audio layers; loudness normalisation; read back with media',
  async run() {
    const sheet = await previewOnDevice(spec, [0.5, 2.0, 3.6, 5.2, 6.6, 8.4, 10.2, 12]);
    const made = await composeOnDevice(spec);
    const info = await readMedia({ url: made.url, action: 'info' });
    const audio = await readMedia({ url: made.url, action: 'audio', seconds: 30 });
    // 2.5 + 3 + 2.5 + 2 + 2 minus four transitions of 0.6 s
    const expected = 12 - 4 * 0.6;
    const checks: Record<string, boolean> = {
      previewSheet: sheet.times.length === 8 && sheet.base64.length > 15000 && Math.abs(sheet.seconds - expected) < 0.05,
      length: Math.abs(made.seconds - expected) < 0.05 && info.kind === 'info' && Math.abs(info.duration - expected) < 0.6,
      tracks: info.kind === 'info' && info.tracks.some(t => t.type === 'video' && t.width === 640) && info.tracks.some(t => t.type === 'audio'),
      frames: made.frames === Math.round(expected * 20),
      // the sound is normalised to -16 LUFS: within 2 LU of it
      normalised: audio.kind === 'audio' && audio.report.loudnessLufs !== null && Math.abs(audio.report.loudnessLufs + 16) < 2,
    };
    return outcome(
      'the full model renders: a preview sheet first, then a file of the planned length with normalised sound',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), seconds: made.seconds, frames: made.frames, bytes: made.bytes, renderMs: made.renderMs, container: made.container, codecs: [made.videoCodec, made.audioCodec], loudness: audio.kind === 'audio' ? audio.report.loudnessLufs : null, notes: made.notes, sheet: sheet.base64 }),
      Object.values(checks).every(Boolean),
    );
  },
});
