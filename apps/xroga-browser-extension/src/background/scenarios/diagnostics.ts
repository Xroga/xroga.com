// `diagnostics`: a page that says "Saved!" while its request failed. The model cannot see the failure in the page text; the tool shows the request and the error.
// Tool idea from OpenSidekick (esterhuizen/opensidekick @ 6f11eeea, MIT, read_console / read_network).
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-diagnostics',
  set: 'C',
  title: 'a misleading "Saved!" is shown to be a failed request by diagnostics; the query string and the page text are kept out',
  covers: 'recording starts on first use; the second call lists the 404 and the console error; the query string is not shown',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-misleading.html`);
    await ctx.call('snapshot');
    const first = await ctx.call('diagnostics', {});
    const click = await ctx.call('click', { target: { role: 'button', name: 'Save profile' } });
    await ctx.call('wait', { text: 'Saved!', timeoutMs: 3000 });
    const second = await ctx.call('diagnostics', { onlyProblems: true });
    const text = second.text;
    return outcome(
      'first call says recording started; after the click the 404 request and console error appear without the query value',
      JSON.stringify({ first: first.text.slice(0, 80), click: click.ok, clickText: click.text.slice(-420), second: text.slice(0, 400) }),
      first.ok &&
        /recording started/.test(first.text) &&
        click.ok &&
        /POST .*\/api\/profile-missing\?… → 404/.test(text) &&
        /save failed with status 404/.test(text) &&
        !/SECRETVALUE123/.test(text),
    );
  },
});

defineScenario({
  id: 'S3-request-status',
  set: 'C',
  title: 'the receipt of a click names a request the server refused, without the model asking for diagnostics',
  covers: 'the action receipt carries the status of the requests the action started, so a misleading "Saved!" is contradicted in the same turn',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-misleading2.html`);
    await ctx.call('snapshot');
    const click = await ctx.call('click', { target: { role: 'button', name: 'Subscribe' } });
    return outcome(
      'the click receipt shows POST ... → 404',
      click.text.slice(-300),
      click.ok && /request: POST .*subscribe-endpoint-gone.*→ 404/.test(click.text) && !/ABCDEF/.test(click.text),
    );
  },
});
