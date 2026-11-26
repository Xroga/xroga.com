// A control asked for by the wrong role, and a ref the page has replaced: the error names what is there now, so the next call is aimed at a real control.
// Seen in a competitor's run: a locator for a heading "Drafts" that matched nothing while the page had a "Drafts" link; it waited out its timeout and tried again.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

const textOf = (r: { text?: string }) => String(r.text ?? '');

defineScenario({
  id: 'S3-role-mismatch-names-the-real-control',
  set: 'C',
  title: 'click a heading "Drafts" that does not exist while the page has a link "Drafts 4": the error names the link at once, and its ref works',
  covers: 'a role/name that matches nothing returns the nearest real controls (same name under another role, or a name that contains it) with usable refs, in well under a second',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-role-mismatch.html`);
    await ctx.call('snapshot');
    const started = Date.now();
    const miss = await ctx.call('click', { target: { role: 'heading', name: 'Drafts' } });
    const ms = Date.now() - started;
    const ref = /\[(\w+)\] link «Drafts 4»/.exec(textOf(miss))?.[1];
    const hit = ref ? await ctx.call('click', { target: { ref } }) : undefined;
    const after = JSON.stringify(await ctx.call('read', {}));
    return outcome(
      'NO_MATCH naming [ref] link «Drafts 4» in under 1.5 s, then the ref opens the folder',
      `${textOf(miss).slice(0, 260)} | ${ms} ms | ${hit ? 'clicked' : 'no ref'} | ${/Drafts opened/.test(after) ? 'opened' : 'not opened'}`,
      /NO_MATCH/.test(textOf(miss)) && !!ref && ms < 1500 && /Drafts opened/.test(after),
    );
  },
});

defineScenario({
  id: 'S3-replaced-ref-names-the-new-one',
  set: 'C',
  title: 'click a Save ref after the page re-rendered that button: refused, with the new Save named and usable',
  covers: 'a ref the page replaced is still refused (nothing is clicked on a guess), and the error offers the matching controls now in the page',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-rerender.html`);
    const snap = textOf(await ctx.call('snapshot'));
    const refOf = (pattern: RegExp) => /\[(\w+)\]/.exec(snap.split('\n').find(l => pattern.test(l)) ?? '')?.[1] ?? 'none';
    const save = refOf(/button "Save"/);
    const again = refOf(/button "Re-render"/);
    await ctx.call('click', { target: { ref: again } });
    const stale = await ctx.call('click', { target: { ref: save } });
    const fresh = /Now in the page: \[(\w+)\] button «Save»/.exec(textOf(stale))?.[1];
    const used = fresh ? await ctx.call('click', { target: { ref: fresh } }) : undefined;
    const after = JSON.stringify(await ctx.call('read', {}));
    return outcome(
      'the old ref refused (nothing saved by it), the error names the new Save, and its ref saves',
      `${textOf(stale).slice(0, 300)} | ${used ? 'used ' + fresh : 'no candidate'} | ${/Saved/.test(after) ? 'saved' : 'not saved'}`,
      !!fresh && fresh !== save && /Saved/.test(after) && /error/.test(textOf(stale)),
    );
  },
});
