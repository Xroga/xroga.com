// Postconditions that count: "the list has this many rows" and "a row with this name is there", checked after a click on a real page.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

const post = (r: { receipt?: { postcondition?: { status: string; detail?: string } } }) => r.receipt?.postcondition;

defineScenario({
  id: 'S3-expect-count',
  set: 'C',
  title: 'click "Add a row" with a count postcondition, met and unmet, and an exists postcondition',
  covers: 'count and exists are checked on a fresh look at the whole page, and a wrong expectation says what the page had',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-effects.html`);
    await ctx.call('snapshot');
    const add = { target: { role: 'button', name: 'Add a row' } };
    const first = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', equals: 1 } } });
    const second = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', equals: 1 } } });
    const third = await ctx.call('click', { ...add, expect: { count: { role: 'listitem', atLeast: 3, atMost: 3 }, exists: { role: 'listitem', name: 'Row 3' } } });
    const fourth = await ctx.call('click', { ...add, expect: { exists: { role: 'listitem', name: 'Row 99' } } });
    const p = [post(first), post(second), post(third), post(fourth)];
    const met = (i: number) => p[i]?.status === 'met';
    const unmetWith = (i: number, text: string) => p[i]?.status === 'unmet' && (p[i]?.detail ?? '').includes(text);
    return outcome(
      'row 1 met, row 2 unmet with "the page has 2 listitem, not 1", row 3 met by count and exists, row 4 unmet with "no listitem"',
      JSON.stringify(p),
      met(0) && unmetWith(1, 'the page has 2 listitem, not 1') && met(2) && unmetWith(3, 'there is no listitem "Row 99"'),
    );
  },
});
