// `web_search`: the results of a results page in one call, in a background tab that is closed again; the session's tab is left as it was; a check page is reported, not bypassed.
import { engineOverride } from '@src/browser-control/core/tools/web-search';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-web-search',
  set: 'C',
  title: 'web_search reads organic results (not the advert), unwraps the engine redirect, leaves no tab behind and reports a human check without bypassing it',
  covers: 'duckduckgo and google result layouts, redirect unwrapping, the session tab restored, the tab closed, a blocked page',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-effects.html`);
    await ctx.call('snapshot');
    const before = await ctx.call('tabs', { action: 'list' });
    engineOverride.duckduckgo = q => `${FIXTURE_ORIGIN}/c-search-ddg.html?q=${encodeURIComponent(q)}`;
    engineOverride.google = q => `${FIXTURE_ORIGIN}/c-search-google.html?q=${encodeURIComponent(q)}`;
    engineOverride.bing = q => `${FIXTURE_ORIGIN}/c-search-blocked.html?q=${encodeURIComponent(q)}`;
    try {
      const ddg = await ctx.call('web_search', { query: 'seo agency leeds' });
      const google = await ctx.call('web_search', { query: 'seo agency leeds', engine: 'google', limit: 1 });
      const blocked = await ctx.call('web_search', { query: 'seo agency leeds', engine: 'bing' });
      const after = await ctx.call('tabs', { action: 'list' });
      const t = ddg.text;
      return outcome(
        'three organic results with the redirect unwrapped and no advert; one google result under the limit; a bing check page reported; the same tabs before and after',
        JSON.stringify({ ddg: t.slice(0, 700), google: google.text.slice(0, 300), blocked: blocked.text.slice(0, 260), before: before.text.slice(0, 200), after: after.text.slice(0, 200) }),
        ddg.ok &&
          /3 results/.test(t) &&
          /1\. Leeds SEO Agency\n\s+https:\/\/example\.org\/seo-agency\n\s+We help local firms rank/.test(t) &&
          /https:\/\/example\.net\/clients/.test(t) &&
          !/Sponsored|ad\.example/.test(t) &&
          google.ok && /1 result/.test(google.text) && /First organic result/.test(google.text) && !/Second organic/.test(google.text) &&
          /asked for a human check/.test(blocked.text) && /not bypassed/.test(blocked.text) &&
          before.text === after.text,
      );
    } finally {
      delete engineOverride.duckduckgo;
      delete engineOverride.google;
      delete engineOverride.bing;
    }
  },
});
