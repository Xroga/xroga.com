// compose_video from real material: a gradient title card, four seconds of the Sintel trailer (Blender Foundation, CC-BY) with a subtitle, a photograph that zooms slowly
// (MDN's CC0 elephant), and a SoundHelix song under all of it. The result is read back with the media tool: length, tracks, a contact sheet and loudness.
import { composeOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const PHOTO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-images/elephant-660-480.jpg';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

defineScenario({
  id: 'S5-compose',
  set: 'C',
  title: 'a video made from a picture, a film segment, titles and music, then read back',
  covers: 'compose_video: gradient and title, video layer with cut points and sound, image with zoom, transitions, looped music; the file has the right length, a picture track and a sound track',
  async run() {
    const made = await composeOnDevice({
      width: 640,
      height: 360,
      fps: 24,
      clips: [
        { duration: 2, transition: { name: 'fade', duration: 0.5 }, layers: [{ type: 'linear-gradient', colors: ['#1d2b64', '#f8cdda'] }, { type: 'slide-in-text', text: 'Made on this device', fontSize: 0.1 }] },
        { transition: { name: 'directional-left', duration: 0.5 }, layers: [{ type: 'video', url: TRAILER, cutFrom: 20, cutTo: 24 }, { type: 'subtitle', text: 'A film segment, cut and placed', start: 1 }] },
        { duration: 2.5, transition: { name: 'none' }, layers: [{ type: 'fill-color', color: '#000000' }, { type: 'image', url: PHOTO, resizeMode: 'contain', zoom: 'in', zoomAmount: 0.2 }, { type: 'news-title', text: 'Photograph, slow zoom', position: 'bottom', fontSize: 0.06 }] },
      ],
      audioTracks: [{ url: SONG, start: 0, cutFrom: 0, volume: 0.6, loop: true }],
    });
    const info = await readMedia({ url: made.url, action: 'info' });
    const sheet = await readMedia({ url: made.url, action: 'frames', count: 8, width: 160 });
    const audio = await readMedia({ url: made.url, action: 'audio', seconds: 30 });
    const expected = 2 + 4 + 2.5 - 0.5 - 0.5;
    const checks: Record<string, boolean> = {
      length: Math.abs(made.seconds - expected) < 0.05 && info.kind === 'info' && Math.abs(info.duration - expected) < 0.5,
      tracks: info.kind === 'info' && info.tracks.some(t => t.type === 'video' && t.width === 640 && t.height === 360) && info.tracks.some(t => t.type === 'audio'),
      frames: made.frames === Math.round(expected * 24),
      sheet: sheet.kind === 'frames' && sheet.decoded === 8 && sheet.base64.length > 6000,
      sound: audio.kind === 'audio' && audio.report.loudnessLufs !== null && audio.report.loudnessLufs < -8 && audio.report.loudnessLufs > -45,
      size: made.bytes > 20_000 && made.bytes < 30 * 1024 * 1024,
    };
    return outcome(
      'a real video comes out with the right length, picture and sound',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), container: made.container, codecs: [made.videoCodec, made.audioCodec], seconds: made.seconds, frames: made.frames, bytes: made.bytes, renderMs: made.renderMs, notes: made.notes, loudness: audio.kind === 'audio' ? audio.report.loudnessLufs : null, b64: sheet.kind === 'frames' ? sheet.base64 : '' }),
      Object.values(checks).every(Boolean),
    );
  },
});
