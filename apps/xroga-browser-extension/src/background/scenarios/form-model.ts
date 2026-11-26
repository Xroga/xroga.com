// `form_model`: a whole form read in one call, with required flags, current values, the choices of a select and validation messages; secrets stay hidden.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-form-model',
  set: 'C',
  title: 'form_model lists every visible field with required, value, options and errors, hides the password, skips hidden and invisible forms, and can be scoped',
  covers: 'one call replaces a per-field inspection; the password value is never shown; a scope narrows to a named group',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-form-model.html`);
    await ctx.call('snapshot');
    const all = await ctx.call('form_model', {});
    const scoped = await ctx.call('form_model', { scope: 'Notifications' });
    const none = await ctx.call('form_model', { scope: 'No such form' });
    const t = all.text;
    return outcome(
      'six fields with the name marked required and empty, the country options and Germany selected, the password hidden, the invalid email flagged; the scope shows only the two checkboxes',
      JSON.stringify({ all: t.slice(0, 900), scoped: scoped.text.slice(0, 300), none: none.text.slice(0, 120) }),
      all.ok &&
        /6 fields/.test(t) &&
        /textbox "Full name" \*required empty/.test(t) &&
        /combobox "Country" = "Germany" options \[United Kingdom \| Germany \| France\]/.test(t) &&
        /"Password".*\(hidden\)/.test(t) && !/hunter2/.test(t) &&
        /\[Notifications\] \d+\. checkbox "Weekly digest" checked/.test(t) &&
        /ERROR/.test(t) && !/Card note/.test(t) && !/csrf/.test(t) &&
        /2 fields in "Notifications"/.test(scoped.text) && !/Full name/.test(scoped.text) &&
        /no fields/.test(none.text),
    );
  },
});
