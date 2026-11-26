// Generated variations of one form task: the same generic procedure (wait for the page, dismiss a blocking dialog if present, fill by role and name,
// save once, read the saved state) must succeed on every layout. Seeds change field order, button position, delayed rendering, an overlay, a duplicate
// "Save" link and page zoom. The check is the page's own state (one save, the typed values), never a tool receipt.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const text = (tabId: number, id: string) => evaluate<string>(tabId, undefined, `document.getElementById('${id}').textContent`);

defineScenario({
  id: 'VAR-1-form-layout-variants',
  set: 'C',
  title: 'one generic form procedure across generated layouts',
  covers: 'role and name targets survive moved controls, shuffled fields, delayed rendering, a blocking overlay, a duplicate label and zoom; exactly one save, correct values',
  async run(ctx) {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const rows: Array<Record<string, unknown>> = [];
    let allPass = true;
    for (const seed of seeds) {
      const tabId = await ctx.open(`${FIXTURE_ORIGIN}/var-form.html?seed=${seed}`);
      const step = async (label: string, fn: () => Promise<Result>) => {
        const r = await fn();
        if (!r.ok) throw new Error(`seed ${seed} ${label}: ${r.error?.message ?? r.text}`);
        return r;
      };
      let pass = false;
      let why = '';
      try {
        await step('wait for the form', () => ctx.call('wait', { text: 'Contact', timeoutMs: 6000 }));
        // A blocking dialog is dismissed only when it is there.
        const dialog = await ctx.call('wait', { text: 'We use cookies', timeoutMs: 1 });
        if (dialog.ok) await step('dismiss the dialog', () => ctx.call('click', { target: { role: 'button', name: 'Close' } }));
        await step('fill', () => ctx.call('fill_form', {
          fields: [
            { target: { role: 'textbox', name: 'Name' }, value: 'Ada Lovelace' },
            { target: { role: 'textbox', name: 'Email' }, value: 'ada@example.test' },
            { target: { role: 'textbox', name: 'Phone' }, value: '555-0100' },
            { target: { role: 'textbox', name: 'Company' }, value: 'Analytical' },
          ],
        }));
        await step('save', () => ctx.call('click', { target: { role: 'button', name: 'Save' } }));
        await sleep(200);
        const saves = await text(tabId, 'count');
        const saved = await text(tabId, 'result');
        pass = saves === 'saves: 1' && saved === 'saved: Ada Lovelace|ada@example.test|555-0100|Analytical';
        why = `${saves}; ${saved}`;
      } catch (error) {
        why = error instanceof Error ? error.message : String(error);
      }
      rows.push({ seed, pass, why });
      if (!pass) allPass = false;
    }
    return outcome(
      'every generated layout ends with exactly one save and the typed values',
      JSON.stringify(rows),
      allPass,
    );
  },
});
