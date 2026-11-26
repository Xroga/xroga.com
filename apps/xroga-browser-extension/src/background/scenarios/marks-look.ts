// Diagnostic only: what the set-of-marks screenshot looks like on a real painted application (the picture is kept in the report for inspection).
import type { Result, ScreenshotData } from '@src/browser-control';
import { sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'MARKS-LOOK-real-painted-app',
  set: 'C',
  title: 'marks on a real painted application',
  covers: 'diagnostic picture',
  async run(ctx) {
    await ctx.open('https://tracedraw.github.io/tracedraw/');
    await sleep(22000);
    const first = (await ctx.call('screenshot', { marks: true })) as Result<ScreenshotData>;
    return outcome('picture kept', first.text.split('\n')[0] ?? '', true, { welcome: first.data?.base64 });
  },
});
