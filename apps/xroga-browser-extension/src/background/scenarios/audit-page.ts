// `audit_page`: on-page SEO, accessibility basics and speed of the open page in one call, with findings worst first.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-audit-page',
  set: 'C',
  title: 'audit_page reads title, description, headings, alt text, structured data, unlabelled fields and speed, and lists the findings worst first',
  covers: 'one call per page replaces reading the source; missing alt, description, viewport, a second h1, an unlabelled field and a nameless button are all found',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-audit-page.html`);
    const r = await ctx.call('audit_page', {});
    const t = r.text;
    return outcome(
      'title read, no description, two h1, two images without alt, Dentist structured data, one unlabelled field, one nameless button, no viewport; problems are listed before warnings',
      t.slice(0, 1800),
      r.ok &&
        /title \(\d+\): "Brightpath Dental, Leeds city centre dentist"/.test(t) &&
        /PROBLEM: No meta description/.test(t) &&
        /2 <h1> headings/.test(t) &&
        /PROBLEM: 2 of 3 images have no alt/.test(t) &&
        /structured data: Dentist, PostalAddress/.test(t) &&
        /PROBLEM: 1 form fields have no label/.test(t) &&
        /PROBLEM: 1 buttons have no accessible name/.test(t) &&
        /PROBLEM: No viewport/.test(t) &&
        /speed: TTFB/.test(t) &&
        t.indexOf('PROBLEM') < t.indexOf('warning:'),
    );
  },
});
