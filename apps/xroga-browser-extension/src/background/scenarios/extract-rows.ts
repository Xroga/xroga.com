// `extract_rows`: tables, an ARIA grid that states more rows than it holds, and a result list come back as rows with column names, links and coverage; navigation lists are not rows.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-extract-rows',
  set: 'C',
  title: 'extract_rows reads a table with a link and a merged cell, an ARIA grid with rows still to load and a result list, and ignores the navigation list',
  covers: 'column names, rows, the link of a cell, merged-cell count, the stated total of a grid, scoping by name, no table found',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-extract-rows.html`);
    await ctx.call('snapshot');
    const all = await ctx.call('extract_rows', {});
    const orders = await ctx.call('extract_rows', { scope: 'Orders' });
    const none = await ctx.call('extract_rows', { scope: 'No such region' });
    const t = all.text;
    return outcome(
      'four tables: leads with a link and a merged cell, orders with 500 stated, results as a list, a directory of cards; the navigation list is left out; a scope narrows; a missing scope says so',
      JSON.stringify({ all: t.slice(0, 1400), orders: orders.text.slice(0, 400), none: none.text.slice(0, 160) }),
      all.ok &&
        /4 tables/.test(t) &&
        /"Leads" \(table, 3 columns, 3 rows/.test(t) &&
        /Company \| Site \| Score/.test(t) &&
        /1 merged cell/.test(t) &&
        /Orders" \(grid, 2 columns, 2 rows, the page states 499 in all.*MORE ROWS BELOW/.test(t) &&
        /A-1 \| \$10/.test(t) &&
        /list, 1 column, 3 rows/.test(t) &&
        /First search result/.test(t) &&
        /list, 2 columns, 4 rows/.test(t) && /Dental clinic 1 \| Dental clinic 1 Family dentist/.test(t) &&
        !/Home page link/.test(t) &&
        /1 table in "Orders"/.test(orders.text) && !/Orbit Labs/.test(orders.text) &&
        /no table, grid or list with rows in a region named "No such region"/.test(none.text),
    );
  },
});

defineScenario({
  id: 'S3-extract-cards',
  set: 'C',
  title: 'extract_rows reads repeated cards by the selectors the model names, with each card\'s link and an attribute',
  covers: 'cards + fields: columns named by the caller, text per field, link of a field, selector@attr, an unknown selector gives an empty cell, a selector that matches nothing says so',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-extract-rows.html`);
    await ctx.call('snapshot');
    const got = await ctx.call('extract_rows', { cards: '#dir .card', fields: { name: 'h3', about: 'p', url: 'a@href', missing: '.nope' } });
    const none = await ctx.call('extract_rows', { cards: '.no-such-card', fields: { name: 'h3' } });
    const t = got.text;
    return outcome(
      'four cards with name, about, url and an empty column; a selector that matches nothing says so',
      JSON.stringify({ got: t.slice(0, 700), none: none.text.slice(0, 160) }),
      got.ok && /1 table/.test(t) && /name \| about \| url \| missing/.test(t) && /Dental clinic 1 \| Family dentist in Leeds/.test(t) && /https:\/\/dir\.example\.test\/1/.test(t) && /4 rows/.test(t) && /no table, grid or list with rows/.test(none.text),
    );
  },
});
