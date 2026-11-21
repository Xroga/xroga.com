// Native date and time inputs: the snapshot shows each control once (not its Month, Day, Year or Hour segments), and one fill_form sets all of them.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-native-date-time',
  set: 'C',
  title: 'date, time and date-time inputs are single controls: no segment spinbuttons, and a whole value sets each',
  covers: 'the browser-internal segments of a native date or time input are not listed, so a value goes to the control and not to one segment',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-date.html`);
    const snap = await ctx.call('snapshot', { mode: 'all' });
    const segments = /spinbutton/i.test(snap.text);
    const fill = await ctx.call('fill_form', {
      fields: [
        { target: { role: 'date', name: 'Day' }, value: '2026-12-03' },
        { target: { role: 'inputTime', name: 'Start' }, value: '14:00' },
      ],
    });
    const read = await ctx.call('read', { format: 'text' });
    return outcome(
      'no spinbutton segments in the snapshot; both values set; the page reports 2026-12-03 and 14:00',
      JSON.stringify({ segments, snap: snap.text.slice(-260), fill: fill.ok, err: fill.error?.message?.slice(0, 160), read: read.text.slice(-200) }),
      !segments && fill.ok && /2026-12-03/.test(read.text) && /14:00/.test(read.text),
    );
  },
});
