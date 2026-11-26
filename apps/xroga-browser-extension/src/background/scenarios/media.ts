// media on real files: the Sintel trailer (Blender Foundation, CC-BY: a short film trailer with many cuts, music and effects) and a SoundHelix song (a steady electronic beat).
import { describeAudio, describeBeats, describeScenes } from '../../agent/media-analysis';
import { describeInfo } from '../../agent/media-tool';
import { readMedia } from '../../extension/media';
import { defineScenario, outcome } from './registry';

const TRAILER = 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

defineScenario({
  id: 'S5-media',
  set: 'C',
  title: 'sound and picture of real media files read on the device',
  covers: 'media: info of a video and a song, loudness and silences, cuts of a trailer, a contact sheet of frames, tempo and beats of a song',
  async run() {
    const t0 = Date.now();
    const info = await readMedia({ url: TRAILER, action: 'info' });
    const song = await readMedia({ url: SONG, action: 'info' });
    const scenes = await readMedia({ url: TRAILER, action: 'scenes', seconds: 60 });
    const frames = await readMedia({ url: TRAILER, action: 'frames', count: 6, width: 240 });
    const audio = await readMedia({ url: TRAILER, action: 'audio', seconds: 60, minSeconds: 0.3 });
    const beats = await readMedia({ url: SONG, action: 'beats', seconds: 60 });
    const seconds = Math.round((Date.now() - t0) / 1000);
    const checks: Record<string, boolean> = {
      infoFormat: info.kind === 'info' && /mp4|mov/i.test(info.format) && info.duration > 40 && info.duration < 70,
      infoTracks: info.kind === 'info' && info.tracks.some(t => t.type === 'video' && t.width === 854 && t.height === 480) && info.tracks.some(t => t.type === 'audio'),
      songInfo: song.kind === 'info' && /mp3|mpeg/i.test(song.format) && song.tracks.some(t => t.type === 'audio' && (t.channels ?? 0) >= 1),
      cuts: scenes.kind === 'scenes' && scenes.cuts.length >= 8 && scenes.cuts.length <= 60,
      sheet: frames.kind === 'frames' && frames.decoded === 6 && frames.base64.length > 8000 && frames.width === 4 * 240,
      loudness: audio.kind === 'audio' && audio.report.loudnessLufs !== null && audio.report.loudnessLufs < -5 && audio.report.loudnessLufs > -45 && audio.report.line.length === 60,
      tempo: beats.kind === 'beats' && beats.beats.bpm >= 70 && beats.beats.bpm <= 190 && beats.beats.beats.length >= 20 && beats.beats.confidence >= 0.3,
    };
    const shown = [
      info.kind === 'info' ? describeInfo(info) : '',
      scenes.kind === 'scenes' ? describeScenes(scenes.cuts, scenes.seconds, scenes.sampled) : '',
      audio.kind === 'audio' ? describeAudio(audio.report, { thresholdDb: -40, minSeconds: 0.3 }) : '',
      beats.kind === 'beats' ? describeBeats(beats.beats, beats.seconds) : '',
    ].join('\n');
    return outcome(
      'real files are described: tracks, cuts, a sheet of frames, loudness and a tempo',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), seconds, shown: shown.slice(0, 2600) }),
      Object.values(checks).every(Boolean),
    );
  },
});
