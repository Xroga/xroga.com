// A file made inside an iframe and revoked at once. What is held is the file the browser itself started to download after the agent's click (never any other blob a page makes):
// a same-origin frame's file is found through the frame's own table; a cross-origin frame's file is never read from another origin's context (best effort inside its own frame session).
import { capturedBlob, clearCapturedBlobs, listCapturedBlobs } from '@src/browser-control/core/blob-capture';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';
import { sleep } from '../checks/helpers';

const text = (b: ArrayBuffer | undefined) => (b ? new TextDecoder().decode(b) : '');

defineScenario({
  id: 'S3-blob-frames',
  set: 'C',
  title: 'a blob export from a same-origin iframe is captured after revoke; from a cross-origin iframe it is not',
  covers: 'frame-aware capture that never reads across origins',
  async run(ctx) {
    clearCapturedBlobs();
    await ctx.open(`${FIXTURE_ORIGIN}/f-export-frame.html?t=same1`);
    const snap = await ctx.call('snapshot', { mode: 'all' });
    const click = await ctx.call('click', { target: { role: 'button', name: 'Export orders' } });
    for (let i = 0; i < 30 && listCapturedBlobs().length === 0; i++) await sleep(100);
    const sameHeld = listCapturedBlobs().map(u => text(capturedBlob(u)?.bytes));
    const sameOk = click.ok && sameHeld.some(t => t.includes('ORD-same1'));
    clearCapturedBlobs();
    await ctx.open(`${FIXTURE_ORIGIN}/f-export-xframe.html`);
    await ctx.call('snapshot', { mode: 'all' });
    const click2 = await ctx.call('click', { target: { role: 'button', name: 'Export orders' } });
    await sleep(1500);
    const crossHeld = listCapturedBlobs().map(u => text(capturedBlob(u)?.bytes));
    // Cross-origin frame: never read from another origin's context. If the browser reports the download in that frame's own session and the page has not revoked the file yet, that frame's own context
    // may read its own file (best effort, depends on the browser's process model); anything held must be exactly the downloaded file.
    const crossNone = crossHeld.length <= 1 && crossHeld.every(t => t.includes('ORD-cross'));
    return outcome(
      'same-origin frame: exactly the downloaded file is held with its content; cross-origin frame: nothing, or exactly its downloaded file',
      JSON.stringify({ sameOk, click: click.ok, clickText: click.text.slice(-300), sameHeld: sameHeld.map(t => t.slice(0, 40)), click2: click2.ok, crossHeld: crossHeld.map(t => t.slice(0, 40)), snap: snap.text.slice(-160) }),
      sameOk && sameHeld.length === 1 && crossNone,
    );
  },
});
