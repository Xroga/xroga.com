// record_screen on a real page: the tab is recorded with Chrome's screencast while the page is scrolled and two clicks are noted at known places, the recording becomes an MP4, is read
// back through its kept address recording:last, and a demo video is made from it with a zoom on each click (the preview sheet is kept to be looked at).
import { composeOnDevice, previewOnDevice } from '../../extension/compose';
import { readMedia } from '../../extension/media';
import { noteActionPoint, startRecording, stopRecording } from '../../extension/screen-record';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const PAGE = 'https://en.wikipedia.org/wiki/Domestic_cat';

defineScenario({
  id: 'S5-record-screen',
  set: 'C',
  title: 'a real page recorded to a video with its clicks, then made into a demo with zooms',
  covers: 'record_screen: screencast frames with times become an MP4 on the device; clicks become fractions of the picture; the video is kept as recording:last for media and compose_video; zoomOnClicks zooms in on each click',
  async run(ctx) {
    const tabId = await ctx.open(PAGE);
    await ctx.call('read', { tabId }); // the tab is open for the agent
    await sleep(2000);
    await startRecording(tabId, 30);
    await sleep(500);
    for (const [i, dy] of [500, 700, 600].entries()) {
      await evaluate(tabId, undefined, `window.scrollBy({ top: ${dy}, behavior: 'smooth' })`);
      await sleep(900);
      if (i === 0) noteActionPoint(tabId, { x: 380, y: 260 }, 'click');
      if (i === 2) noteActionPoint(tabId, { x: 900, y: 420 }, 'click');
    }
    await sleep(600);
    const made = await stopRecording(tabId);
    const info = await readMedia({ url: 'recording:last', action: 'info' });
    const spec = {
      width: 640,
      height: 360,
      fps: 15,
      clips: [{ layers: [{ type: 'video', url: 'recording:last', resizeMode: 'cover', zoomOnClicks: { clicks: made.clicks, scale: 2, hold: 1 } }] }],
    };
    const times = made.clicks.map(c => c.t + 0.3).slice(0, 2).concat([0.4, made.seconds - 0.6]);
    const sheet = await previewOnDevice(spec, times);
    const demo = await composeOnDevice(spec);
    const checks: Record<string, boolean> = {
      frames: made.frames >= 6 && made.seconds > 2,
      size: made.width >= 800 && made.height >= 400 && made.bytes > 20_000,
      clicks: made.clicks.length === 2 && made.clicks.every(c => c.x > 0 && c.x < 1 && c.y > 0 && c.y < 1) && made.clicks[0]!.t < made.clicks[1]!.t,
      keptAndReadable: info.kind === 'info' && info.tracks.some(t => t.type === 'video') && Math.abs(info.duration - made.seconds) < 1.2,
      demo: demo.bytes > 10_000 && Math.abs(demo.seconds - made.seconds) < 1,
    };
    return outcome(
      'the tab is recorded with its clicks and made into a demo with zooms',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), frames: made.frames, seconds: made.seconds, size: [made.width, made.height], clicks: made.clicks, notes: made.notes, demoSeconds: demo.seconds, sheet: sheet.base64 }),
      Object.values(checks).every(Boolean),
    );
  },
});
